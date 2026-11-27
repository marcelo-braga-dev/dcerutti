<?php

namespace App\Http\Controllers\Painel;

use App\Http\Controllers\Controller;
use App\Models\Atividade;
use App\Models\Cliente;
use App\Models\PedidoItem;
use App\Models\Produto;
use App\Models\SacolaCliente;
use App\Models\User;
use App\Services\Config;
use App\Support\Datas;
use App\Support\Escopo;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response;

/** Interesse na loja (docs/21; porta de painel/interesse e consultas/navegacao.ts relatorioInteresse): o que as clientes veem, procuram e separam. */
class InteresseController extends Controller
{
    private const PERIODOS = [7, 30, 90];

    /** @return list<array{valor: string, n: int, parte: float}> */
    private static function ranking(Collection $itens, callable $chave): array
    {
        $soma = $itens->map($chave)->filter()->countBy();
        $total = $soma->sum();

        return $soma->map(fn ($n, $v) => ['valor' => (string) $v, 'n' => $n, 'parte' => $total ? $n / $total : 0])
            ->sort(fn ($a, $b) => [$b['n'], $a['valor']] <=> [$a['n'], $b['valor']])->values()->all();
    }

    public function __invoke(Request $request, Config $config): Response
    {
        $u = $request->user();
        $dias = in_array((int) $request->query('dias'), self::PERIODOS, true) ? (int) $request->query('dias') : 30;

        return Inertia::render('Painel/Interesse', [...self::relatorio($u, $dias), 'dias' => $dias, 'historicoLigado' => (bool) $config->get('historico.ligado')]);
    }

    public static function relatorio(User $u, int $dias): array
    {
        $ids = $u->ehGestor() ? null : Escopo::vendedor(Cliente::query(), $u)->pluck('id');
        $base = fn () => Atividade::query()->when($ids, fn ($q) => $q->whereIn('clienteId', $ids))->where('criadoEm', '>=', now()->subDays($dias));
        $ativas = $base()->distinct()->pluck('clienteId');
        $visitas = $base()->where('tipo', 'acesso')->get(['criadoEm', 'aparelho', 'clienteId']);
        $vistos = $base()->where('tipo', 'produto')->whereNotNull('produtoId')->groupBy('produtoId')->selectRaw('produtoId, count(*) n')->orderByDesc('n')->take(20)->pluck('n', 'produtoId');
        $clientesPorProduto = $base()->where('tipo', 'produto')->whereIn('produtoId', $vistos->keys())->selectRaw('produtoId, count(distinct clienteId) n')->groupBy('produtoId')->pluck('n', 'produtoId');
        $sacola = $base()->where('tipo', 'sacola')->whereIn('produtoId', $vistos->keys())->get(['produtoId', 'dados'])
            ->groupBy('produtoId')->map(fn ($l) => $l->sum(fn ($a) => max(0, (int) ($a->dados['delta'] ?? 0))));
        $buscas = $base()->where('tipo', 'busca')->take(5000)->get(['termo', 'dados']);
        $maisAtivas = $base()->whereIn('tipo', ['pagina', 'produto', 'busca', 'filtro'])->groupBy('clienteId')->selectRaw('clienteId, count(*) n')->orderByDesc('n')->take(10)->pluck('n', 'clienteId');
        $pedidas = PedidoItem::query()->whereIn('produtoId', $vistos->keys())->whereHas('pedido', fn ($q) => $q->where('criadoEm', '>=', now()->subDays($dias))->where('status', '<>', 'cancelado')->when($ids, fn ($w) => $w->whereIn('clienteId', $ids)))
            ->groupBy('produtoId')->selectRaw('produtoId, sum(quantidade) n')->pluck('n', 'produtoId');
        $produtos = Produto::query()->with(['imagens' => fn ($q) => $q->orderBy('ordem'), 'variantes:id,produtoId,estoque,reservado'])->whereIn('id', $vistos->keys())->get()->keyBy('id');
        $nomes = Cliente::query()->with('vendedor:id,name')->whereIn('id', $maisAtivas->keys())->get(['id', 'nome', 'ultimoAcessoEm', 'vendedorId'])->keyBy('id');

        return [
            'kpis' => ['clientesAtivas' => $ativas->count(), 'visitas' => $visitas->count(), 'vistas' => $base()->where('tipo', 'produto')->count(), 'sacolasAbertas' => SacolaCliente::query()->when($ids, fn ($q) => $q->whereIn('clienteId', $ids))->count()],
            'produtos' => $vistos->map(function ($n, $id) use ($produtos, $clientesPorProduto, $sacola, $pedidas) {
                $p = $produtos[$id] ?? null;

                return $p ? ['produto' => ['id' => $p->id, 'referencia' => $p->referencia, 'nome' => $p->nome, 'preco' => (float) $p->preco, 'imagem' => $p->imagens->first()?->url, 'disponivel' => $p->variantes->sum(fn ($v) => max(0, $v->estoque - $v->reservado))],
                    'vistas' => (int) $n, 'clientes' => (int) ($clientesPorProduto[$id] ?? 0), 'sacola' => (int) ($sacola[$id] ?? 0), 'pedidas' => (int) ($pedidas[$id] ?? 0)] : null;
            })->filter()->values(),
            'semResultado' => array_slice(self::ranking($buscas->filter(fn ($b) => ($b->dados['resultados'] ?? null) === 0), fn ($b) => $b->termo ? mb_strtolower($b->termo) : null), 0, 15),
            'maisBuscadas' => array_slice(self::ranking($buscas, fn ($b) => $b->termo ? mb_strtolower($b->termo) : null), 0, 15),
            'porDia' => collect(self::ranking($visitas, fn ($v) => Datas::dia($v->criadoEm)))->sortBy('valor')->values(),
            'aparelhos' => self::ranking($visitas, fn ($v) => $v->aparelho),
            'porVendedor' => $ids ? [] : self::ranking(Cliente::query()->with('vendedor:id,name')->whereIn('id', $ativas)->get(['id', 'vendedorId']), fn ($c) => $c->vendedor?->name),
            'maisAtivas' => $maisAtivas->map(fn ($n, $id) => isset($nomes[$id]) ? ['id' => $id, 'nome' => $nomes[$id]->nome, 'vendedor' => $nomes[$id]->vendedor?->name, 'ultimoAcessoEm' => $nomes[$id]->ultimoAcessoEm?->toIso8601String(), 'paginas' => (int) $n] : null)->filter()->values(),
        ];
    }
}
