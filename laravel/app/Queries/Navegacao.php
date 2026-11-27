<?php

namespace App\Queries;

use App\Models\Atividade;
use App\Models\Categoria;
use App\Models\Cliente;
use App\Models\Favorito;
use App\Models\Marca;
use App\Models\Pedido;
use App\Models\PedidoItem;
use App\Models\Produto;
use App\Models\SacolaCliente;
use App\Models\User;
use App\Models\Variante;
use App\Support\Escopo;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * Histórico do cliente (docs/21; src/server/consultas/navegacao.ts): leituras do painel. A vendedora só vê as clientes
 * dela; o gestor, todas (D-18: a linha do tempo é completa para quem atende).
 */
class Navegacao
{
    public const FILTROS_LINHA = [
        'pecas' => ['rotulo' => 'Peças', 'tipos' => ['produto', 'tamanho']],
        'buscas' => ['rotulo' => 'Buscas e filtros', 'tipos' => ['busca', 'filtro']],
        'sacola' => ['rotulo' => 'Sacola e cupons', 'tipos' => ['sacola', 'cupom']],
        'acessos' => ['rotulo' => 'Acessos', 'tipos' => ['login', 'acesso', 'whatsapp']],
        'pedidos' => ['rotulo' => 'Pedidos', 'tipos' => []],
    ];

    public function clienteDaEquipe(User $u, string $id): ?Cliente
    {
        $c = Cliente::query()->find($id, ['id', 'nome', 'telefone', 'vendedorId', 'userId', 'ultimoLoginEm', 'ultimoAcessoEm']);

        return $c && Escopo::podeAcessar($u, $c->vendedorId) ? $c : null;
    }

    /**
     * Nome, foto, preço e estoque dos produtos (inclusive desativados: o histórico continua legível).
     *
     * @param  list<int>  $ids
     * @return Collection<int, array<string, mixed>>
     */
    public function produtosPorId(array $ids): Collection
    {
        if (! $ids) {
            return collect();
        }

        return Produto::query()->whereIn('id', array_unique($ids))->with(['marca:id,nome,slug', 'categoria:id,nome,slug', 'imagens' => fn ($q) => $q->orderBy('ordem'), 'variantes:id,produtoId,estoque,reservado'])
            ->get()->mapWithKeys(fn (Produto $p) => [$p->id => [
                'id' => $p->id, 'referencia' => $p->referencia, 'nome' => $p->nome, 'marca' => $p->marca->nome, 'marcaSlug' => $p->marca->slug,
                'categoria' => $p->categoria->nome, 'categoriaSlug' => $p->categoria->slug, 'genero' => $p->genero->value, 'preco' => (float) $p->preco,
                'precoCheio' => (float) $p->precoCheio, 'imperdivel' => $p->imperdivel, 'ativo' => $p->ativo, 'imagem' => $p->imagens->first()?->url,
                'disponivel' => $p->variantes->sum(fn ($v) => max(0, $v->estoque - $v->reservado)),
            ]]);
    }

    /** Itens válidos da sacola guardada ([{ varianteId, quantidade }]). @return list<array{varianteId: int, quantidade: int}> */
    public static function itensSacola(mixed $itens): array
    {
        return array_values(array_filter(array_map(fn ($i) => is_array($i) && is_int($i['varianteId'] ?? null) && is_int($i['quantidade'] ?? null) && $i['quantidade'] > 0
            ? ['varianteId' => $i['varianteId'], 'quantidade' => min($i['quantidade'], 20)] : null, is_array($itens) ? $itens : [])));
    }

    /** Sacola guardada da cliente, com as peças como estão hoje. @return ?array<string, mixed> */
    public function sacolaDe(string $clienteId): ?array
    {
        $s = SacolaCliente::query()->find($clienteId);
        if (! $s) {
            return null;
        }
        $itens = self::itensSacola($s->itens);
        $variantes = Variante::query()->whereIn('id', array_column($itens, 'varianteId'))->get(['id', 'tamanho', 'estoque', 'reservado', 'produtoId'])->keyBy('id');
        $produtos = $this->produtosPorId($variantes->pluck('produtoId')->all());
        $linhas = [];
        foreach ($itens as $i) {
            $v = $variantes->get($i['varianteId']);
            $p = $v ? $produtos->get($v->produtoId) : null;
            if ($p) {
                $linhas[] = [...$i, 'tamanho' => $v->tamanho, 'disponivel' => max(0, $v->estoque - $v->reservado), 'produto' => $p];
            }
        }

        return ['atualizadoEm' => $s->atualizadoEm?->toIso8601String(), 'avisadoEm' => $s->avisadoEm?->toIso8601String(), 'linhas' => $linhas, 'total' => array_sum(array_map(fn ($l) => $l['produto']['preco'] * $l['quantidade'], $linhas))];
    }

