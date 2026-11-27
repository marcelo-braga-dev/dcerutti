<?php

namespace App\Services\Pagamentos;

use App\Enums\TipoNotificacao;
use App\Exceptions\ErroPagamento;
use App\Models\Cobranca;
use App\Models\EventoPagamento;
use App\Models\Pagamento as LinhaPagamento;
use App\Models\Pedido;
use App\Models\PedidoHistorico;
use App\Models\PedidoItem;
use App\Services\Catalogo;
use App\Services\Config;
use App\Services\Estoque;
use App\Services\Notificacoes;
use App\Services\Pedidos\Pedidos;
use App\Support\Dinheiro;
use App\Support\Links;
use App\Support\Pagamento;
use Illuminate\Database\QueryException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Cobranças do pagamento online (docs/27; porta de src/server/pagamentos/cobrancas.ts). ÚNICA porta de mudança de estado
 * de uma cobrança. Regras:
 *  - o valor vem sempre do banco (RP-01) e só se cobra com frete definido (RP-02);
 *  - compra pendente: a cobrança reserva as peças enquanto está aberta (RP-03);
 *  - uma cobrança aberta por pedido; abrir de novo reaproveita a que ainda vale (RP-04);
 *  - toda mudança vem de uma consulta à API e passa por `aplicarSituacao`, que trava a linha da cobrança;
 *  - divergência de valor, moeda ou referência não muda nada e avisa o gestor (RP-10).
 */
class Cobrancas
{
    /** Cobrança gravada e ainda sem resposta do Mercado Pago há menos que isso conta como "em andamento" (R-02). */
    private const EM_ANDAMENTO_S = 30;

    private const MARGEM_REAPROVEITAR_S = 180;

    public function __construct(private Config $config, private Estoque $estoque, private Catalogo $catalogo, private Notificacoes $notificacoes) {}

    private function gateway(): Gateway
    {
        return Modo::gateway();
    }

    /** @return array<string, mixed> */
    private function cfg(): array
    {
        return (array) $this->config->get('pagamentoOnline');
    }

    /** Valor a cobrar do pedido, a partir do banco. @return array{ok: bool, valor?: float, motivo?: string, precisaFrete?: bool} */
    public static function valorDoPedido(Pedido $p): array
    {
        return Pagamento::valorACobrar([
            'tipo' => $p->tipo->value, 'status' => $p->status->value, 'origem' => $p->origem->value, 'total' => (float) $p->total,
            'frete' => $p->frete === null ? null : (float) $p->frete, 'pagamentoSituacao' => $p->pagamentoSituacao->value, 'venda' => $p->venda ? (float) $p->venda->valor : null,
        ]);
    }

    /** @param array<string, mixed> $d */
    private static function evento(array $d): void
    {
        EventoPagamento::query()->create([
            'cobrancaId' => $d['cobrancaId'] ?? null, 'origem' => $d['origem'], 'tipo' => mb_substr($d['tipo'], 0, 60), 'mpOrderId' => $d['mpOrderId'] ?? null,
            'statusMp' => isset($d['statusMp']) ? mb_substr($d['statusMp'], 0, 60) : null, 'dados' => $d['dados'] ?? null, 'erro' => $d['erro'] ?? null,
            'requestId' => $d['requestId'] ?? null, 'processadoEm' => ($d['processado'] ?? true) ? now() : null,
        ]);
    }

    /** Reserva as peças; se uma faltar, devolve as já reservadas e responde false. @param Collection<int, \App\Models\PedidoItem> $itens */
    private function reservarTudo(Collection $itens): bool
    {
        $feitas = [];
        try {
            foreach ($itens as $i) {
                $this->estoque->reservar($i->varianteId, $i->quantidade);
                $feitas[] = $i;
            }

            return true;
        } catch (\Throwable) {
            foreach ($feitas as $i) {
                $this->estoque->liberarReserva($i->varianteId, $i->quantidade);
            }

            return false;
        }
    }

    /** @param Collection<int, PedidoItem> $itens */
    private function liberarTudo(Collection $itens): void
    {
        foreach ($itens as $i) {
            $this->estoque->liberarReserva($i->varianteId, $i->quantidade);
        }
    }

    private static function comPedido(): array
    {
        return ['venda:id,pedidoId,valor', 'cliente:id,email,cpf,userId', 'cliente.user:id,email', 'itens' => fn ($q) => $q->orderBy('id')];
    }

    // ---------- Criar ----------

