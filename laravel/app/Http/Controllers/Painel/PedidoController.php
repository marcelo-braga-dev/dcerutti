<?php

namespace App\Http\Controllers\Painel;

use App\Http\Controllers\Controller;
use App\Models\Cliente;
use App\Models\Pedido;
use App\Models\User;
use App\Services\Config;
use App\Support\Escopo;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Pedidos da equipe (src/app/(painel)/painel/pedidos e src/server/consultas/pedidos.ts). */
class PedidoController extends Controller
{
    public const POR_PAGINA = 50;

    private const STATUS = ['pendente', 'confirmado', 'cancelado', 'todos'];

    public function index(Request $request, Config $config): Response
    {
        /** @var User $u */
        $u = $request->user();
        $status = in_array($request->query('status'), self::STATUS, true) ? $request->query('status') : 'pendente';
        $q = trim((string) $request->query('q'));
        $pagina = min(50, max(1, (int) $request->query('pagina', 1)));
        $cliente = $this->clienteDoFiltro($u, $request->query('cliente'));
        $vendedores = $u->ehGestor() ? User::query()->where('papel', 'vendedor')->orderByDesc('ativo')->orderBy('name')->get(['id', 'name', 'ativo']) : collect();
        $vendedor = $u->ehGestor() ? $vendedores->firstWhere('id', $request->query('vendedor')) : null;

        $filtros = fn () => Escopo::vendedor(Pedido::query(), $u)
            ->when($vendedor, fn ($x) => $x->where('vendedorId', $vendedor->id))
            ->when($cliente, fn ($x) => $x->where('clienteId', $cliente->id))
            ->when($q !== '', fn ($x) => $x->where(fn ($y) => $y->where('codigo', 'like', "%{$q}%")->orWhere('nomeCliente', 'like', "%{$q}%")));
        $lista = $filtros()->when($status !== 'todos', fn ($x) => $x->where('status', $status));
        $total = (clone $lista)->count();
        $pedidos = $lista->with(['vendedor:id,name', 'itens:id,pedidoId,imagem,nome,quantidade,situacao,precoUnitario,descontoCupom'])
            ->orderByDesc('criadoEm')->limit(self::POR_PAGINA * $pagina)->get();
        $contagens = $filtros()->selectRaw('status, count(*) as n')->groupBy('status')->pluck('n', 'status');

        return Inertia::render('Painel/Pedidos/Index', [
            'pedidos' => $pedidos->map(fn (Pedido $p) => self::resumo($p))->all(),
            'contagens' => ['pendente' => (int) ($contagens['pendente'] ?? 0), 'confirmado' => (int) ($contagens['confirmado'] ?? 0), 'cancelado' => (int) ($contagens['cancelado'] ?? 0)],
            'total' => $total,
            'filtros' => ['status' => $status, 'q' => $q ?: null, 'vendedor' => $vendedor?->id, 'cliente' => $cliente?->id, 'pagina' => $pagina],
            'cliente' => $cliente ? ['id' => $cliente->id, 'nome' => $cliente->nome] : null,
            'vendedores' => $vendedores->where('ativo', true)->map(fn ($v) => ['id' => $v->id, 'nome' => $v->name])->values()->all(),
            'diasExpiracao' => (int) $config->get('diasExpiracao'),
        ]);
    }

    private function clienteDoFiltro(User $u, ?string $id): ?Cliente
    {
        if (! $id) {
            return null;
        }
        $c = Cliente::query()->find($id, ['id', 'nome', 'vendedorId']);

        return $c && Escopo::podeAcessar($u, $c->vendedorId) ? $c : null;
    }

    /** @return array<string, mixed> */
    public static function resumo(Pedido $p): array
    {
        return [
            'id' => $p->id, 'codigo' => $p->codigo, 'tipo' => $p->tipo->value, 'status' => $p->status->value, 'origem' => $p->origem->value,
            'nomeCliente' => $p->nomeCliente, 'telefoneCliente' => $p->telefoneCliente, 'criadoEm' => $p->criadoEm?->toIso8601String(),
            'total' => (float) $p->total, 'frete' => $p->frete === null ? null : (float) $p->frete, 'descontoCupom' => (float) $p->descontoCupom,
            'codigoCupom' => $p->codigoCupom, 'freteCupom' => $p->freteCupom, 'pagamentoSituacao' => $p->pagamentoSituacao->value,
            'motivoCancelamento' => $p->motivoCancelamento, 'vendedor' => ['id' => $p->vendedor?->id, 'nome' => $p->vendedor?->name],
            'itens' => $p->itens->map(fn ($i) => [
                'id' => $i->id, 'imagem' => $i->imagem, 'nome' => $i->nome, 'quantidade' => $i->quantidade, 'situacao' => $i->situacao->value,
                'precoUnitario' => (float) $i->precoUnitario, 'descontoCupom' => (float) $i->descontoCupom,
            ])->all(),
        ];
    }
}