    /** @param iterable<mixed> $itens @return list<array{valor: string, n: int|float, parte: float}> */
    private static function ranking(iterable $itens, callable $chave): array
    {
        $soma = [];
        foreach ($itens as $x) {
            $k = $chave($x);
            if ($k !== null && $k !== '') {
                $soma[$k] = ($soma[$k] ?? 0) + 1;
            }
        }
        $total = array_sum($soma);
        $r = [];
        foreach ($soma as $valor => $n) {
            $r[] = ['valor' => (string) $valor, 'n' => $n, 'parte' => $total ? $n / $total : 0];
        }
        usort($r, fn ($a, $b) => $b['n'] <=> $a['n'] ?: strcmp($a['valor'], $b['valor']));

        return $r;
    }

    /** Card "Interesse e acesso" da ficha: resumo, peças mais vistas, sacola, preferências e buscas. @return ?array<string, mixed> */
    public function interesse(User $u, string $clienteId): ?array
    {
        $c = $this->clienteDaEquipe($u, $clienteId);
        if (! $c) {
            return null;
        }
        $desde = fn (int $dias) => now()->subDays($dias);
        $base = fn () => Atividade::query()->where('clienteId', $clienteId);
        $acessos = $base()->whereIn('tipo', ['acesso', 'login'])->where('criadoEm', '>=', $desde(90))->get(['tipo', 'aparelho', 'criadoEm']);
        $paginas30 = $base()->whereIn('tipo', ['pagina', 'produto', 'busca', 'filtro'])->where('criadoEm', '>=', $desde(30))->selectRaw('count(*) as n, coalesce(sum(duracaoSeg),0) as seg')->first();
        $vistos = $base()->where('tipo', 'produto')->whereNotNull('produtoId')->selectRaw('produtoId, count(*) as vezes, max(criadoEm) as ultima, coalesce(sum(duracaoSeg),0) as tempo')->groupBy('produtoId')->get();
        $tamanhos = $base()->where('tipo', 'tamanho')->orderByDesc('criadoEm')->limit(300)->get(['produtoId', 'termo']);
        $sacolaEventos = $base()->where('tipo', 'sacola')->orderByDesc('criadoEm')->limit(500)->get(['produtoId', 'termo', 'dados']);
        $buscas = $base()->where('tipo', 'busca')->orderByDesc('criadoEm')->limit(15)->get(['termo', 'dados', 'criadoEm']);
        $pedidos = PedidoItem::query()->whereHas('pedido', fn ($q) => $q->where('clienteId', $clienteId)->where('status', '<>', 'cancelado'))->with('pedido:id,status')->get(['id', 'pedidoId', 'produtoId', 'situacao']);
        $favoritos = Favorito::query()->where('clienteId', $clienteId)->orderByDesc('criadoEm')->limit(24)->get(['produtoId', 'criadoEm']);

        $visitas = $acessos->where('tipo.value', 'acesso');
        $produtos = $this->produtosPorId([...$vistos->pluck('produtoId')->all(), ...$favoritos->pluck('produtoId')->all()]);
        $delta = fn ($e) => (int) (($e->dados['delta'] ?? 0));
        $adicionados = [];
        foreach ($sacolaEventos as $e) {
            if ($e->produtoId && $delta($e) > 0) {
                $adicionados[$e->produtoId] = ($adicionados[$e->produtoId] ?? 0) + $delta($e);
            }
        }
        $comprados = $pedidos->filter(fn ($i) => $i->pedido->status->value === 'confirmado' && $i->situacao->value !== 'devolvido')->pluck('produtoId')->unique()->all();
        $pediu = $pedidos->pluck('produtoId')->unique()->all();
        $tamPorProduto = [];
        foreach ($tamanhos as $t) {
            if ($t->produtoId && $t->termo && ! in_array($t->termo, $tamPorProduto[$t->produtoId] ?? [], true)) {
                $tamPorProduto[$t->produtoId][] = $t->termo;
            }
        }
        $pecas = $vistos->map(function ($v) use ($produtos, $tamPorProduto, $adicionados, $comprados, $pediu) {
            $p = $produtos->get($v->produtoId);

            return $p ? [
                'produto' => $p, 'vezes' => (int) $v->vezes, 'ultimaVez' => CarbonImmutable::parse($v->ultima, 'UTC')->toIso8601String(), 'tempo' => (int) $v->tempo,
                'tamanhos' => $tamPorProduto[$p['id']] ?? [], 'naSacola' => $adicionados[$p['id']] ?? 0,
                'situacao' => in_array($p['id'], $comprados, true) ? 'comprou' : (in_array($p['id'], $pediu, true) ? 'pediu' : null),
            ] : null;
        })->filter()->sort(fn ($a, $b) => $b['vezes'] <=> $a['vezes'] ?: strcmp($b['ultimaVez'], $a['ultimaVez']))->values();
        // Preferências: o que ela mais olha (cada visualização conta 1) e os tamanhos que escolhe ou põe na sacola.
        $visto = $pecas->flatMap(fn ($x) => array_fill(0, $x['vezes'], $x['produto']));

        return [
            'resumo' => [
                'ultimoLoginEm' => $c->ultimoLoginEm?->toIso8601String(), 'ultimoAcessoEm' => $c->ultimoAcessoEm?->toIso8601String(),
                'visitas7' => $visitas->filter(fn ($v) => $v->criadoEm >= $desde(7))->count(), 'visitas30' => $visitas->filter(fn ($v) => $v->criadoEm >= $desde(30))->count(),
                'paginas30' => (int) $paginas30->n, 'tempo30' => (int) $paginas30->seg, 'aparelho' => self::ranking($acessos, fn ($a) => $a->aparelho)[0]['valor'] ?? null,
            ],
            'pecas' => $pecas->take(12)->all(),
            'favoritos' => $favoritos->map(fn ($f) => $produtos->has($f->produtoId) ? ['produto' => $produtos->get($f->produtoId), 'criadoEm' => $f->criadoEm->toIso8601String()] : null)->filter()->values()->all(),
            'totalPecasVistas' => $pecas->count(),
            'sacola' => $this->sacolaDe($clienteId),
            'preferencias' => [
                'categorias' => array_slice(self::ranking($visto, fn ($p) => $p['categoria']), 0, 5),
                'marcas' => array_slice(self::ranking($visto, fn ($p) => $p['marca']), 0, 5),
                'generos' => self::ranking($visto, fn ($p) => $p['genero']),
                'tamanhos' => array_slice(self::ranking([...$tamanhos->pluck('termo')->all(), ...$sacolaEventos->filter(fn ($e) => $delta($e) > 0)->pluck('termo')->all()], fn ($t) => $t), 0, 5),
                'promocao' => $visto->count() ? $visto->filter(fn ($p) => $p['imperdivel'] || $p['preco'] < $p['precoCheio'])->count() / $visto->count() : null,
            ],
            'buscas' => $buscas->map(fn ($b) => ['termo' => $b->termo ?? '', 'resultados' => $b->dados['resultados'] ?? null, 'criadoEm' => $b->criadoEm->toIso8601String()])->all(),
        ];
    }