    /**
     * Cria (ou reaproveita) a cobrança do pedido. `email`: o informado na página, quando a ficha não tem.
     *
     * @return array{id: string, metodo: string, status: string, valor: float, pixCopiaECola: ?string, checkoutUrl: ?string, expiraEm: ?string, reaproveitada: bool}
     */
    public function criar(string $pedidoId, string $metodo, ?string $criadaPorId, ?string $email, string $site): array
    {
        $cfg = $this->cfg();
        if (! $cfg['ligado']) {
            throw new ErroPagamento('O pagamento online está desligado.');
        }
        if ($metodo === 'pix' ? ! $cfg['pix'] : ! $cfg['cartao']) {
            throw new ErroPagamento($metodo === 'pix' ? 'O Pix online está desligado.' : 'O pagamento com cartão está desligado.');
        }
        if (! Modo::configurado()) {
            throw new ErroPagamento('O pagamento online ainda não foi configurado no servidor (credenciais do Mercado Pago).');
        }
        $minutos = (int) ($metodo === 'pix' ? $cfg['minutosPix'] : $cfg['minutosCheckout']);

        $preparo = DB::transaction(function () use ($pedidoId, $metodo, $criadaPorId, $email, $minutos) {
            $pedido = Pedido::query()->lockForUpdate()->with(self::comPedido())->find($pedidoId);
            if (! $pedido) {
                throw new ErroPagamento('Pedido não encontrado.');
            }
            $valor = self::valorDoPedido($pedido);
            if (! $valor['ok']) {
                throw new ErroPagamento($valor['motivo']);
            }
            if (Cobranca::query()->where('pedidoId', $pedido->id)->whereIn('status', Pagamento::PAGAS)->exists()) {
                throw new ErroPagamento('Este pedido já foi pago online.');
            }
            // RP-04: a aberta do mesmo meio, com o mesmo valor e tempo de sobra, é reaproveitada; as outras saem.
            $abertas = Cobranca::query()->where('pedidoId', $pedido->id)->whereIn('status', Pagamento::ATIVAS)->orderByDesc('criadaEm')->get();
            $serve = $abertas->first(fn (Cobranca $c) => $c->metodo->value === $metodo && $c->status->value === 'pendente' && $c->mpOrderId && abs((float) $c->valor - $valor['valor']) < 0.001
                && (! $c->expiraEm || $c->expiraEm->getTimestamp() - time() > self::MARGEM_REAPROVEITAR_S) && ($metodo === 'pix' ? (bool) $c->pixCopiaECola : (bool) $c->checkoutUrl));
            if ($serve) {
                return ['reaproveitada' => self::criada($serve, true)];
            }
            // R-02: outro clique acabou de gravar e está chamando o Mercado Pago: quem chama espera e tenta de novo.
            if ($abertas->contains(fn (Cobranca $c) => $c->status->value === 'criada' && ! $c->mpOrderId && $c->criadaEm->getTimestamp() > time() - self::EM_ANDAMENTO_S)) {
                throw new ErroCobrancaEmAndamento('Já estamos gerando o pagamento. Aguarde alguns segundos.');
            }
            $cancelar = [];
            $herdada = false;
            foreach ($abertas as $c) {
                // A reserva passa para a cobrança nova, sem soltar e prender de novo.
                $herdada = $herdada || $c->reservou;
                $c->update(['status' => 'cancelada', 'reservou' => false]);
                self::evento(['cobrancaId' => $c->id, 'origem' => 'acao', 'tipo' => 'substituida', 'mpOrderId' => $c->mpOrderId]);
                if ($c->mpOrderId) {
                    $cancelar[] = $c->mpOrderId;
                }
            }
            $email = trim(mb_strtolower((string) $email)) ?: ($pedido->cliente?->email ?: $pedido->cliente?->user?->email) ?: null;
            if ($metodo === 'pix' && ! $email) {
                throw new ErroPagamento('Informe um e-mail para gerar o Pix (o Mercado Pago exige).');
            }
            $pecas = $pedido->tipo->value === 'compra' && $pedido->status->value === 'pendente' ? $pedido->itens : collect();
            $reservou = $herdada && $pecas->isNotEmpty();
            if (! $reservou && $pecas->isNotEmpty()) {
                if (! $this->reservarTudo($pecas)) {
                    throw new ErroPagamento('Uma das peças do pedido acabou no estoque. Fale com a loja para trocar a peça antes de pagar.');
                }
                $reservou = true;
            }
            if ($herdada && $pecas->isEmpty()) {
                $this->liberarTudo($pedido->itens);
            }
            $chave = (string) Str::uuid();
            $nova = Cobranca::query()->create([
                'pedidoId' => $pedido->id, 'metodo' => $metodo, 'status' => 'criada', 'valor' => number_format($valor['valor'], 2, '.', ''), 'chave' => $chave,
                'reservou' => $reservou, 'expiraEm' => now()->addMinutes($minutos), 'criadaPorId' => $criadaPorId,
            ]);
            if (in_array($pedido->pagamentoSituacao->value, ['a_combinar', 'estornado'], true)) {
                $pedido->update(['pagamentoSituacao' => 'aguardando']);
            }
            self::evento(['cobrancaId' => $nova->id, 'origem' => 'acao', 'tipo' => 'criada', 'dados' => ['metodo' => $metodo, 'valor' => $valor['valor'], 'reservou' => $reservou, 'por' => $criadaPorId]]);

            return ['nova' => ['id' => $nova->id, 'chave' => $chave, 'valor' => $valor['valor'], 'pedido' => $pedido, 'email' => $email], 'cancelar' => $cancelar];
        });

        if (isset($preparo['reaproveitada'])) {
            return $preparo['reaproveitada'];
        }
        $this->catalogo->invalidar();
        $this->cancelarOrders($preparo['cancelar']);

        ['id' => $id, 'chave' => $chave, 'valor' => $valor, 'pedido' => $pedido, 'email' => $email] = $preparo['nova'];
        $urlAviso = str_starts_with($site, 'https://') ? rtrim($site, '/').'/api/pagamentos/mercadopago' : null;
        $descricao = ($pedido->tipo->value === 'condicional' ? 'Condicional' : 'Pedido')." {$pedido->codigo}";
        $pagador = ['nome' => $pedido->nomeCliente, 'telefone' => $pedido->telefoneCliente, 'cpf' => $pedido->cliente?->cpf];
        $n = $pedido->itens->count();
        try {
            $s = $metodo === 'pix'
                ? $this->gateway()->criarPix(['chave' => $chave, 'referencia' => $id, 'valor' => $valor, 'descricao' => $descricao, 'pagador' => [...$pagador, 'email' => $email], 'minutos' => $minutos, 'urlAviso' => $urlAviso])
                : $this->gateway()->criarCheckout([
                    'chave' => $chave, 'referencia' => $id, 'valor' => $valor, 'descricao' => $descricao, 'pagador' => [...$pagador, 'email' => $email], 'minutos' => $minutos, 'urlAviso' => $urlAviso,
                    'nomeNaFatura' => Pagamento::nomeNaFatura($this->config->nomeDaLoja()['nome']),
                    'itens' => [['titulo' => "{$descricao} · {$n} ".($n === 1 ? 'peça' : 'peças'), 'quantidade' => 1, 'preco' => $valor, 'codigo' => $pedido->codigo]],
                    'urls' => self::urlsDeRetorno($site, $pedido->codigo), 'parcelasMax' => (int) $this->cfg()['parcelasMax'], 'semJurosAte' => (int) $this->cfg()['parcelasSemJuros'],
                ]);
        } catch (\Throwable $e) {
            DB::transaction(function () use ($id, $pedido, $e) {
                $c = Cobranca::query()->lockForUpdate()->find($id);
                if ($c->reservou) {
                    $this->liberarTudo($pedido->itens);
                }
                $c->update(['status' => 'cancelada', 'reservou' => false]);
                self::evento(['cobrancaId' => $id, 'origem' => 'acao', 'tipo' => 'falha_criar', 'erro' => mb_substr($e->getMessage(), 0, 2000)]);
            });
            $this->catalogo->invalidar();
            Log::error('Pagamento: falha ao criar a cobrança no Mercado Pago', ['pedido' => $pedido->codigo, 'erro' => $e->getMessage()]);
            throw new ErroPagamento($e instanceof ErroGateway && $e->codigo === 'sem_credenciais' ? $e->getMessage() : 'Não foi possível gerar a cobrança agora. Tente de novo em instantes.');
        }

        Cobranca::query()->whereKey($id)->update(array_filter([
            'mpOrderId' => $s->orderId, 'pixCopiaECola' => $s->pixCopiaECola, 'checkoutUrl' => $s->checkoutUrl, 'statusMp' => mb_substr("{$s->status}/{$s->statusDetalhe}", 0, 60),
            'expiraEm' => $s->expiraEm,
        ], fn ($v) => $v !== null));
        $this->aplicarSituacao($id, $s, 'acao');

        return self::criada(Cobranca::query()->find($id), false);
    }

