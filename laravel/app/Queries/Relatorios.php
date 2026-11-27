<?php

namespace App\Queries;

use App\Http\Controllers\Painel\AtendimentoController;
use App\Models\Atendimento;
use App\Models\Cupom;
use App\Models\Pedido;
use App\Models\PedidoItem;
use App\Models\PosVendaContato;
use App\Models\User;
use App\Models\Venda;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

/** Resultados e relatórios do gestor (porta de src/server/relatorios.ts e consultas/atendimento.ts indicadoresAtendimento). */
class Relatorios
{
    /** @param ?array{0: CarbonInterface, 1: CarbonInterface} $periodo */
    private static function noPeriodo($q, ?array $periodo, string $coluna)
    {
        return $periodo ? $q->where($coluna, '>=', $periodo[0])->where($coluna, '<', $periodo[1]) : $q;
    }

    /** @param list<array{chave: string, nome: string, n: int, receita: float, receitaComCusto: float, custo: float}> $grupos */
    private static function comLucro(Collection $grupos): Collection
    {
        return $grupos->map(fn ($g) => [...$g, 'lucro' => $g['receitaComCusto'] - $g['custo'], 'margem' => $g['receitaComCusto'] ? ($g['receitaComCusto'] - $g['custo']) / $g['receitaComCusto'] : null])->values();
    }

    /**
     * Resultados (RF-34). Receita e custo vêm das vendas; categorias e produtos, dos itens vendidos.
     *
     * @param  ?array{0: CarbonInterface, 1: CarbonInterface}  $periodo
     */
    public static function resultados(?array $periodo): array
    {
        $vendas = self::noPeriodo(Venda::query(), $periodo, 'data')->get(['vendedorId', 'valor', 'custo', 'pedidoId']);
        $itens = PedidoItem::query()->where('situacao', 'vendido')->whereHas('pedido', fn ($q) => self::noPeriodo($q->where('status', 'confirmado'), $periodo, 'confirmadoEm'))
            ->get(['produtoId', 'referencia', 'nome', 'marca', 'categoria', 'imagem', 'quantidade', 'precoUnitario', 'custoUnitario', 'descontoCupom']);
        $nomes = User::query()->whereIn('papel', ['vendedor', 'gestor'])->pluck('name', 'id');
        $receita = (float) $vendas->sum('valor');
        $comCusto = $vendas->whereNotNull('custo');
        $receitaComCusto = (float) $comCusto->sum('valor');
        $custo = (float) $comCusto->sum('custo');

        $porVendedor = self::comLucro($vendas->groupBy('vendedorId')->map(fn ($l, $id) => [
            'chave' => $id, 'nome' => $nomes[$id] ?? 'Sem vendedor', 'n' => $l->count(), 'receita' => (float) $l->sum('valor'),
            'receitaComCusto' => (float) $l->whereNotNull('custo')->sum('valor'), 'custo' => (float) $l->whereNotNull('custo')->sum('custo'),
        ]))->sortByDesc('receita')->values();
        $agruparItens = fn (Collection $l, array $base) => [...$base, 'n' => (int) $l->sum('quantidade'),
            'receita' => (float) $l->sum(fn ($i) => (float) $i->precoUnitario * $i->quantidade - (float) $i->descontoCupom),
            'receitaComCusto' => (float) $l->whereNotNull('custoUnitario')->sum(fn ($i) => (float) $i->precoUnitario * $i->quantidade - (float) $i->descontoCupom),
            'custo' => (float) $l->whereNotNull('custoUnitario')->sum(fn ($i) => (float) $i->custoUnitario * $i->quantidade)];
        $porCategoria = self::comLucro($itens->groupBy('categoria')->map(fn ($l, $cat) => $agruparItens($l, ['chave' => (string) $cat, 'nome' => (string) $cat])))->sortByDesc('lucro')->values();
        $porProduto = self::comLucro($itens->groupBy('produtoId')->map(fn ($l) => $agruparItens($l, ['chave' => $l->first()->referencia, 'nome' => $l->first()->nome, 'imagem' => $l->first()->imagem, 'extra' => "{$l->first()->marca} · Ref. {$l->first()->referencia}"])))
            ->sort(fn ($a, $b) => [$b['lucro'], $b['receita']] <=> [$a['lucro'], $a['receita']])->take(10)->values();

        return [
            'receita' => $receita, 'custo' => $custo, 'lucro' => $receitaComCusto - $custo, 'margem' => $receitaComCusto ? ($receitaComCusto - $custo) / $receitaComCusto : null,
            'pecas' => (int) $itens->sum('quantidade'), 'vendas' => $vendas->count(), 'semCusto' => $vendas->count() - $comCusto->count(), 'manuais' => $vendas->whereNull('pedidoId')->count(),
            'porVendedor' => $porVendedor, 'porCategoria' => $porCategoria, 'porProduto' => $porProduto,
        ];
    }

