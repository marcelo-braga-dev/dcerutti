<?php

namespace App\Services\Pagamentos;

use App\Support\Pagamento;
use Carbon\CarbonImmutable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

/**
 * Cliente da API Orders do Mercado Pago (docs/27; porta de src/server/pagamentos/mercadopago.ts), sem SDK:
 *   POST /v1/orders                 cria (Pix: processing_mode automatic; Checkout Pro: manual, devolve checkout_url)
 *   GET  /v1/orders/{id}            consulta (fonte da verdade, também depois de cada aviso)
 *   POST /v1/orders/{id}/cancel     cancela enquanto ninguém pagou
 *   POST /v1/orders/{id}/refund     estorna (corpo vazio = total; com transactions = parcial)
 * Toda escrita leva X-Idempotency-Key. Timeout de 10 s; nova tentativa só em 429/5xx/rede. O log nunca leva o token.
 */
class GatewayMercadoPago implements Gateway
{
    private const TENTATIVAS = 3;

    public function nome(): string
    {
        return 'mercadopago';
    }

    /** Tradução da resposta da API para o formato do sistema. @param array<string, mixed> $o */
    public static function situacaoDaOrder(array $o): SituacaoOrder
    {
        $pagamentos = $o['transactions']['payments'] ?? [];
        // A tentativa que vale: a aprovada, se houver; senão a mais recente.
        $pag = collect($pagamentos)->firstWhere('status', 'processed') ?? (end($pagamentos) ?: null);
        $estornado = collect($o['transactions']['refunds'] ?? [])->filter(fn ($r) => empty($r['status']) || in_array((string) $r['status'], ['processed', 'approved', 'refunded'], true))
            ->sum(fn ($r) => Pagamento::lerValorMp($r['amount'] ?? null) ?? 0);
        $expira = null;
        if (! empty($pag['date_of_expiration'])) {
            try {
                $expira = CarbonImmutable::parse($pag['date_of_expiration']);
            } catch (\Throwable) {
                $expira = null;
            }
        }

        return new SituacaoOrder(
            orderId: (string) $o['id'], status: (string) ($o['status'] ?? ''), statusDetalhe: (string) ($o['status_detail'] ?? ''),
            referencia: $o['external_reference'] ?? null, valorTotal: Pagamento::lerValorMp($o['total_amount'] ?? null),
            valorPago: Pagamento::lerValorMp($o['total_paid_amount'] ?? null) ?? (($pag['status'] ?? null) === 'processed' ? Pagamento::lerValorMp($pag['amount'] ?? null) : null),
            moeda: $o['currency'] ?? null, pagamentoId: isset($pag['id']) ? (string) $pag['id'] : null,
            meio: $pag['payment_method']['id'] ?? null, tipoMeio: $pag['payment_method']['type'] ?? null,
            parcelas: isset($pag['payment_method']['installments']) ? (int) $pag['payment_method']['installments'] : null,
            taxa: Pagamento::lerValorMp($pag['taxes_amount'] ?? null), valorEstornado: round($estornado * 100) / 100,
            pixCopiaECola: $pag['payment_method']['qr_code'] ?? null, checkoutUrl: $o['checkout_url'] ?? null, expiraEm: $expira,
        );
    }

    /** Mensagem da API sem dados sensíveis: só o código e o texto do erro. */
    private static function erroDaApi(int $http, mixed $corpo): ErroGateway
    {
        $c = is_array($corpo) ? $corpo : [];
        $primeiro = $c['errors'][0] ?? null;
        $codigo = $primeiro['code'] ?? $c['error'] ?? null;
        $texto = $primeiro['message'] ?? $c['message'] ?? "HTTP {$http}";

        return new ErroGateway("Mercado Pago: {$texto}", $codigo, $http >= 400 && $http < 500 && $http !== 429, $http);
    }

    private function chamar(string $metodo, string $caminho, ?array $corpo = null, ?string $idempotencia = null): mixed
    {
        $token = (string) config('services.pagamento.token');
        if ($token === '') {
            throw new ErroGateway('Pagamento online sem credenciais: defina MP_ACCESS_TOKEN no servidor.', 'sem_credenciais', true);
        }
        $url = rtrim((string) config('services.pagamento.api'), '/').$caminho;
        $ultimo = null;
        for ($t = 1; $t <= self::TENTATIVAS; $t++) {
            try {
                $req = Http::withToken($token)->acceptJson()->timeout(10)->withHeaders($idempotencia ? ['X-Idempotency-Key' => $idempotencia] : []);
                $r = $metodo === 'GET' ? $req->get($url) : $req->withBody($corpo === null ? '' : ($corpo === [] ? '{}' : json_encode($corpo, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)), 'application/json')->post($url);
                if ($r->successful()) {
                    return $r->json();
                }
                $erro = self::erroDaApi($r->status(), $r->json());
                if ($erro->definitivo || $t === self::TENTATIVAS) {
                    throw $erro;
                }
                $ultimo = $erro;
                $depois = (int) $r->header('Retry-After');
                usleep(($depois > 0 ? min($depois, 5) * 1000 : 400 * $t) * 1000);
            } catch (ConnectionException) {
                if ($t === self::TENTATIVAS) {
                    throw new ErroGateway('Mercado Pago fora do ar ou sem resposta. Tente de novo em instantes.', 'rede');
                }
                usleep(400 * $t * 1000);
            }
        }
        throw $ultimo ?? new ErroGateway('Falha ao falar com o Mercado Pago.');
    }