    private static function criada(Cobranca $c, bool $reaproveitada): array
    {
        return [
            'id' => $c->id, 'metodo' => $c->metodo->value, 'status' => $c->status->value, 'valor' => (float) $c->valor, 'pixCopiaECola' => $c->pixCopiaECola,
            'checkoutUrl' => $c->checkoutUrl, 'expiraEm' => $c->expiraEm?->toIso8601String(), 'reaproveitada' => $reaproveitada,
        ];
    }

    /** @return array{sucesso: string, falha: string, pendente: string} */
    public static function urlsDeRetorno(string $site, string $codigo): array
    {
        $base = rtrim($site, '/').'/pagar/'.rawurlencode(Links::chaveDoPagamento($codigo)).'/retorno';

        return ['sucesso' => "{$base}?r=sucesso", 'falha' => "{$base}?r=falha", 'pendente' => "{$base}?r=pendente"];
    }

    /** Depois do commit: cancela as orders no Mercado Pago. Falhou (já paga, fora do ar), a conciliação acerta. @param list<string> $orderIds */
    public function cancelarOrders(array $orderIds): void
    {
        foreach ($orderIds as $id) {
            try {
                $this->gateway()->cancelar($id, "cancelar-{$id}");
            } catch (\Throwable $e) {
                Log::warning('Pagamento: não cancelou a order no Mercado Pago (a conciliação confere)', ['order' => $id, 'erro' => $e->getMessage()]);
            }
        }
    }

    // ---------- Aplicar a situação lida no Mercado Pago ----------

