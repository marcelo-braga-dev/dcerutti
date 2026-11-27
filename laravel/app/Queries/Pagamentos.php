<?php

namespace App\Queries;

use App\Models\Cobranca;
use App\Models\EventoPagamento;
use App\Models\Pedido;
use App\Models\User;
use App\Services\Config;
use App\Services\Pagamentos\Cobrancas;
use App\Services\Pagamentos\Modo;
use App\Support\Escopo;
use App\Support\Pagamento;

/** Leituras do pagamento online (docs/27; porta de src/server/consultas/pagamentos.ts), já com o escopo de quem pede. */
class Pagamentos
{
    public function __construct(private Config $config) {}

    /** @return array<string, mixed> */
    public static function paraTela(Cobranca $c): array
    {
        return [
            'id' => $c->id, 'metodo' => $c->metodo->value, 'status' => $c->status->value, 'valor' => (float) $c->valor, 'valorEstornado' => (float) $c->valorEstornado,
            'meio' => $c->meio, 'tipoMeio' => $c->tipoMeio, 'parcelas' => $c->parcelas, 'taxa' => $c->taxa === null ? null : (float) $c->taxa, 'semEstoque' => $c->semEstoque,
            'expiraEm' => $c->expiraEm?->toIso8601String(), 'aprovadaEm' => $c->aprovadaEm?->toIso8601String(), 'criadaEm' => $c->criadaEm?->toIso8601String(),
            'mpOrderId' => $c->mpOrderId, 'statusMp' => $c->statusMp, 'reservou' => $c->reservou,
            'ativa' => Pagamento::ehAtiva($c->status->value), 'paga' => Pagamento::ehPaga($c->status->value),
        ];
    }

    /** Quadro "Pagamento online" do pedido no painel. Sem acesso, null. */
    public function doPedido(User $u, string $pedidoId): ?array
    {
        $cfg = (array) $this->config->get('pagamentoOnline');
        $p = Escopo::vendedor(Pedido::query(), $u)->with(['venda:id,pedidoId,valor', 'cobrancas' => fn ($q) => $q->orderByDesc('criadaEm')->take(20)])->find($pedidoId);
        if (! $p) {
            return null;
        }
        $cobrancas = $p->cobrancas->map(self::paraTela(...))->values();
        $eventos = $u->ehGestor() && $cobrancas->isNotEmpty()
            ? EventoPagamento::query()->whereIn('cobrancaId', $cobrancas->pluck('id'))->orderByDesc('id')->take(40)->get(['id', 'cobrancaId', 'origem', 'tipo', 'statusMp', 'erro', 'criadoEm'])
                ->map(fn ($e) => [...$e->only(['id', 'cobrancaId', 'origem', 'tipo', 'statusMp', 'erro']), 'criadoEm' => $e->criadoEm->toIso8601String()])->all()
            : [];

        return [
            'configurado' => Modo::configurado(), 'cfg' => $cfg, 'valor' => Cobrancas::valorDoPedido($p), 'cobrancas' => $cobrancas->all(),
            'ativa' => $cobrancas->firstWhere('ativa', true), 'paga' => $cobrancas->firstWhere('paga', true),
            'podeEstornar' => $u->ehGestor() || ($cfg['quemEstorna'] ?? 'gestor') === 'equipe',
            'podeDefinirFrete' => $p->tipo->value === 'compra' && $p->status->value === 'pendente' && ! $cobrancas->contains(fn ($c) => $c['ativa'] || $c['paga']),
            'frete' => $p->frete === null ? null : (float) $p->frete, 'freteCupom' => (bool) $p->freteCupom, 'eventos' => $eventos,
        ];
    }