    /**
     * Cupons em Resultados (docs/20). Os pessoais de próxima compra entram somados numa linha só.
     *
     * @param  ?array{0: CarbonInterface, 1: CarbonInterface}  $periodo
     */
    public static function cupons(?array $periodo): array
    {
        $pedidos = self::noPeriodo(Pedido::query()->where('status', 'confirmado')->whereNotNull('codigoCupom'), $periodo, 'confirmadoEm')
            ->with(['cupom:id,origem,descricao', 'venda:id,pedidoId,valor,custo'])->get(['id', 'codigoCupom', 'descontoCupom', 'freteCupom', 'cupomId']);
        $totalPedidos = self::noPeriodo(Pedido::query()->where('status', 'confirmado')->whereHas('venda'), $periodo, 'confirmadoEm')->count();
        $gerados = self::noPeriodo(Cupom::query()->where('origem', 'proximaCompra')->where('modelo', false), $periodo, 'criadoEm')
            ->with(['pedidos' => fn ($q) => $q->where('status', 'confirmado')->with('venda:id,pedidoId,valor')])->get(['id']);
        $porCupom = self::comLucro($pedidos->groupBy(fn ($p) => ($p->cupom?->origem?->value ?? null) === 'proximaCompra' ? 'proximaCompra' : $p->codigoCupom)->map(function ($l, $chave) {
            $pessoal = $chave === 'proximaCompra';
            $comCusto = $l->filter(fn ($p) => $p->venda?->custo !== null);

            return [
                'chave' => $chave, 'nome' => $pessoal ? 'Próxima compra (cupons pessoais)' : $chave, 'origem' => $l->first()->cupom?->origem?->value ?? 'manual',
                'pedidos' => $l->count(), 'desconto' => (float) $l->sum('descontoCupom'), 'fretes' => $l->where('freteCupom', true)->count(),
                'receita' => (float) $l->sum(fn ($p) => (float) ($p->venda?->valor ?? 0)), 'receitaComCusto' => (float) $comCusto->sum(fn ($p) => (float) $p->venda->valor),
                'custo' => (float) $comCusto->sum(fn ($p) => (float) $p->venda->custo), 'n' => $l->count(),
            ];
        }))->sortByDesc('receita')->values();
        $voltaram = $gerados->filter(fn ($g) => $g->pedidos->contains(fn ($p) => $p->venda));

        return [
            'pedidos' => $pedidos->count(), 'totalPedidos' => $totalPedidos, 'desconto' => (float) $porCupom->sum('desconto'), 'receita' => (float) $porCupom->sum('receita'),
            'fretes' => (int) $porCupom->sum('fretes'), 'porCupom' => $porCupom,
            'proxima' => ['gerados' => $gerados->count(), 'voltaram' => $voltaram->count(), 'receita' => (float) $voltaram->sum(fn ($g) => $g->pedidos->sum(fn ($p) => (float) ($p->venda?->valor ?? 0)))],
        ];
    }

    /**
     * Indicadores do atendimento: conversão, tempo do 1º contato, por canal, motivos de perda e recompra do pós-venda.
     *
     * @param  ?array{0: CarbonInterface, 1: CarbonInterface}  $periodo
     */
    public static function atendimento(?array $periodo): array
    {
        $lista = self::noPeriodo(Atendimento::query(), $periodo, 'criadoEm')->take(20000)->get(['canal', 'etapa', 'motivoPerda', 'criadoEm', 'primeiroContatoEm']);
        $contatos = self::noPeriodo(PosVendaContato::query()->whereNotNull('feitoEm')->whereIn('resultado', ['respondeu', 'nao_respondeu', 'virou_atendimento']), $periodo, 'feitoEm')
            ->take(20000)->get(['clienteId', 'feitoEm', 'resultado']);
        $ids = $contatos->pluck('clienteId')->unique()->values();
        $vendas = $ids->isEmpty() ? collect() : Venda::query()->whereIn('clienteId', $ids)->get(['clienteId', 'data']);
        $voltaram = $ids->filter(fn ($id) => $contatos->contains(fn ($c) => $c->clienteId === $id && $vendas->contains(fn ($v) => $v->clienteId === $id && $v->data > $c->feitoEm && $v->data->getTimestamp() - $c->feitoEm->getTimestamp() <= 90 * 86400)));

        return [
            ...AtendimentoController::desempenho($lista),
            'porCanal' => $lista->groupBy(fn ($a) => $a->canal->value)->map(fn ($l, $canal) => ['canal' => $canal, ...AtendimentoController::desempenho($l)])->sortByDesc('criados')->values(),
            'motivos' => $lista->whereNotNull('motivoPerda')->groupBy(fn ($a) => $a->motivoPerda->value ?? $a->motivoPerda)->map(fn ($l, $m) => ['motivo' => $m, 'n' => $l->count()])->sortByDesc('n')->values(),
            'posVenda' => ['feitos' => $contatos->count(), 'responderam' => $contatos->filter(fn ($c) => ($c->resultado->value ?? $c->resultado) !== 'nao_respondeu')->count(), 'clientes' => $ids->count(), 'voltaram' => $voltaram->count()],
        ];
    }
}