    /**
     * Aplica a situação da order à cobrança. Idempotente. Devolve o que mudou; avisos e confirmação da venda rodam depois
     * do commit.
     *
     * @return ?array{mudou: bool, de: string, para: string, confirmar: bool, catalogo: bool, avisos: list<array{tipo: string, titulo: string, texto: string}>}
     */
    public function aplicarSituacao(string $cobrancaId, SituacaoOrder $s, string $origem, ?string $requestId = null): ?array
    {
        $cfg = $this->cfg();
        $ef = DB::transaction(function () use ($cobrancaId, $s, $origem, $requestId, $cfg) {
            $c = Cobranca::query()->lockForUpdate()->with(['pedido' => fn ($q) => $q->with(self::comPedido()), 'pagamento'])->find($cobrancaId);
            if (! $c) {
                return null;
            }
            $de = $c->status->value;
            $para = Pagamento::traduzirStatusMp($s->status, $s->statusDetalhe);
            $base = ['cobrancaId' => $cobrancaId, 'origem' => $origem, 'mpOrderId' => $s->orderId, 'statusMp' => "{$s->status}/{$s->statusDetalhe}", 'dados' => $s->resumo(), 'requestId' => $requestId];
            $ef = ['mudou' => false, 'de' => $de, 'para' => $para, 'confirmar' => false, 'catalogo' => false, 'avisos' => []];
            $pedido = $c->pedido;
            $quem = "{$pedido->codigo} · {$pedido->nomeCliente}";
            $valorC = (float) $c->valor;

            // RP-10: a order precisa ser desta cobrança.
            if (($s->referencia !== null && $s->referencia !== $c->id) || ($c->mpOrderId !== null && $c->mpOrderId !== $s->orderId)) {
                self::evento([...$base, 'tipo' => 'divergencia_referencia', 'erro' => "referência {$s->referencia} / order {$s->orderId}"]);
                $ef['avisos'][] = ['tipo' => 'problema', 'titulo' => "Pagamento com referência divergente em {$pedido->codigo}", 'texto' => 'Um aviso do Mercado Pago não confere com a cobrança. Nada foi alterado; confira no painel do Mercado Pago.'];

                return $ef;
            }
            if (! Pagamento::podeMudar($de, $para)) {
                self::evento([...$base, 'tipo' => "ignorado_{$de}_para_{$para}"]);

                return $ef;
            }
            $entraPaga = Pagamento::ehPaga($para) && ! Pagamento::ehPaga($de) && $para !== 'contestada';
            if ($entraPaga) {
                // R-03: confere o valor COBRADO (total da order); o "pago" pode vir líquido de tarifa.
                $pago = $s->valorTotal ?? $s->valorPago;
                if ($pago === null || abs($pago - $valorC) >= 0.01 || ($s->moeda && $s->moeda !== 'BRL')) {
                    self::evento([...$base, 'tipo' => 'divergencia_valor', 'erro' => "esperado {$valorC} BRL, veio {$pago} {$s->moeda}"]);
                    $ef['avisos'][] = ['tipo' => 'problema', 'titulo' => "Valor pago diferente em {$pedido->codigo}", 'texto' => 'Esperado '.Dinheiro::brl($valorC).', o Mercado Pago informa '.($pago === null ? 'sem valor' : Dinheiro::brl($pago)).'. Nada foi alterado: confira e, se for o caso, estorne no Mercado Pago.'];

                    return $ef;
                }
            }

            $dados = array_filter([
                'status' => $para, 'mpOrderId' => $s->orderId, 'statusMp' => mb_substr("{$s->status}/{$s->statusDetalhe}", 0, 60), 'consultadaEm' => now(),
                'mpPaymentId' => $s->pagamentoId, 'meio' => $s->meio ? mb_substr($s->meio, 0, 30) : null, 'tipoMeio' => $s->tipoMeio ? mb_substr($s->tipoMeio, 0, 30) : null,
                'parcelas' => $s->parcelas ?: null, 'taxa' => $s->taxa !== null ? number_format($s->taxa, 2, '.', '') : null,
                'pixCopiaECola' => $s->pixCopiaECola && ! $c->pixCopiaECola ? $s->pixCopiaECola : null, 'checkoutUrl' => $s->checkoutUrl && ! $c->checkoutUrl ? $s->checkoutUrl : null,
            ], fn ($v) => $v !== null);
            $dados['valorEstornado'] = number_format($s->valorEstornado, 2, '.', '');
            $ef['mudou'] = $de !== $para;

            if ($entraPaga) {
                $dados['aprovadaEm'] = $c->aprovadaEm ?? now();
                $forma = Pagamento::formaDoMeio($s->meio, $s->tipoMeio);
                if (! $c->pagamento) {
                    LinhaPagamento::query()->create(['pedidoId' => $pedido->id, 'cobrancaId' => $c->id, 'forma' => $forma, 'valor' => number_format($valorC - $s->valorEstornado, 2, '.', ''), 'parcelas' => $forma === 'credito' ? ($s->parcelas ?? 1) : null]);
                }
                $pedido->update(['pagamentoSituacao' => 'pago']);
                $outras = Cobranca::query()->where('pedidoId', $pedido->id)->whereKeyNot($c->id)->whereIn('status', Pagamento::PAGAS)->count();
                if ($outras) {
                    $ef['avisos'][] = ['tipo' => 'problema', 'titulo' => "{$pedido->codigo} foi pago duas vezes", 'texto' => 'A cliente pagou mais de uma cobrança deste pedido. Estorne uma delas no quadro Pagamento online.'];
                }
                if ($pedido->status->value === 'cancelado') {
                    $ef['avisos'][] = ['tipo' => 'problema', 'titulo' => "Pagamento em pedido cancelado: {$pedido->codigo}", 'texto' => Dinheiro::brl($valorC).' entrou depois do cancelamento. Estorne no quadro Pagamento online ou refaça o pedido.'];
                } elseif ($pedido->tipo->value === 'compra' && $pedido->status->value === 'pendente') {
                    // RP-07: a reserva venceu antes de o pagamento chegar? Tenta reservar de novo.
                    if (! $c->reservou) {
                        if ($this->reservarTudo($pedido->itens)) {
                            $dados['reservou'] = true;
                            $ef['catalogo'] = true;
                        } else {
                            $dados['semEstoque'] = true;
                            $ef['avisos'][] = ['tipo' => 'problema', 'titulo' => "Pago, mas uma peça acabou: {$pedido->codigo}", 'texto' => "{$quem} pagou ".Dinheiro::brl($valorC).', e uma das peças já não está no estoque. Troque a peça com a cliente ou estorne.'];
                        }
                    }
                    $ef['confirmar'] = $cfg['confirmarAoPagar'] && empty($dados['semEstoque']) && ! $outras;
                }
                $ef['avisos'][] = ['tipo' => 'aprovado', 'titulo' => "Pagamento aprovado: {$pedido->codigo}", 'texto' => "{$quem} pagou ".Dinheiro::brl($valorC).' ('.Pagamento::descreverMeio($s->meio, $s->parcelas).').'];
            }

            if (Pagamento::ehAtiva($de) && ! Pagamento::ehAtiva($para) && ! Pagamento::ehPaga($para) && $c->reservou) {
                // Vencida, recusada ou cancelada: a reserva volta.
                $this->liberarTudo($pedido->itens);
                $dados['reservou'] = false;
                $ef['catalogo'] = true;
            }
            if ($para === 'estornada' && $de !== 'estornada') {
                $c->pagamento?->delete();
                if (! Cobranca::query()->where('pedidoId', $pedido->id)->whereKeyNot($c->id)->whereIn('status', Pagamento::PAGAS)->exists()) {
                    $pedido->update(['pagamentoSituacao' => 'estornado']);
                }
                if ($c->reservou && $pedido->status->value === 'pendente') {
                    $this->liberarTudo($pedido->itens);
                    $dados['reservou'] = false;
                    $ef['catalogo'] = true;
                }
            }
            if ($para === 'estornada_parcial' && $c->pagamento) {
                $c->pagamento->update(['valor' => number_format($valorC - $s->valorEstornado, 2, '.', '')]);
            }
            if ($para === 'contestada' && $de !== 'contestada') {
                $ef['avisos'][] = ['tipo' => 'problema', 'titulo' => "Contestação de pagamento: {$pedido->codigo}", 'texto' => 'A cliente contestou '.Dinheiro::brl($valorC).' no cartão. Responda no painel do Mercado Pago com o comprovante da entrega.'];
            }
            $c->update($dados);
            self::evento([...$base, 'tipo' => $ef['mudou'] ? "{$de}_para_{$para}" : "sem_mudanca_{$para}"]);

            return $ef;
        });
        if (! $ef) {
            return null;
        }
        if ($ef['catalogo']) {
            $this->catalogo->invalidar();
        }
        if ($ef['confirmar'] || $ef['avisos']) {
            $ef = $this->depoisDeAplicar($cobrancaId, $ef);
        }

        return $ef;
    }

