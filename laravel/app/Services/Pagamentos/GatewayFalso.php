<?php

namespace App\Services\Pagamentos;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * Mercado Pago simulado (docs/27; porta de src/server/pagamentos/falso.ts), para os testes e o ambiente sem credenciais
 * (PAGAMENTO_GATEWAY=falso). As orders ficam no cache (cada requisição do PHP é um processo novo) e a resposta imita a
 * API, inclusive a idempotência. `simular*` faz o papel da cliente.
 */
class GatewayFalso implements Gateway
{
    private const CHAVE = 'pagamento-falso';

    /** O que o sistema mandou ao "Mercado Pago" (para os testes conferirem pagador, fatura, valores). @var list<array<string, mixed>> */
    public array $requisicoes = [];

    public ?string $falharProxima = null;

    public function nome(): string
    {
        return 'falso';
    }

    /** @return array{orders: array<string, array<string, mixed>>, chaves: array<string, string>} */
    private function estado(): array
    {
        return Cache::get(self::CHAVE, ['orders' => [], 'chaves' => []]);
    }

    /** @param array{orders: array<string, array<string, mixed>>, chaves: array<string, string>} $e */
    private function gravar(array $e): void
    {
        Cache::put(self::CHAVE, $e, now()->addDays(7));
    }

    private function buscar(string $orderId): SituacaoOrder
    {
        $o = $this->estado()['orders'][$orderId] ?? null;
        if (! $o) {
            throw new ErroGateway('Mercado Pago: order_not_found', 'order_not_found', true, 404);
        }

        return SituacaoOrder::deArray($o);
    }

    private function salvar(SituacaoOrder $o): SituacaoOrder
    {
        $e = $this->estado();
        $e['orders'][$o->orderId] = $o->paraArray();
        $this->gravar($e);

        return $o;
    }

    /** @param array<string, mixed> $base */
    private function nova(string $chave, array $base): SituacaoOrder
    {
        $e = $this->estado();
        if (isset($e['chaves'][$chave])) {
            return $this->buscar($e['chaves'][$chave]);
        }
        $id = 'ORD'.strtoupper(Str::random(24));
        $o = new SituacaoOrder(...['orderId' => $id, 'status' => 'action_required', 'statusDetalhe' => 'waiting_payment', 'moeda' => 'BRL', 'pagamentoId' => 'PAY'.strtoupper(Str::random(24)), ...$base]);
        $e['orders'][$id] = $o->paraArray();
        $e['chaves'][$chave] = $id;
        $this->gravar($e);

        return $o;
    }

    private function talvezFalhar(): void
    {
        if ($this->falharProxima) {
            $m = $this->falharProxima;
            $this->falharProxima = null;
            throw new ErroGateway($m, 'falso');
        }
    }

    public function criarPix(array $p): SituacaoOrder
    {
        $this->requisicoes[] = $p;
        $this->talvezFalhar();

        return $this->nova($p['chave'], [
            'referencia' => $p['referencia'], 'valorTotal' => $p['valor'], 'statusDetalhe' => 'waiting_transfer', 'meio' => 'pix', 'tipoMeio' => 'bank_transfer',
            'pixCopiaECola' => '00020126580014br.gov.bcb.pix0136'.$p['referencia'].'520400005303986540'.number_format($p['valor'], 2, '.', '').'5802BR6304TEST',
            'expiraEm' => CarbonImmutable::now()->addMinutes($p['minutos']),
        ]);
    }

    public function criarCheckout(array $p): SituacaoOrder
    {
        $this->requisicoes[] = $p;
        $this->talvezFalhar();
        $o = $this->nova($p['chave'], ['referencia' => $p['referencia'], 'valorTotal' => $p['valor'], 'status' => 'created', 'statusDetalhe' => 'created', 'expiraEm' => CarbonImmutable::now()->addMinutes($p['minutos'])]);
        $o->checkoutUrl = "https://www.mercadopago.com.br/checkout/v1/redirect?order_id={$o->orderId}";

        return $this->salvar($o);
    }

    public function consultar(string $orderId): SituacaoOrder
    {
        return $this->buscar($orderId);
    }

    public function cancelar(string $orderId, string $chave): SituacaoOrder
    {
        $o = $this->buscar($orderId);
        if (! in_array($o->status, ['created', 'action_required'], true)) {
            throw new ErroGateway('Mercado Pago: cannot_cancel_order', 'cannot_cancel_order', true, 409);
        }
        $o->status = 'canceled';
        $o->statusDetalhe = 'canceled_transaction';

        return $this->salvar($o);
    }

    public function estornar(string $orderId, string $chave, ?array $parcial = null): SituacaoOrder
    {
        $o = $this->buscar($orderId);
        if ($o->status !== 'processed') {
            throw new ErroGateway('Mercado Pago: cannot_refund_order', 'cannot_refund_order', true, 409);
        }
        $pago = $o->valorPago ?? $o->valorTotal ?? 0;
        $valor = $parcial ? $parcial['valor'] : $pago - $o->valorEstornado;
        if ($valor <= 0 || $o->valorEstornado + $valor > $pago + 0.001) {
            throw new ErroGateway('Mercado Pago: refund_amount_exceeds', 'refund_amount_exceeds', true, 400);
        }
        $o->valorEstornado = round(($o->valorEstornado + $valor) * 100) / 100;
        if ($o->valorEstornado >= $pago - 0.001) {
            $o->status = 'refunded';
            $o->statusDetalhe = 'refunded';
        } else {
            $o->statusDetalhe = 'partially_refunded';
        }

        return $this->salvar($o);
    }

    public function testarConexao(): array
    {
        return ['id' => 'simulado', 'apelido' => 'MERCADO PAGO SIMULADO', 'pais' => 'MLB', 'teste' => true];
    }

    /** @param array{meio?: string, tipoMeio?: string, parcelas?: int, valor?: float, total?: float, taxa?: float} $p */
    public function simularPagamento(string $orderId, array $p = []): SituacaoOrder
    {
        $o = $this->buscar($orderId);
        $o->status = 'processed';
        $o->statusDetalhe = 'accredited';
        if (isset($p['total'])) {
            $o->valorTotal = $p['total'];
        }
        $o->valorPago = $p['valor'] ?? $o->valorTotal;
        $o->meio = $p['meio'] ?? $o->meio ?? 'visa';
        $o->tipoMeio = $p['tipoMeio'] ?? $o->tipoMeio ?? 'credit_card';
        $o->parcelas = $p['parcelas'] ?? ($o->meio === 'pix' ? 1 : ($o->parcelas ?? 1));
        $o->taxa = $p['taxa'] ?? round(($o->valorPago ?? 0) * ($o->meio === 'pix' ? 0.0099 : 0.0498) * 100) / 100;

        return $this->salvar($o);
    }

    public function simularSituacao(string $orderId, string $status, string $detalhe): SituacaoOrder
    {
        $o = $this->buscar($orderId);
        $o->status = $status;
        $o->statusDetalhe = $detalhe;

        return $this->salvar($o);
    }

    /** Some com a order (como se tivesse sido criada com outra credencial). */
    public function esquecer(string $orderId): void
    {
        $e = $this->estado();
        unset($e['orders'][$orderId]);
        $this->gravar($e);
    }

    public function ultima(): ?SituacaoOrder
    {
        $o = $this->estado()['orders'];

        return $o ? SituacaoOrder::deArray(end($o)) : null;
    }

    public function limpar(): void
    {
        $this->requisicoes = [];
        Cache::forget(self::CHAVE);
    }
}
