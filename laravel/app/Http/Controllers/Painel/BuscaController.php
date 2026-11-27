<?php

namespace App\Http\Controllers\Painel;

use App\Http\Controllers\Controller;
use App\Models\Cliente;
use App\Models\Pedido;
use App\Models\User;
use App\Services\Catalogo;
use App\Support\Escopo;
use App\Support\Pecas;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Busca geral da barra superior (D-28): clientes, pedidos e peças de uma vez, com o escopo de quem busca. */
class BuscaController extends Controller
{
    public function __invoke(Request $request, Catalogo $catalogo): Response
    {
        /** @var User $u */
        $u = $request->user();
        $q = mb_substr(trim((string) $request->query('q')), 0, 80);
        if (mb_strlen($q) < 2) {
            return Inertia::render('Painel/Busca', ['q' => $q, 'resultados' => null]);
        }
        $clientes = Escopo::vendedor(Cliente::query(), $u)->where('telefone', '<>', '')
            ->where(fn ($y) => collect(['nome', 'telefone', 'instagram', 'cpf', 'cidade', 'endereco', 'email'])->each(fn ($c) => $y->orWhere($c, 'like', "%{$q}%")));
        $pedidos = Escopo::vendedor(Pedido::query(), $u)->where(fn ($y) => $y->where('codigo', 'like', "%{$q}%")->orWhere('nomeCliente', 'like', "%{$q}%"));
        $termos = array_values(array_filter(preg_split('/\s+/', Pecas::normalizar($q)) ?: []));
        $pecas = collect($catalogo->lista())->filter(function ($p) use ($termos) {
            $alvo = Pecas::normalizar("{$p['nome']} {$p['referencia']} {$p['categoria']} ".($p['cor'] ?? ''));

            return collect($termos)->every(fn ($t) => str_contains($alvo, $t));
        })->take(12);

        return Inertia::render('Painel/Busca', ['q' => $q, 'resultados' => [
            'totalClientes' => (clone $clientes)->count(),
            'clientes' => $clientes->with('vendedor:id,name')->orderBy('nome')->limit(10)->get(['id', 'nome', 'telefone', 'vendedorId'])->map(fn ($c) => ['id' => $c->id, 'nome' => $c->nome, 'telefone' => $c->telefone, 'vendedor' => $c->vendedor?->name])->all(),
            'totalPedidos' => (clone $pedidos)->count(),
            'pedidos' => $pedidos->orderByDesc('criadoEm')->limit(10)->get(['id', 'codigo', 'tipo', 'status', 'nomeCliente', 'criadoEm', 'total'])
                ->map(fn ($p) => ['id' => $p->id, 'codigo' => $p->codigo, 'tipo' => $p->tipo->value, 'status' => $p->status->value, 'nomeCliente' => $p->nomeCliente, 'criadoEm' => $p->criadoEm->toIso8601String(), 'total' => (float) $p->total])->all(),
            'pecas' => $pecas->map(fn ($p) => ['id' => $p['id'], 'referencia' => $p['referencia'], 'nome' => $p['nome'], 'preco' => $p['preco'], 'imagem' => $p['imagens'][0] ?? null, 'estoque' => array_sum(array_column($p['variantes'], 'disponivel'))])->values()->all(),
        ]]);
    }
}