    /** Confirma a venda (se a loja quiser) e avisa a equipe. Nunca lança: o pagamento já está gravado. */
    private function depoisDeAplicar(string $cobrancaId, array $ef): array
    {
        $c = Cobranca::query()->with('pedido:id,codigo,vendedorId,status')->find($cobrancaId);
        if (! $c) {
            return $ef;
        }
        $pedido = $c->pedido;
        if ($ef['confirmar'] && $pedido->status->value === 'pendente') {
            try {
                app(Pedidos::class)->confirmar($pedido->id, [], null);
                PedidoHistorico::query()->where('pedidoId', $pedido->id)->where('acao', 'confirmado')->whereNull('observacao')->update(['observacao' => 'Confirmado sozinho: pagamento online aprovado.']);
            } catch (\Throwable $e) {
                Log::error('Pagamento: aprovado, mas a confirmação automática falhou', ['pedido' => $pedido->codigo, 'erro' => $e->getMessage()]);
                $ef['avisos'][] = ['tipo' => 'problema', 'titulo' => "Pago, mas não confirmou sozinho: {$pedido->codigo}", 'texto' => "{$e->getMessage()} Confirme o pedido pelo painel."];
            }
        }
        $link = "/painel/pedidos/{$pedido->id}";
        $linkEmail = rtrim((string) config('app.url'), '/').$link;
        $dono = Notificacoes::responsaveis($pedido->vendedorId);
        foreach ($ef['avisos'] as $a) {
            rescue(fn () => $a['tipo'] === 'aprovado'
                ? $this->notificacoes->notificar($dono, TipoNotificacao::PagamentoAprovado, $a['titulo'], $a['texto'], $link, "pago:{$cobrancaId}", ['assunto' => $a['titulo'], 'texto' => "{$a['texto']}\n\nAbra o pedido no painel: {$linkEmail}"])
                : $this->notificacoes->notificar(array_values(array_unique([...$dono, ...Notificacoes::gestoresAtivos()])), TipoNotificacao::PagamentoProblema, mb_substr($a['titulo'], 0, 140), $a['texto'], $link, mb_substr("pgto:{$cobrancaId}:{$a['titulo']}", 0, 100), ['assunto' => $a['titulo'], 'texto' => "{$a['texto']}\n\nPedido no painel: {$linkEmail}"]));
        }

        return $ef;
    }

    // ---------- Consultar, cancelar, estornar ----------

    /** Lê a order no Mercado Pago e aplica. `minimoSegundos`: não consulta de novo antes disso (página do Pix). */
    public function sincronizar(string $cobrancaId, string $origem, int $minimoSegundos = 0): ?array
    {
        $c = Cobranca::query()->find($cobrancaId, ['id', 'mpOrderId', 'consultadaEm']);
        if (! $c?->mpOrderId) {
            return null;
        }
        if ($minimoSegundos && $c->consultadaEm && $c->consultadaEm->getTimestamp() > time() - $minimoSegundos) {
            return null;
        }
        Cobranca::query()->whereKey($cobrancaId)->update(['consultadaEm' => now()]);
        try {
            return $this->aplicarSituacao($cobrancaId, $this->gateway()->consultar($c->mpOrderId), $origem);
        } catch (\Throwable $e) {
            rescue(fn () => self::evento(['cobrancaId' => $cobrancaId, 'origem' => $origem, 'tipo' => 'falha_consulta', 'mpOrderId' => $c->mpOrderId, 'erro' => mb_substr($e->getMessage(), 0, 2000)]), report: false);
            throw $e;
        }
    }

    /** Aviso do Mercado Pago: acha a cobrança pela order (ou pela referência) e sincroniza. */
    public function processarAviso(string $orderId, ?string $requestId): ?array
    {
        $c = Cobranca::query()->where('mpOrderId', $orderId)->first(['id']);
        if (! $c) {
            // A order pode ter sido criada e o aviso chegar antes de gravarmos o id: a referência é o id da cobrança.
            $s = $this->gateway()->consultar($orderId);
            $c = $s->referencia ? Cobranca::query()->find($s->referencia, ['id']) : null;
            if (! $c) {
                self::evento(['origem' => 'webhook', 'tipo' => 'order_desconhecida', 'mpOrderId' => $orderId, 'requestId' => $requestId ? "{$requestId}:desconhecida" : null, 'dados' => $s->resumo()]);

                return null;
            }
            Cobranca::query()->whereKey($c->id)->whereNull('mpOrderId')->update(['mpOrderId' => $orderId]);

            return $this->aplicarSituacao($c->id, $s, 'webhook');
        }

        return $this->sincronizar($c->id, 'webhook');
    }