    /** Linha do tempo completa, mais nova primeiro; os pedidos da cliente entram no meio. @return ?array<string, mixed> */
    public function linhaDoTempo(User $u, string $clienteId, int $limite = 200, ?string $filtro = null): ?array
    {
        $c = $this->clienteDaEquipe($u, $clienteId);
        if (! $c) {
            return null;
        }
        $tipos = $filtro ? self::FILTROS_LINHA[$filtro]['tipos'] : null;
        $consulta = fn () => Atividade::query()->where('clienteId', $clienteId)->when($tipos, fn ($q) => $q->whereIn('tipo', $tipos));
        $semEventos = $tipos !== null && count($tipos) === 0;
        $eventos = $semEventos ? collect() : $consulta()->orderByDesc('criadoEm')->orderByDesc('id')->limit($limite)->get();
        $total = $semEventos ? 0 : $consulta()->count();
        $maisAntigo = $eventos->last()?->criadoEm;
        $pedidos = ! $filtro || $filtro === 'pedidos'
            ? Pedido::query()->where('clienteId', $clienteId)->when($maisAntigo && $total > $eventos->count(), fn ($q) => $q->where('criadoEm', '>=', $maisAntigo))
                ->orderByDesc('criadoEm')->limit(200)->get(['id', 'codigo', 'tipo', 'status', 'origem', 'total', 'criadoEm'])
            : collect();
        $produtos = $this->produtosPorId($eventos->pluck('produtoId')->filter()->all());
        $itens = $eventos->map(fn ($e) => ['tipo' => 'atividade', 'id' => (string) $e->id, 'criadoEm' => $e->criadoEm->toIso8601String(), 'evento' => [
            'id' => (string) $e->id, 'tipo' => $e->tipo->value, 'caminho' => $e->caminho, 'produtoId' => $e->produtoId, 'varianteId' => $e->varianteId, 'termo' => $e->termo,
            'dados' => $e->dados, 'duracaoSeg' => $e->duracaoSeg, 'aparelho' => $e->aparelho, 'criadoEm' => $e->criadoEm->toIso8601String(),
        ], 'produto' => $e->produtoId ? $produtos->get($e->produtoId) : null])->all();
        foreach ($pedidos as $p) {
            $itens[] = ['tipo' => 'pedido', 'id' => $p->id, 'criadoEm' => $p->criadoEm->toIso8601String(), 'pedido' => ['id' => $p->id, 'codigo' => $p->codigo, 'tipo' => $p->tipo->value, 'status' => $p->status->value, 'origem' => $p->origem->value, 'total' => (float) $p->total]];
        }
        usort($itens, fn ($a, $b) => strcmp($b['criadoEm'], $a['criadoEm']));

        return [
            'cliente' => ['id' => $c->id, 'nome' => $c->nome, 'telefone' => $c->telefone, 'temConta' => (bool) $c->userId, 'ultimoAcessoEm' => $c->ultimoAcessoEm?->toIso8601String()],
            'itens' => $itens, 'total' => $total, 'mostrando' => $eventos->count(),
            'nomes' => ['categorias' => Categoria::query()->pluck('nome', 'slug'), 'marcas' => Marca::query()->pluck('nome', 'slug')],
        ];
    }

