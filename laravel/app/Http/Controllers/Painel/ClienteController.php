<?php

namespace App\Http\Controllers\Painel;

use App\Http\Controllers\Controller;
use App\Models\Cliente;
use App\Models\User;
use App\Models\Venda;
use App\Support\Escopo;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Clientes da equipe (src/app/(painel)/painel/clientes e src/server/consultas/clientes.ts). */
class ClienteController extends Controller
{
    public const POR_PAGINA = 60;

    private const COMPRAS = ['nunca', 'recente', 'parada'];

    private const ORDENS = ['nome', 'total', 'compra', 'acesso'];

    public function index(Request $request): Response
    {
        /** @var User $u */
        $u = $request->user();
        $gestor = $u->ehGestor();
        $q = trim((string) $request->query('q'));
        $pagina = min(50, max(1, (int) $request->query('pagina', 1)));
        $f = [
            'vendedor' => $gestor ? ($request->query('vendedor') ?: null) : null,
            'compra' => in_array($request->query('compra'), self::COMPRAS, true) ? $request->query('compra') : null,
            'acesso' => in_array($request->query('acesso'), ['com', 'sem'], true) ? $request->query('acesso') : null,
            'recentes' => $request->query('recentes') === '1', 'sacola' => $request->query('sacola') === '1',
            'ordem' => in_array($request->query('ordem'), self::ORDENS, true) ? $request->query('ordem') : 'nome',
        ];
        $agrupar = $gestor && $request->query('ver') === 'vendedor' && ! $f['vendedor'];

        // B-11: ficha anonimizada (telefone vazio) fica fora das listas.
        $base = fn () => Escopo::vendedor(Cliente::query(), $u)->where('telefone', '<>', '')
            ->when($q !== '', fn ($x) => $x->where(fn ($y) => collect(['nome', 'telefone', 'instagram', 'cpf', 'cidade', 'endereco', 'email'])->each(fn ($c) => $y->orWhere($c, 'like', "%{$q}%"))))
            ->when($f['recentes'], fn ($x) => $x->where('ultimoAcessoEm', '>=', now()->subDays(7)))
            ->when($f['sacola'], fn ($x) => $x->whereHas('sacola'))
            ->when($f['acesso'] === 'com', fn ($x) => $x->whereNotNull('userId'))->when($f['acesso'] === 'sem', fn ($x) => $x->whereNull('userId'));
        $vendas = Venda::query()->whereNotNull('clienteId')->whereIn('clienteId', $base()->select('id'))
            ->selectRaw('clienteId, sum(valor) as total, max(data) as ultima, count(*) as n')->groupBy('clienteId')->get()->keyBy('clienteId');
        $compradores = $vendas->keys()->all();
        $porCompra = match ($f['compra']) {
            'nunca' => fn ($x) => $x->whereNotIn('id', $compradores ?: ['']),
            'recente' => fn ($x) => $x->whereIn('id', $vendas->filter(fn ($v) => $v->ultima >= now()->subDays(30)->format('Y-m-d H:i:s'))->keys()->all() ?: ['']),
            'parada' => fn ($x) => $x->whereIn('id', $vendas->filter(fn ($v) => $v->ultima < now()->subDays(90)->format('Y-m-d H:i:s'))->keys()->all() ?: ['']),
            default => fn ($x) => $x,
        };
        $semVendedor = fn () => $porCompra($base());
        $consulta = $semVendedor()->when($gestor && $f['vendedor'], fn ($x) => $x->where('vendedorId', $f['vendedor']));
        $total = (clone $consulta)->count();
        $emMemoria = in_array($f['ordem'], ['total', 'compra'], true);
        $consulta->with(['vendedor:id,name', 'sacola:clienteId,atualizadoEm'])->withCount(['pedidos as pendentes' => fn ($x) => $x->where('status', 'pendente')]);
        if ($f['ordem'] === 'acesso') {
            $consulta->orderByRaw('ultimoAcessoEm IS NULL')->orderByDesc('ultimoAcessoEm');
        }
        $consulta->orderBy('nome');
        $lista = $emMemoria ? $consulta->get() : $consulta->limit(self::POR_PAGINA * $pagina)->get();
        if ($emMemoria) {
            $valor = fn ($c) => (float) ($vendas[$c->id]->total ?? 0);
            $ultima = fn ($c) => (string) ($vendas[$c->id]->ultima ?? '');
            $lista = $lista->sort(fn ($a, $b) => ($f['ordem'] === 'total' ? $valor($b) <=> $valor($a) : $ultima($b) <=> $ultima($a)) ?: strcoll($a->nome, $b->nome))->take(self::POR_PAGINA * $pagina)->values();
        }
        $porVendedor = $gestor ? $semVendedor()->selectRaw('vendedorId, count(*) as n')->groupBy('vendedorId')->pluck('n', 'vendedorId') : collect();
        $vendedores = $gestor ? User::query()->where('papel', 'vendedor')->orderByDesc('ativo')->orderBy('name')->get(['id', 'name', 'ativo']) : collect();

        return Inertia::render('Painel/Clientes/Index', [
            'clientes' => $lista->map(fn (Cliente $c) => [
                'id' => $c->id, 'nome' => $c->nome, 'telefone' => $c->telefone, 'cidade' => $c->cidade, 'temConta' => (bool) $c->userId, 'sacola' => (bool) $c->sacola,
                'ultimoAcessoEm' => $c->ultimoAcessoEm?->toIso8601String(), 'pendentes' => $c->pendentes, 'vendedor' => ['id' => $c->vendedor->id, 'nome' => $c->vendedor->name],
                'comprado' => isset($vendas[$c->id]) ? (float) $vendas[$c->id]->total : null, 'ultimaCompra' => isset($vendas[$c->id]) ? CarbonImmutable::parse($vendas[$c->id]->ultima, 'UTC')->toIso8601String() : null,
            ])->values()->all(),
            'total' => $total, 'pagina' => $pagina, 'agrupar' => $agrupar,
            'filtros' => [
                'q' => $q ?: null, 'vendedor' => $f['vendedor'], 'compra' => $f['compra'], 'acesso' => $f['acesso'], 'recentes' => $f['recentes'] ? '1' : null,
                'sacola' => $f['sacola'] ? '1' : null, 'ordem' => $f['ordem'] === 'nome' ? null : $f['ordem'], 'ver' => $agrupar ? 'vendedor' : null,
            ],
            'vendedores' => $vendedores->filter(fn ($v) => $v->ativo || isset($porVendedor[$v->id]))->map(fn ($v) => ['id' => $v->id, 'nome' => $v->name, 'ativo' => $v->ativo, 'n' => (int) ($porVendedor[$v->id] ?? 0)])->values()->all(),
        ]);
    }
}