    /**
     * Grava o aviso antes de responder. Devolve o id do evento, 'repetido' (mesmo x-request-id) ou 'ambiente_errado'
     * (R-07: registrado, não processado, e o gestor é avisado uma vez por dia).
     */
    public function registrarAviso(string $orderId, ?string $requestId, ?string $acao, ?bool $liveMode): int|string
    {
        $amb = config('services.pagamento.ambiente');
        $esperado = $amb === 'producao' ? true : ($amb === 'teste' ? false : null);
        $errado = $esperado !== null && $liveMode !== null && $liveMode !== $esperado;
        try {
            $e = EventoPagamento::query()->create([
                'origem' => 'webhook', 'tipo' => $errado ? 'aviso_ambiente_errado' : mb_substr('aviso_'.($acao ?? 'order'), 0, 60), 'mpOrderId' => $orderId,
                'requestId' => $requestId ? mb_substr($requestId, 0, 80) : null, 'dados' => ['action' => $acao, 'live_mode' => $liveMode],
                'processadoEm' => $errado ? now() : null, 'erro' => $errado ? 'live_mode '.json_encode($liveMode).', esperado '.json_encode($esperado) : null,
            ]);
        } catch (QueryException $ex) {
            if (str_contains($ex->getMessage(), 'Duplicate') || ($ex->errorInfo[1] ?? null) === 1062) {
                return 'repetido';
            }
            throw $ex;
        }
        if ($errado) {
            $this->notificacoes->notificar(Notificacoes::gestoresAtivos(), TipoNotificacao::PagamentoProblema, 'Aviso do Mercado Pago do ambiente errado',
                'Chegou um aviso '.($liveMode ? 'de PRODUÇÃO' : 'de TESTE').' neste servidor, configurado como '.($esperado ? 'produção' : 'teste').' (MP_AMBIENTE). Confira as credenciais e o endereço do aviso no Mercado Pago.',
                '/painel/pagamentos', 'ambiente-errado:'.now()->toDateString());

            return 'ambiente_errado';
        }

        return $e->id;
    }

    /** Processa um aviso gravado e marca o resultado. Nunca lança: o erro fica no evento e a conciliação tenta de novo. */
    public function processarAvisoGravado(int $eventoId): void
    {
        $ev = EventoPagamento::query()->find($eventoId, ['id', 'mpOrderId', 'requestId', 'processadoEm']);
        if (! $ev?->mpOrderId || $ev->processadoEm) {
            return;
        }
        try {
            $this->processarAviso($ev->mpOrderId, $ev->requestId);
            $ev->update(['processadoEm' => now(), 'erro' => null]);
        } catch (\Throwable $e) {
            Log::error('Pagamento: falha ao processar aviso do Mercado Pago', ['order' => $ev->mpOrderId, 'erro' => $e->getMessage()]);
            rescue(fn () => $ev->update(['erro' => mb_substr($e->getMessage(), 0, 2000)]), report: false);
        }
    }

    /** A equipe cancela um link aberto. Se a cliente já pagou, a situação é atualizada e o cancelamento recusado. */
    public function cancelar(string $cobrancaId, string $usuarioId): void
    {
        $c = Cobranca::query()->find($cobrancaId);
        if (! $c) {
            throw new ErroPagamento('Cobrança não encontrada.');
        }
        if (! Pagamento::ehAtiva($c->status->value)) {
            throw new ErroPagamento('Esta cobrança já está '.mb_strtolower(Pagamento::ROTULO_STATUS[$c->status->value]).'.');
        }
        if ($c->mpOrderId) {
            try {
                $this->aplicarSituacao($c->id, $this->gateway()->cancelar($c->mpOrderId, "cancelar-{$c->id}"), 'acao');
            } catch (\Throwable $e) {
                rescue(fn () => $this->sincronizar($c->id, 'acao'), report: false);
                $agora = Cobranca::query()->find($c->id)->status->value;
                if (Pagamento::ehPaga($agora)) {
                    throw new ErroPagamento('A cliente acabou de pagar esta cobrança: ela não pode mais ser cancelada.');
                }
                if (Pagamento::ehAtiva($agora)) {
                    throw new ErroPagamento($e->getMessage() ?: 'Não foi possível cancelar no Mercado Pago.');
                }
            }
        }
        // Sem order (falhou ao criar) ou o MP respondeu sem cancelar: fecha aqui.
        $liberou = DB::transaction(function () use ($c, $usuarioId) {
            $atual = Cobranca::query()->lockForUpdate()->with('pedido.itens:id,pedidoId,varianteId,quantidade')->find($c->id);
            $reservou = $atual->reservou;
            if (Pagamento::ehAtiva($atual->status->value)) {
                if ($reservou) {
                    $this->liberarTudo($atual->pedido->itens);
                }
                $atual->update(['status' => 'cancelada', 'reservou' => false]);
            }
            self::evento(['cobrancaId' => $c->id, 'origem' => 'acao', 'tipo' => 'cancelada_pela_equipe', 'mpOrderId' => $c->mpOrderId, 'dados' => ['usuarioId' => $usuarioId]]);

            return $reservou;
        });
        if ($liberou) {
            $this->catalogo->invalidar();
        }
    }