    /**
     * Painel: clientes que mostraram interesse nos últimos 7 dias (sacola aberta ou a mesma peça vista 3 vezes ou mais).
     *
     * @return list<array<string, mixed>>
     */
    public function interessadosAgora(User $u): array
    {
        $semana = now()->subDays(7);
        $ativos = Escopo::vendedor(Cliente::query(), $u)->where('ultimoAcessoEm', '>=', $semana)->where('telefone', '<>', '')
            ->with('vendedor:id,name')->orderByDesc('ultimoAcessoEm')->limit(300)->get(['id', 'nome', 'telefone', 'ultimoAcessoEm', 'vendedorId']);
        if ($ativos->isEmpty()) {
            return [];
        }
        $ids = $ativos->pluck('id')->all();
        $sacolas = SacolaCliente::query()->whereIn('clienteId', $ids)->get(['clienteId', 'itens'])->keyBy('clienteId');
        $repetidos = Atividade::query()->whereIn('clienteId', $ids)->where('tipo', 'produto')->where('criadoEm', '>=', $semana)->whereNotNull('produtoId')
            ->selectRaw('clienteId, produtoId, count(*) as n')->groupBy('clienteId', 'produtoId')->havingRaw('count(*) >= 3')->get();
        $produtos = $this->produtosPorId($repetidos->pluck('produtoId')->all());
        $lista = [];
        foreach ($ativos as $c) {
            $motivos = [];
            $pecas = isset($sacolas[$c->id]) ? array_sum(array_column(self::itensSacola($sacolas[$c->id]->itens), 'quantidade')) : 0;
            if ($pecas) {
                $motivos[] = $pecas.' '.($pecas === 1 ? 'peça' : 'peças').' na sacola';
            }
            foreach ($repetidos->where('clienteId', $c->id)->sortByDesc('n')->take(2) as $r) {
                if ($p = $produtos->get($r->produtoId)) {
                    $motivos[] = "viu {$r->n}× {$p['nome']}";
                }
            }
            if ($motivos) {
                $lista[] = ['id' => $c->id, 'nome' => $c->nome, 'telefone' => $c->telefone, 'ultimoAcessoEm' => $c->ultimoAcessoEm?->toIso8601String(), 'vendedor' => $c->vendedor?->name, 'motivos' => $motivos];
            }
            if (count($lista) >= 10) {
                break;
            }
        }

        return $lista;
    }
}