    private function order(string $metodo, string $caminho, ?array $corpo = null, ?string $idempotencia = null): SituacaoOrder
    {
        $r = $this->chamar($metodo, $caminho, $corpo, $idempotencia);
        if (! is_array($r) || ! isset($r['id'])) {
            throw new ErroGateway('Resposta inesperada do Mercado Pago.', 'resposta_invalida');
        }

        return self::situacaoDaOrder($r);
    }

    private static function duracao(int $min): string
    {
        return 'PT'.max(1, $min).'M';
    }

    /** @param array{email: ?string, nome: string, telefone?: ?string, cpf?: ?string} $p @return array<string, mixed> */
    private static function pagador(array $p): array
    {
        $partes = preg_split('/\s+/', trim($p['nome'])) ?: [];
        $cpf = preg_replace('/\D/', '', (string) ($p['cpf'] ?? ''));
        $tel = preg_replace('/\D/', '', (string) ($p['telefone'] ?? ''));
        $sobrenome = mb_substr(implode(' ', array_slice($partes, 1)), 0, 60);

        return array_filter([
            'email' => $p['email'], 'first_name' => mb_substr($partes[0] ?? '', 0, 40) ?: 'Cliente', 'last_name' => $sobrenome ?: null,
            'phone' => strlen($tel) >= 10 && strlen($tel) <= 11 ? ['area_code' => substr($tel, 0, 2), 'number' => substr($tel, 2)] : null,
            'identification' => strlen($cpf) === 11 ? ['type' => 'CPF', 'number' => $cpf] : null,
        ], fn ($v) => $v !== null);
    }

    public function criarPix(array $p): SituacaoOrder
    {
        $v = Pagamento::valorMp($p['valor']);

        return $this->order('POST', '/v1/orders', array_filter([
            'type' => 'online', 'processing_mode' => 'automatic', 'external_reference' => $p['referencia'], 'total_amount' => $v,
            'description' => mb_substr($p['descricao'], 0, 150), 'payer' => self::pagador($p['pagador']),
            'transactions' => ['payments' => [['amount' => $v, 'payment_method' => ['id' => 'pix', 'type' => 'bank_transfer'], 'expiration_time' => self::duracao($p['minutos'])]]],
            'config' => $p['urlAviso'] ? ['online' => ['callback_url' => $p['urlAviso']]] : null,
        ]), $p['chave']);
    }

    public function criarCheckout(array $p): SituacaoOrder
    {
        $online = ['success_url' => $p['urls']['sucesso'], 'failure_url' => $p['urls']['falha'], 'pending_url' => $p['urls']['pendente'], 'auto_return' => 'all'];
        if ($p['urlAviso']) {
            $online['callback_url'] = $p['urlAviso'];
        }
        $meio = ['max_installments' => max(1, $p['parcelasMax'])];
        if ($p['semJurosAte'] > 1) {
            $meio['installments'] = ['interest_free' => ['type' => 'range', 'values' => [2, min($p['semJurosAte'], $p['parcelasMax'])]]];
        }

        return $this->order('POST', '/v1/orders', array_filter([
            'type' => 'online', 'processing_mode' => 'manual', 'external_reference' => $p['referencia'],
            // Precisa ser igual à soma dos itens: um item só, "Pedido PED-…", com o valor já com cupom e frete.
            'total_amount' => Pagamento::valorMp($p['valor']), 'description' => mb_substr($p['descricao'], 0, 150), 'expiration_time' => self::duracao($p['minutos']),
            'items' => array_map(fn ($i) => array_filter(['title' => mb_substr($i['titulo'], 0, 120), 'quantity' => $i['quantidade'], 'unit_price' => Pagamento::valorMp($i['preco']), 'external_code' => isset($i['codigo']) ? mb_substr($i['codigo'], 0, 40) : null]), $p['itens']),
            'payer' => $p['pagador']['email'] ? self::pagador($p['pagador']) : null,
            'config' => ['statement_descriptor' => $p['nomeNaFatura'], 'online' => $online, 'payment_method' => $meio],
        ]), $p['chave']);
    }

    public function consultar(string $orderId): SituacaoOrder
    {
        return $this->order('GET', '/v1/orders/'.rawurlencode($orderId));
    }

    public function cancelar(string $orderId, string $chave): SituacaoOrder
    {
        return $this->order('POST', '/v1/orders/'.rawurlencode($orderId).'/cancel', null, $chave);
    }

    public function estornar(string $orderId, string $chave, ?array $parcial = null): SituacaoOrder
    {
        $corpo = $parcial ? ['transactions' => [['id' => $parcial['pagamentoId'], 'amount' => Pagamento::valorMp($parcial['valor'])]]] : [];
        $this->chamar('POST', '/v1/orders/'.rawurlencode($orderId).'/refund', $corpo, $chave);

        // A resposta do estorno não traz tudo (meio, parcelas): consulta a order inteira.
        return $this->consultar($orderId);
    }

    public function testarConexao(): array
    {
        $r = $this->chamar('GET', '/users/me');
        if (! is_array($r) || ! isset($r['id'])) {
            throw new ErroGateway('Resposta inesperada do Mercado Pago ao conferir a conta.', 'resposta_invalida');
        }

        return ['id' => (string) $r['id'], 'apelido' => $r['nickname'] ?? null, 'pais' => $r['site_id'] ?? null, 'teste' => in_array('test_user', $r['tags'] ?? [], true)];
    }
}
