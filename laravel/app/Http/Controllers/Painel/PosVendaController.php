<?php

namespace App\Http\Controllers\Painel;

use App\Exceptions\ErroNegocio;
use App\Http\Controllers\Controller;
use App\Models\Cliente;
use App\Models\PosVendaContato;
use App\Models\User;
use App\Services\Atendimentos;
use App\Services\Equipe;
use App\Support\Consentimento;
use App\Support\Escopo;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

/** Contatos de pós-venda na fila (src/server/acoes/pos-venda.ts). */
class PosVendaController extends Controller
{
    public const RESULTADOS = ['respondeu' => 'Respondeu', 'nao_respondeu' => 'Não respondeu', 'virou_atendimento' => 'Virou atendimento', 'pulado' => 'Pulado'];

    public function __construct(private Equipe $equipe) {}

    private function contato(User $u, int $id): PosVendaContato
    {
        $c = PosVendaContato::query()->with('cliente:id,nome,telefone,vendedorId')->find($id);
        if (! $c || ! Escopo::podeAcessar($u, $c->cliente?->vendedorId)) {
            throw new ErroNegocio('Contato não encontrado.');
        }

        return $c;
    }

    /** A condição `feitoEm` nula faz o segundo clique não sobrescrever o primeiro. */
    private static function concluir(int $id, string $usuarioId, string $resultado): void
    {
        PosVendaContato::query()->whereKey($id)->whereNull('feitoEm')->update(['feitoEm' => now()->format('Y-m-d H:i:s.v'), 'resultado' => $resultado, 'usuarioId' => $usuarioId]);
    }

    public function concluirContato(Request $request, int $id): RedirectResponse
    {
        $u = $request->user();
        $resultado = (string) $request->input('resultado');
        if (! isset(self::RESULTADOS[$resultado]) || $resultado === 'virou_atendimento') {
            $this->falhar('Resultado inválido.');
        }
        $c = $this->tentar(fn () => $this->contato($u, $id));
        self::concluir($c->id, $u->id, $resultado);
        if ($resultado !== 'pulado') {
            $this->equipe->registrar($u->id, 'pos_venda_feito', ['clienteId' => $c->clienteId, 'pedidoId' => $c->pedidoId, 'descricao' => "{$c->cliente->nome} · ".self::RESULTADOS[$resultado]]);
        }

        return back();
    }

    /** A conversa rendeu: abre um atendimento com a cliente, pela regra da carteira, e leva até ele. */
    public function viraAtendimento(Request $request, int $id, Atendimentos $atendimentos): RedirectResponse
    {
        $u = $request->user();
        $c = $this->tentar(fn () => $this->contato($u, $id));
        $a = $this->tentar(fn () => $atendimentos->criar($u, ['nome' => $c->cliente->nome, 'telefone' => $c->cliente->telefone, 'instagram' => null, 'canal' => 'whatsapp', 'nota' => 'Veio do pós-venda.']));
        self::concluir($c->id, $u->id, 'virou_atendimento');
        $this->equipe->registrar($u->id, 'pos_venda_feito', ['clienteId' => $c->clienteId, 'pedidoId' => $c->pedidoId, 'descricao' => "{$c->cliente->nome} · Virou atendimento"]);

        return redirect("/painel/atendimento/{$a['id']}");
    }

    /** Ela pediu para não receber ofertas: sai da fila de ofertas. Contato sobre o próprio pedido continua. */
    public function descadastrar(Request $request, string $clienteId): RedirectResponse
    {
        $c = Cliente::query()->find($clienteId, ['id', 'vendedorId', 'aceitaOfertasEm', 'descadastradaEm']);
        if (! $c || ! Escopo::podeAcessar($request->user(), $c->vendedorId)) {
            $this->falhar('Cliente não encontrada.');
        }
        $c->update(Consentimento::depois($c, false));

        return back();
    }
}