    /** Página pública /pagar: só o que pode aparecer sem login (primeiro nome, peças e valores). */
    public function paraPagar(string $codigo): ?array
    {
        $cfg = (array) $this->config->get('pagamentoOnline');
        $p = Pedido::query()->with(['venda:id,pedidoId,valor', 'cliente:id,email,userId', 'cliente.user:id,email', 'itens' => fn ($q) => $q->orderBy('id'), 'cobrancas' => fn ($q) => $q->orderByDesc('criadaEm')->take(5)])
            ->where('codigo', $codigo)->first();
        if (! $p) {
            return null;
        }
        $cobrancas = $p->cobrancas->map(fn ($c) => [...self::paraTela($c), 'pixCopiaECola' => $c->pixCopiaECola, 'checkoutUrl' => $c->checkoutUrl])->values();
        $condFechado = $p->tipo->value === 'condicional' && $p->status->value === 'confirmado';

        return [
            'id' => $p->id, 'codigo' => $p->codigo, 'tipo' => $p->tipo->value, 'status' => $p->status->value,
            'primeiroNome' => explode(' ', trim($p->nomeCliente))[0] ?? '',
            'itens' => $p->itens->filter(fn ($i) => (! $condFechado || $i->situacao?->value === 'vendido') && $i->situacao?->value !== 'devolvido')
                ->map(fn ($i) => ['id' => $i->id, 'nome' => $i->nome, 'tamanho' => $i->tamanho, 'cor' => $i->cor, 'quantidade' => $i->quantidade, 'preco' => (float) $i->precoUnitario, 'imagem' => $i->imagem])->values()->all(),
            'cupom' => $p->codigoCupom ? ['codigo' => $p->codigoCupom, 'desconto' => (float) $p->descontoCupom, 'freteGratis' => (bool) $p->freteCupom] : null,
            'frete' => $p->frete === null ? null : (float) $p->frete,
            'valor' => Cobrancas::valorDoPedido($p),
            'pago' => $cobrancas->firstWhere('paga', true),
            'pagoManual' => $p->pagamentoSituacao->value === 'pago' && ! $cobrancas->contains('paga', true),
            'estornado' => $p->pagamentoSituacao->value === 'estornado',
            'pixAtivo' => $cobrancas->first(fn ($c) => $c['ativa'] && $c['metodo'] === 'pix' && $c['pixCopiaECola'] && (! $c['expiraEm'] || strtotime($c['expiraEm']) > time())),
            'ultima' => $cobrancas->first(),
            'precisaEmail' => ! ($p->cliente?->email || $p->cliente?->user?->email),
            'ligado' => $cfg['ligado'] && Modo::configurado(), 'pix' => (bool) $cfg['pix'], 'cartao' => (bool) $cfg['cartao'],
            'parcelasMax' => (int) $cfg['parcelasMax'], 'parcelasSemJuros' => (int) $cfg['parcelasSemJuros'], 'minutosPix' => (int) $cfg['minutosPix'],
        ];
    }

    /** Situação para a página do Pix (sondagem): o mínimo. */
    public static function situacao(string $codigo): ?array
    {
        $p = Pedido::query()->with(['cobrancas' => fn ($q) => $q->orderByDesc('criadaEm')->take(5)])->where('codigo', $codigo)->first(['id']);
        if (! $p) {
            return null;
        }
        $ativa = $p->cobrancas->first(fn ($c) => Pagamento::ehAtiva($c->status->value));

        return [
            'pago' => $p->cobrancas->contains(fn ($c) => Pagamento::ehPaga($c->status->value)),
            'ativa' => $ativa ? ['id' => $ativa->id, 'status' => $ativa->status->value, 'expiraEm' => $ativa->expiraEm?->toIso8601String(), 'temOrder' => (bool) $ativa->mpOrderId] : null,
            'ultima' => $p->cobrancas->first()?->status->value,
        ];
    }

