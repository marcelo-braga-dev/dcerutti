<?php

namespace App\Http\Controllers\Painel;

use App\Http\Controllers\Controller;
use App\Models\Pedido;
use App\Models\User;
use App\Models\Venda;
use App\Queries\Equipe;
use App\Queries\Navegacao;
use App\Services\Config;
use App\Support\Datas;
use App\Support\Escopo;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Início do painel (src/app/(painel)/painel/page.tsx): meta, o que pede ação primeiro (D-36), interessadas e vendas. */
class InicioController extends Controller
{
    public function __invoke(Request $request, Equipe $equipe, Navegacao $navegacao, Config $config): Response
    {
        /** @var User $u */
        $u = $request->user();
        $gestor = $u->ehGestor();
        $mes = Datas::mes();
        [$de, $ate] = Datas::intervaloDoMes($mes);
        $vendedores = User::query()->where('papel', 'vendedor')->where('ativo', true)->when(! $gestor, fn ($q) => $q->whereKey($u->id))
            ->with('numeroPrincipal:id,apelido,telefone,status')->withCount('clientes')->orderBy('name')->get();
        $metas = $equipe->metasDoMes($vendedores->pluck('id')->all(), $mes);
        $vendido = $equipe->vendidoPorVendedor($mes, $gestor ? null : $u->id);
        $aResponder = $gestor ? collect() : Escopo::vendedor(Pedido::query(), $u)->where('status', 'pendente')
            ->with(['vendedor:id,name', 'itens:id,pedidoId,imagem,nome,quantidade,situacao,precoUnitario,descontoCupom'])->orderBy('criadoEm')->limit(6)->get();

        return Inertia::render('Painel/Inicio', [
            'mes' => $mes,
            'ranking' => $vendedores->map(fn (User $v) => [
                'id' => $v->id, 'nome' => $v->name, 'clientes' => $v->clientes_count, 'meta' => $metas[$v->id] ?? 0, 'valor' => $vendido[$v->id]['valor'] ?? 0, 'n' => $vendido[$v->id]['n'] ?? 0,
                'numero' => $v->numeroPrincipal && $v->numeroPrincipal->status->value === 'ativo' ? ['apelido' => $v->numeroPrincipal->apelido, 'telefone' => $v->numeroPrincipal->telefone] : null,
            ])->sortByDesc('valor')->values()->all(),
            'totalVendido' => array_sum(array_column($vendido, 'valor')), 'totalVendas' => array_sum(array_column($vendido, 'n')),
            'pendentes' => Escopo::vendedor(Pedido::query(), $u)->where('status', 'pendente')->count(),
            'aResponder' => $aResponder->map(fn ($p) => PedidoController::resumo($p))->all(),
            'recentes' => Escopo::vendedor(Venda::query(), $u)->where('data', '>=', $de)->where('data', '<', $ate)->with(['cliente:id,nome', 'vendedor:id,name'])->orderByDesc('data')->limit(8)->get()
                ->map(fn ($v) => ['id' => $v->id, 'valor' => (float) $v->valor, 'data' => $v->data->toIso8601String(), 'observacao' => $v->observacao, 'cliente' => $v->cliente ? ['id' => $v->cliente->id, 'nome' => $v->cliente->nome] : null, 'vendedor' => $v->vendedor->name])->all(),
            'interessados' => $config->get('historico.ligado') ? $navegacao->interessadosAgora($u) : null,
            'linkConvite' => $gestor ? null : rtrim((string) config('app.url'), '/')."/cadastro?v={$u->id}",
        ]);
    }
}
