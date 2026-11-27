<?php

namespace App\Http\Controllers\Painel;

use App\Exceptions\ErroNegocio;
use App\Http\Controllers\Controller;
use App\Models\Cliente;
use App\Models\User;
use App\Queries\Cupons;
use App\Services\Catalogo;
use App\Services\Config;
use App\Services\Equipe;
use App\Services\Pedidos\Pedidos;
use App\Support\Escopo;
use App\Support\Telefone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Novo pedido: a vendedora monta a seleção para a cliente (RF-23; src/app/(painel)/painel/pedidos/novo e criarSelecao). */
class NovoPedidoController extends Controller
{
    public function create(Request $request, Catalogo $catalogo, Config $config, Cupons $cupons): Response
    {
        /** @var User $u */
        $u = $request->user();
        $clientes = Escopo::vendedor(Cliente::query(), $u)->where('telefone', '<>', '')->orderBy('nome')->get(['id', 'nome', 'telefone']);
        $cliente = $request->query('cliente');
        $tipo = $request->query('tipo');

        return Inertia::render('Painel/Pedidos/Novo', [
            'clientes' => $clientes,
            'iniciais' => $catalogo->buscarPecas(''),
            'clienteInicial' => $clientes->contains('id', $cliente) ? $cliente : '',
            'tipoInicial' => in_array($tipo, ['balcao', 'condicional'], true) ? $tipo : 'compra',
            'buscaInicial' => mb_substr((string) $request->query('busca'), 0, 80),
            // Fase 3 dos cupons: só com os cupons ligados e a vendedora liberada (o gestor sempre).
            'cupons' => $config->get('cupons.ligados') && ($u->ehGestor() || $config->get('cupons.vendedorAplica'))
                ? collect($cupons->paraDivulgar($u))->filter(fn ($c) => $c['quemAplica'] !== 'cliente' && $c['situacao'] === 'ativo')
                    ->map(fn ($c) => ['codigo' => $c['codigo'], 'regra' => $c['regra'], 'clientes' => $c['especifico'] ? array_column($c['clientes'], 'id') : null])->values()->all()
                : null,
        ]);
    }

    /** Grava a seleção. "balcao" = venda na loja física: vira compra já confirmada (Q-04). Devolve o que a mensagem precisa. */
    public function store(Request $request, Pedidos $pedidos, Config $config, Equipe $equipe): JsonResponse
    {
        /** @var User $u */
        $u = $request->user();
        $d = $request->validate([
            'clienteId' => ['required', 'string'], 'tipo' => ['nullable', 'in:compra,condicional,balcao'], 'cupom' => ['nullable', 'string', 'max:40'],
            'linhas' => ['required', 'array', 'min:1', 'max:40'], 'linhas.*.varianteId' => ['required', 'integer'], 'linhas.*.quantidade' => ['required', 'integer', 'min:1', 'max:20'],
        ], ['linhas.*' => 'Adicione pelo menos uma peça.', 'linhas.required' => 'Adicione pelo menos uma peça.', 'clienteId.required' => 'Escolha o cliente.']);
        $balcao = ($d['tipo'] ?? null) === 'balcao';
        $tipo = ($d['tipo'] ?? null) === 'condicional' ? 'condicional' : 'compra';
        $cliente = Cliente::query()->find($d['clienteId']);
        if (! $cliente || ! Escopo::podeAcessar($u, $cliente->vendedorId)) {
            return response()->json(['ok' => false, 'erro' => 'Escolha o cliente.']);
        }
        if (! $balcao && ! Telefone::celularValido($cliente->telefone)) {
            return response()->json(['ok' => false, 'erro' => 'O WhatsApp deste cliente está incompleto no cadastro.']);
        }
        $codigoCupom = trim((string) ($d['cupom'] ?? ''));
        if ($codigoCupom !== '') {
            if (! $config->get('cupons.ligados')) {
                return response()->json(['ok' => false, 'erro' => 'Os cupons estão desligados em Configurações.']);
            }
            if (! $u->ehGestor() && ! $config->get('cupons.vendedorAplica')) {
                return response()->json(['ok' => false, 'erro' => 'A loja não liberou vendedores para aplicar cupons.']);
            }
        }
        try {
            $p = $pedidos->criar([
                'tipo' => $tipo, 'origem' => $balcao ? 'balcao' : 'vendedor', 'clienteId' => $cliente->id, 'cep' => $tipo === 'condicional' ? $cliente->cep : null,
                'vendedorId' => $u->ehGestor() ? $cliente->vendedorId : $u->id, 'nomeCliente' => $cliente->nome, 'telefoneCliente' => $cliente->telefone,
                'linhas' => array_map(fn ($l) => ['varianteId' => (int) $l['varianteId'], 'quantidade' => (int) $l['quantidade']], $d['linhas']), 'usuarioId' => $u->id,
                'cupom' => $codigoCupom !== '' ? ['codigo' => $codigoCupom, 'quem' => 'equipe'] : null,
            ]);
            if ($balcao) {
                $pedidos->confirmar($p['id'], [], $u->id);
            }
        } catch (ErroNegocio $e) {
            return response()->json(['ok' => false, 'erro' => $e->getMessage()]);
        }
        $pecas = array_sum(array_column($p['itens'], 'quantidade'));
        $valor = array_sum(array_map(fn ($i) => $i['preco'] * $i['quantidade'], $p['itens'])) - ($p['cupom']['desconto'] ?? 0);
        $equipe->registrar($u->id, $balcao ? 'venda_balcao' : 'pedido_criado', [
            'clienteId' => $cliente->id, 'pedidoId' => $p['id'], 'valor' => $valor,
            'descricao' => "{$cliente->nome} · {$p['codigo']} · ".($tipo === 'condicional' ? 'condicional · ' : '').$pecas.' '.($pecas === 1 ? 'peça' : 'peças'),
        ]);

        return response()->json([
            'ok' => true, 'pedidoId' => $p['id'], 'codigo' => $p['codigo'], 'tipo' => $tipo, 'telefone' => $cliente->telefone, 'nomeCliente' => $cliente->nome,
            'itens' => $p['itens'], 'cupom' => $p['cupom'], 'frete' => $p['frete'],
        ]);
    }
}