    /**
     * Página Pagamentos (gestor): lista, recebido no período, taxas e líquido.
     *
     * @param  array{status: ?string, de: ?\DateTimeInterface, ate: ?\DateTimeInterface, pagina: int}  $f
     */
    public function listar(array $f): array
    {
        $periodo = fn ($q, string $col) => $q->when($f['de'], fn ($w) => $w->where($col, '>=', $f['de']))->when($f['ate'], fn ($w) => $w->where($col, '<', $f['ate']));
        $base = Cobranca::query()->tap(fn ($q) => $periodo($q, 'criadaEm'))
            ->when($f['status'] === 'abertas', fn ($q) => $q->whereIn('status', Pagamento::ATIVAS))
            ->when($f['status'] === 'pagas', fn ($q) => $q->whereIn('status', Pagamento::PAGAS))
            ->when($f['status'] === 'problemas', fn ($q) => $q->where(fn ($w) => $w->where('semEstoque', true)->orWhere('status', 'contestada')->orWhereHas('eventos', fn ($e) => $e->where('tipo', 'like', 'divergencia%'))))
            ->when($f['status'] && array_key_exists($f['status'], Pagamento::ROTULO_STATUS), fn ($q) => $q->where('status', $f['status']));
        $aprovadas = fn () => Cobranca::query()->tap(fn ($q) => ($f['de'] || $f['ate']) ? $periodo($q, 'aprovadaEm') : $q->whereNotNull('aprovadaEm'));
        $recebido = $aprovadas()->whereIn('status', [...Pagamento::PAGAS, 'estornada'])->selectRaw('count(*) n, coalesce(sum(valor),0) bruto, coalesce(sum(valorEstornado),0) estornado, coalesce(sum(taxa),0) taxas')->first();
        $bruto = (float) $recebido->bruto;
        $estornado = (float) $recebido->estornado;
        $taxas = (float) $recebido->taxas;
        $abertas = Cobranca::query()->whereIn('status', Pagamento::ATIVAS)->selectRaw('count(*) n, coalesce(sum(valor),0) v')->first();

        return [
            'lista' => (clone $base)->with('pedido:id,codigo,nomeCliente,vendedorId', 'pedido.vendedor:id,name')->orderByDesc('criadaEm')->take(50 * $f['pagina'])->get()
                ->map(fn ($c) => [...self::paraTela($c), 'pedido' => ['id' => $c->pedido->id, 'codigo' => $c->pedido->codigo, 'nomeCliente' => $c->pedido->nomeCliente, 'vendedor' => $c->pedido->vendedor?->name]])->all(),
            'total' => (clone $base)->count(),
            'resumo' => [
                'pagamentos' => (int) $recebido->n, 'bruto' => $bruto, 'estornado' => $estornado, 'taxas' => $taxas, 'liquido' => round(($bruto - $estornado - $taxas) * 100) / 100,
                'porMeio' => $aprovadas()->whereIn('status', Pagamento::PAGAS)->groupBy('metodo')->selectRaw('metodo, count(*) n, sum(valor) v')->get()
                    ->map(fn ($m) => ['metodo' => $m->metodo->value, 'valor' => (float) $m->v, 'quantidade' => (int) $m->n])->all(),
                'abertas' => ['quantidade' => (int) $abertas->n, 'valor' => (float) $abertas->v],
            ],
        ];
    }

    /** Últimos 4 caracteres de um segredo, para conferir qual está em uso sem expor o valor. */
    private static function final(?string $v): ?string
    {
        return $v ? '…'.substr($v, -4) : null;
    }

    /** Estado da integração para a configuração: modo, credenciais (só o final), endereço do aviso e a saúde de 24 h. */
    public static function saude(string $site): array
    {
        $dia = now()->subDay();
        $ultimo = EventoPagamento::query()->where('origem', 'webhook')->orderByDesc('id')->first(['criadoEm', 'tipo', 'erro', 'processadoEm']);
        $amb = config('services.pagamento.ambiente');

        return [
            'modo' => Modo::atual(), 'ambiente' => in_array($amb, ['producao', 'teste'], true) ? $amb : null,
            'credenciais' => ['token' => self::final(config('services.pagamento.token')), 'segredo' => self::final(config('services.pagamento.segredo')), 'segredoAnterior' => self::final(config('services.pagamento.segredo_anterior'))],
            'urlAviso' => rtrim($site, '/').'/api/pagamentos/mercadopago', 'urlAvisoHttps' => str_starts_with($site, 'https://'),
            'ultimoAviso' => $ultimo ? ['criadoEm' => $ultimo->criadoEm->toIso8601String(), 'tipo' => $ultimo->tipo, 'erro' => $ultimo->erro, 'processadoEm' => $ultimo->processadoEm?->toIso8601String()] : null,
            'avisos24h' => EventoPagamento::query()->where('origem', 'webhook')->where('criadoEm', '>=', $dia)->count(),
            'avisosComErro' => EventoPagamento::query()->where('origem', 'webhook')->where('criadoEm', '>=', $dia)->whereNotNull('erro')->count(),
            'falhas24h' => EventoPagamento::query()->where('criadoEm', '>=', $dia)->whereIn('tipo', ['falha_consulta', 'falha_criar', 'falha_estorno', 'falha_cancelar'])->count(),
            'pendentes' => EventoPagamento::query()->where('origem', 'webhook')->whereNull('processadoEm')->where('criadoEm', '<', now()->subMinutes(5))->count(),
            'abertas' => Cobranca::query()->whereIn('status', Pagamento::ATIVAS)->count(), 'totalCobrancas' => Cobranca::query()->count(),
        ];
    }
}
