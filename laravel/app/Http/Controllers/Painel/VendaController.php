<?php

namespace App\Http\Controllers\Painel;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Venda;
use App\Services\Equipe;
use App\Support\Datas;
use App\Support\Escopo;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Vendas do mês (src/app/(painel)/painel/vendas e src/server/consultas/vendas.ts). */
class VendaController extends Controller
{
    public function index(Request $request): Response
    {
        /** @var User $u */
        $u = $request->user();
        $atual = Datas::mes();
        $mes = Datas::mesValido($request->query('mes')) && $request->query('mes') <= $atual ? $request->query('mes') : $atual;
        $vendedores = $u->ehGestor() ? User::query()->where('papel', 'vendedor')->orderByDesc('ativo')->orderBy('name')->get(['id', 'name', 'ativo']) : collect();
        $vendedor = $vendedores->firstWhere('id', $request->query('vendedor'));
        [$de, $ate] = Datas::intervaloDoMes($mes);
        $doMes = fn () => Escopo::vendedor(Venda::query(), $u)->where('data', '>=', $de)->where('data', '<', $ate);
        $vendas = $doMes()->when($vendedor, fn ($q) => $q->where('vendedorId', $vendedor->id))
            ->with(['cliente:id,nome', 'pedido:id,codigo', 'vendedor:id,name'])->orderByDesc('data')->get();
        $porVendedor = $u->ehGestor() ? $doMes()->selectRaw('vendedorId, sum(valor) as total')->groupBy('vendedorId')->pluck('total', 'vendedorId') : collect();

        return Inertia::render('Painel/Vendas/Index', [
            'mes' => $mes, 'atual' => $atual,
            'vendas' => $vendas->map(fn (Venda $v) => [
                'id' => $v->id, 'data' => $v->data->toIso8601String(), 'valor' => (float) $v->valor, 'observacao' => $v->observacao, 'pedidoId' => $v->pedidoId,
                'cliente' => $v->cliente ? ['id' => $v->cliente->id, 'nome' => $v->cliente->nome] : null,
                'pedido' => $v->pedido ? ['id' => $v->pedido->id, 'codigo' => $v->pedido->codigo] : null,
                'vendedor' => ['id' => $v->vendedor->id, 'nome' => $v->vendedor->name],
            ])->all(),
            'vendedores' => $vendedores->filter(fn ($v) => $v->ativo || isset($porVendedor[$v->id]))->map(fn ($v) => ['id' => $v->id, 'nome' => $v->name, 'total' => (float) ($porVendedor[$v->id] ?? 0)])->values()->all(),
            'vendedor' => $vendedor ? ['id' => $vendedor->id, 'nome' => $vendedor->name] : null,
        ]);
    }

    /** Só venda manual (sem pedido); a de pedido se desfaz pelo pedido. */
    public function destroy(Request $request, string $id, Equipe $equipe): RedirectResponse
    {
        $v = Venda::query()->find($id);
        if (! $v || ! Escopo::podeAcessar($request->user(), $v->vendedorId)) {
            $this->falhar('Venda não encontrada.');
        }
        if ($v->pedidoId) {
            $this->falhar('Venda de pedido não se exclui por aqui.');
        }
        $v->delete();
        $equipe->registrar($request->user()->id, 'venda_excluida', ['clienteId' => $v->clienteId, 'valor' => $v->valor, 'descricao' => $v->observacao]);

        return back()->with('sucesso', 'Venda excluída.');
    }
}