    /** RP-08: estorno no Mercado Pago. Sem `valor`, o total que falta. A situação só muda com a resposta da API. */
    public function estornar(string $cobrancaId, string $usuarioId, string $motivo, ?float $valor = null): ?array
    {
        $c = Cobranca::query()->find($cobrancaId);
        if (! $c) {
            throw new ErroPagamento('Cobrança não encontrada.');
        }
        if (! Pagamento::ehPaga($c->status->value)) {
            throw new ErroPagamento('Só um pagamento aprovado pode ser estornado.');
        }
        if (! $c->mpOrderId) {
            throw new ErroPagamento('Cobrança sem order no Mercado Pago.');
        }
        $resta = round(((float) $c->valor - (float) $c->valorEstornado) * 100) / 100;
        if ($valor !== null && ! ($valor > 0 && $valor <= $resta + 0.001)) {
            throw new ErroPagamento('Informe um valor entre R$ 0,01 e '.Dinheiro::brl($resta).'.');
        }
        $parcial = $valor !== null && $valor < $resta - 0.001;
        if ($parcial && ! $c->mpPaymentId) {
            throw new ErroPagamento('O Mercado Pago não informou o pagamento desta cobrança: estorne pelo painel do Mercado Pago.');
        }
        // A chave muda a cada estorno, e repetir o mesmo pedido não estorna duas vezes.
        $chave = "estorno-{$c->id}-".number_format((float) $c->valorEstornado, 2, '.', '').'-'.($parcial ? number_format($valor, 2, '.', '') : 'total');
        self::evento(['cobrancaId' => $c->id, 'origem' => 'acao', 'tipo' => 'estorno_pedido', 'mpOrderId' => $c->mpOrderId, 'dados' => ['usuarioId' => $usuarioId, 'motivo' => mb_substr($motivo, 0, 300), 'valor' => $parcial ? $valor : $resta]]);
        try {
            $s = $this->gateway()->estornar($c->mpOrderId, $chave, $parcial ? ['pagamentoId' => $c->mpPaymentId, 'valor' => $valor] : null);
        } catch (\Throwable $e) {
            self::evento(['cobrancaId' => $c->id, 'origem' => 'acao', 'tipo' => 'falha_estorno', 'mpOrderId' => $c->mpOrderId, 'erro' => mb_substr($e->getMessage(), 0, 2000)]);
            throw new ErroPagamento("O estorno não foi feito. {$e->getMessage()}");
        }

        return $this->aplicarSituacao($c->id, $s, 'acao');
    }

    // ---------- Conciliação ----------

    /**
     * Agendador (a cada 10 min) e o próprio site (no máximo a cada 3 min): consulta as abertas, cancela as vencidas, fecha
     * as que travaram antes de chegar ao Mercado Pago e tenta de novo a confirmação automática que falhou.
     *
     * @return array<string, int>
     */
    public function conciliar(): array
    {
        $r = ['consultadas' => 0, 'vencidas' => 0, 'travadas' => 0, 'confirmadas' => 0, 'avisos' => 0, 'pagasConferidas' => 0, 'falhas' => 0];
        $doisMin = now()->subMinutes(2);
        $ativas = Cobranca::query()->whereIn('status', Pagamento::ATIVAS)->whereNotNull('mpOrderId')
            ->where(fn ($q) => $q->whereNull('consultadaEm')->orWhere('consultadaEm', '<', $doisMin))->orderBy('criadaEm')->take(100)->get(['id', 'mpOrderId']);
        foreach ($ativas as $c) {
            try {
                $this->sincronizar($c->id, 'conciliacao');
                $r['consultadas']++;
                $atual = Cobranca::query()->find($c->id, ['id', 'status', 'expiraEm']);
                if (Pagamento::ehAtiva($atual->status->value) && $atual->expiraEm && $atual->expiraEm->lt($doisMin)) {
                    // Vencida e ainda aberta no MP: cancela lá (a cliente não paga mais) e aqui.
                    try {
                        $this->aplicarSituacao($c->id, $this->gateway()->cancelar($c->mpOrderId, "vencer-{$c->id}"), 'conciliacao');
                    } catch (\Throwable) {
                        $this->sincronizar($c->id, 'conciliacao');
                    }
                    if (Pagamento::ehAtiva(Cobranca::query()->find($c->id)->status->value)) {
                        $this->fecharLocal($c->id, 'expirada', 'vencida_sem_resposta');
                    }
                    $r['vencidas']++;
                }
            } catch (\Throwable $e) {
                // Order que não existe mais no Mercado Pago: nunca vai ser paga, fecha aqui.
                if ($e instanceof ErroGateway && $e->codigo === 'order_not_found') {
                    $this->fecharLocal($c->id, 'cancelada', 'order_inexistente');
                    $r['travadas']++;

                    continue;
                }
                $r['falhas']++;
                Log::error('Pagamento: falha na conciliação', ['cobranca' => $c->id, 'erro' => $e->getMessage()]);
            }
        }
        // R-04: avisos gravados e não processados: processa de novo, por até 7 dias.
        $avisos = EventoPagamento::query()->where('origem', 'webhook')->whereNull('processadoEm')->whereNotNull('mpOrderId')
            ->where('criadoEm', '<', $doisMin)->where('criadoEm', '>', now()->subDays(7))->orderBy('id')->take(50)->pluck('id');
        foreach ($avisos as $id) {
            $this->processarAvisoGravado($id);
            $r['avisos']++;
        }
        // R-04: pagas nos últimos 180 dias, consultadas há mais de 24 h: pega estorno e contestação feitos direto no MP.
        $pagas = Cobranca::query()->whereIn('status', Pagamento::PAGAS)->whereNotNull('mpOrderId')->where('aprovadaEm', '>', now()->subDays(180))
            ->where(fn ($q) => $q->whereNull('consultadaEm')->orWhere('consultadaEm', '<', now()->subDay()))->orderBy('consultadaEm')->take(20)->pluck('id');
        foreach ($pagas as $id) {
            try {
                $this->sincronizar($id, 'conciliacao');
                $r['pagasConferidas']++;
            } catch (\Throwable $e) {
                if (Modo::simulado() && $e instanceof ErroGateway && $e->codigo === 'order_not_found') {
                    continue;
                }
                $r['falhas']++;
                Log::error('Pagamento: falha ao conferir cobrança paga', ['cobranca' => $id, 'erro' => $e->getMessage()]);
            }
        }
        // Gravadas mas sem order há 10 min: o processo caiu entre gravar e chamar o MP.
        foreach (Cobranca::query()->where('status', 'criada')->whereNull('mpOrderId')->where('criadaEm', '<', now()->subMinutes(10))->take(100)->pluck('id') as $id) {
            $this->fecharLocal($id, 'cancelada', 'travada_sem_order');
            $r['travadas']++;
        }
        // Aprovadas cuja confirmação automática não aconteceu.
        if ($this->cfg()['confirmarAoPagar']) {
            $paradas = Cobranca::query()->where('status', 'aprovada')->where('semEstoque', false)->where('aprovadaEm', '<', now()->subMinute())
                ->whereHas('pedido', fn ($q) => $q->where('status', 'pendente')->where('tipo', 'compra'))->take(50)->get(['id', 'pedidoId']);
            foreach ($paradas as $p) {
                if (Cobranca::query()->where('pedidoId', $p->pedidoId)->whereIn('status', Pagamento::PAGAS)->count() > 1) {
                    continue;
                }
                try {
                    app(Pedidos::class)->confirmar($p->pedidoId, [], null);
                    $r['confirmadas']++;
                } catch (\Throwable $e) {
                    $r['falhas']++;
                    Log::error('Pagamento: confirmação na conciliação falhou', ['pedido' => $p->pedidoId, 'erro' => $e->getMessage()]);
                }
            }
        }

        return $r;
    }

    private function fecharLocal(string $cobrancaId, string $status, string $tipo): void
    {
        $liberou = DB::transaction(function () use ($cobrancaId, $status, $tipo) {
            $c = Cobranca::query()->lockForUpdate()->with('pedido.itens:id,pedidoId,varianteId,quantidade')->find($cobrancaId);
            if (! $c || ! Pagamento::ehAtiva($c->status->value)) {
                return false;
            }
            $reservou = $c->reservou;
            if ($reservou) {
                $this->liberarTudo($c->pedido->itens);
            }
            $c->update(['status' => $status, 'reservou' => false]);
            self::evento(['cobrancaId' => $c->id, 'origem' => 'conciliacao', 'tipo' => $tipo, 'mpOrderId' => $c->mpOrderId]);

            return $reservou;
        });
        if ($liberou) {
            $this->catalogo->invalidar();
        }
    }

    /** R-08: páginas públicas conciliam só as cobranças abertas DAQUELE pedido, no máximo a cada 15 s por cobrança. */
    public function conciliarDoPedido(string $codigo): void
    {
        $abertas = Cobranca::query()->whereHas('pedido', fn ($q) => $q->where('codigo', $codigo))->whereIn('status', Pagamento::ATIVAS)->whereNotNull('mpOrderId')->take(5)->get(['id', 'mpOrderId']);
        foreach ($abertas as $c) {
            try {
                $this->sincronizar($c->id, 'consulta', 15);
                $atual = Cobranca::query()->find($c->id, ['id', 'status', 'expiraEm']);
                if (Pagamento::ehAtiva($atual->status->value) && $atual->expiraEm && $atual->expiraEm->lt(now()->subMinutes(2))) {
                    rescue(fn () => $this->aplicarSituacao($c->id, $this->gateway()->cancelar($c->mpOrderId, "vencer-{$c->id}"), 'consulta'), report: false);
                }
            } catch (\Throwable $e) {
                if ($e instanceof ErroGateway && $e->codigo === 'order_not_found') {
                    $this->fecharLocal($c->id, 'cancelada', 'order_inexistente');
                }
            }
        }
    }

    /** O site concilia sozinho no máximo a cada 3 minutos (o agendador garante mesmo sem acesso). */
    public function talvezConciliar(): void
    {
        if (! Cache::add('pagamentos:conciliacao', 1, 180)) {
            return;
        }
        if (! $this->cfg()['ligado'] || ! Modo::configurado()) {
            return;
        }
        rescue(fn () => $this->conciliar());
    }

    /**
     * Só com o Mercado Pago simulado: faz o papel da cliente pagando a cobrança aberta do pedido, para a loja ver o fluxo
     * inteiro antes de ter as credenciais. Nunca existe na produção.
     */
    public function simularPagamentoDeTeste(string $codigo): ?array
    {
        if (! Modo::simulado()) {
            throw new ErroPagamento('Disponível só no ambiente de teste.');
        }
        $c = Cobranca::query()->whereHas('pedido', fn ($q) => $q->where('codigo', $codigo))->whereIn('status', Pagamento::ATIVAS)->whereNotNull('mpOrderId')->orderByDesc('criadaEm')->first();
        if (! $c) {
            throw new ErroPagamento('Gere o Pix ou o pagamento com cartão primeiro.');
        }
        try {
            app(GatewayFalso::class)->simularPagamento($c->mpOrderId, $c->metodo->value === 'pix' ? ['meio' => 'pix', 'tipoMeio' => 'bank_transfer'] : ['meio' => 'visa', 'tipoMeio' => 'credit_card', 'parcelas' => 2]);
        } catch (ErroGateway) {
            throw new ErroPagamento('A cobrança simulada se perdeu. Gere o pagamento de novo.');
        }

        return $this->sincronizar($c->id, 'acao');
    }
}
