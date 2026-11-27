<?php

namespace Tests\Feature;

use App\Models\AtividadeEquipe;
use App\Models\Cupom;
use App\Models\SessaoEquipe;
use App\Models\User;
use App\Services\Config;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia;
use Tests\Concerns\MundoDeTeste;
use Tests\TestCase;

/** Telas e ações de pedidos do painel (porta das actions de src/server/acoes/pedidos.ts). */
class PainelPedidosTest extends TestCase
{
    use MundoDeTeste, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->criarMundo();
    }

    public function test_lista_com_abas_contagens_e_escopo_da_vendedora(): void
    {
        $v = $this->produtoDeTeste(['M' => 10])['v'];
        $meu = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 1]]);
        $outra = User::factory()->vendedor()->create();
        $this->cliente->update(['vendedorId' => $outra->id]);
        $this->pedidos()->criar([...$this->base(), 'vendedorId' => $outra->id, 'tipo' => 'compra', 'origem' => 'loja', 'linhas' => [['varianteId' => $v['M'], 'quantidade' => 1]]]);

        $this->actingAs($this->vendedora)->get('/painel/pedidos')->assertOk()->assertInertia(fn (AssertableInertia $p) => $p
            ->component('Painel/Pedidos/Index')->has('pedidos', 1)->where('pedidos.0.codigo', $meu['codigo'])->where('contagens.pendente', 1));
        $this->actingAs($this->gestora)->get('/painel/pedidos?status=todos')->assertInertia(fn (AssertableInertia $p) => $p->has('pedidos', 2)->has('vendedores'));
    }

    public function test_detalhe_so_para_quem_atende(): void
    {
        $v = $this->produtoDeTeste(['M' => 5])['v'];
        $p = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 1]]);
        $this->actingAs($this->vendedora)->get("/painel/pedidos/{$p['id']}")->assertOk()->assertInertia(fn (AssertableInertia $x) => $x
            ->component('Painel/Pedidos/Show')->where('pedido.codigo', $p['codigo'])->has('pedido.itens', 1)->has('pedido.historico', 1));
        $this->actingAs(User::factory()->vendedor()->create())->get("/painel/pedidos/{$p['id']}")->assertNotFound();
        $this->actingAs(User::factory()->vendedor()->create())->post("/painel/pedidos/{$p['id']}/confirmar")->assertNotFound();
    }

    public function test_confirmar_condicional_pelo_painel_e_registrar_a_acao(): void
    {
        $v = $this->produtoDeTeste(['M' => 5, 'G' => 5])['v'];
        $p = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 2], ['varianteId' => $v['G'], 'quantidade' => 1]], 'condicional');
        [$m, $g] = $this->itensDe($p['id'])->all();

        $this->actingAs($this->vendedora)->post("/painel/pedidos/{$p['id']}/confirmar", ['ficaram' => [$m->id => 1]])->assertSessionHasErrors(['erro' => 'Marque quantas unidades de cada peça ficaram.']);
        $this->actingAs($this->vendedora)->post("/painel/pedidos/{$p['id']}/confirmar", ['ficaram' => [$m->id => '1', $g->id => '0']])->assertSessionHasNoErrors()->assertSessionHas('sucesso');
        $this->assertSame('confirmado', $this->pedido($p['id'])->status->value);
        $this->assertSame(4, $this->variante($v['M'])->estoque);
        $this->assertTrue(AtividadeEquipe::query()->where('usuarioId', $this->vendedora->id)->where('tipo', 'pedido_confirmado')->exists());
    }

    public function test_editar_itens_com_desconto_e_avisar_a_cliente(): void
    {
        $v = $this->produtoDeTeste(['M' => 5], 100)['v'];
        $p = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 1]]);
        $m = $this->itensDe($p['id'])->first();
        $this->actingAs($this->vendedora)->post("/painel/pedidos/{$p['id']}/itens", ['linhas' => [['itemId' => $m->id, 'varianteId' => $v['M'], 'quantidade' => 2, 'preco' => 90]], 'observacao' => 'Pediu desconto'])
            ->assertSessionHasNoErrors()->assertSessionHas('avisarCliente', true);
        $this->assertSame(180.0, (float) $this->pedido($p['id'])->total);
        $this->actingAs($this->vendedora)->post("/painel/pedidos/{$p['id']}/itens", ['linhas' => [['itemId' => $m->id, 'varianteId' => $v['M'], 'quantidade' => 9, 'preco' => 90]]])
            ->assertSessionHasErrors('erro');
    }

    public function test_cupom_pelo_painel_respeita_a_configuracao(): void
    {
        $v = $this->produtoDeTeste(['M' => 5], 100)['v'];
        $p = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 1]]);
        Cupom::query()->create(['codigo' => 'EQUIPE10', 'tipo' => 'percentual', 'valor' => 10, 'quemAplica' => 'equipe', 'limitePorCliente' => null, 'inicioEm' => now()->subDay()]);
        $this->actingAs($this->vendedora)->post("/painel/pedidos/{$p['id']}/cupom", ['codigo' => 'EQUIPE10'])->assertSessionHasErrors(['erro' => 'Os cupons estão desligados em Configurações.']);
        app(Config::class)->salvar(['cupons' => ['ligados' => true, 'vendedorAplica' => false]]);
        $this->actingAs($this->vendedora)->post("/painel/pedidos/{$p['id']}/cupom", ['codigo' => 'EQUIPE10'])->assertSessionHasErrors(['erro' => 'A loja não liberou vendedores para aplicar cupons.']);
        $this->actingAs($this->gestora)->post("/painel/pedidos/{$p['id']}/cupom", ['codigo' => 'equipe10'])->assertSessionHasNoErrors();
        $this->assertSame(90.0, (float) $this->pedido($p['id'])->total);
        $this->actingAs($this->vendedora)->post("/painel/pedidos/{$p['id']}/cupom", ['codigo' => ''])->assertSessionHasNoErrors();
        $this->assertNull($this->pedido($p['id'])->cupomId, 'retirar vale sempre');
    }

    public function test_cancelar_exige_motivo_e_desfaz_venda_confirmada(): void
    {
        $v = $this->produtoDeTeste(['M' => 5])['v'];
        $p = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 1]]);
        $this->actingAs($this->vendedora)->post("/painel/pedidos/{$p['id']}/cancelar", ['motivo' => 'x'])->assertSessionHasErrors(['erro' => 'Informe o motivo do cancelamento.']);
        $this->pedidos()->confirmar($p['id'], [], $this->vendedora->id);
        $this->actingAs($this->vendedora)->post("/painel/pedidos/{$p['id']}/cancelar", ['motivo' => 'Cliente devolveu as peças'])->assertSessionHasNoErrors();
        $this->assertSame([5, 'cancelado'], [$this->variante($v['M'])->estoque, $this->pedido($p['id'])->status->value]);
        $this->actingAs($this->vendedora)->post("/painel/pedidos/{$p['id']}/cancelar", ['motivo' => 'De novo'])->assertSessionHasErrors(['erro' => 'Este pedido já foi cancelado.']);

        $q = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 1]], 'condicional');
        $this->actingAs($this->vendedora)->post("/painel/pedidos/{$q['id']}/cancelar", ['motivo' => 'Prazo vencido sem resposta', 'expirado' => true])->assertSessionHasNoErrors();
        $this->assertSame('expirado', $this->pedido($q['id'])->motivoCancelamento);
    }

    public function test_situacao_de_pagamento_e_entrega(): void
    {
        $v = $this->produtoDeTeste(['M' => 5])['v'];
        $p = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 1]]);
        $this->actingAs($this->vendedora)->post("/painel/pedidos/{$p['id']}/situacao", ['pagamento' => 'pago', 'entrega' => 'enviado'])->assertSessionHasNoErrors();
        $ped = $this->pedido($p['id']);
        $this->assertSame(['pago', 'enviado'], [$ped->pagamentoSituacao->value, $ped->entregaSituacao->value]);
        $this->actingAs($this->vendedora)->post("/painel/pedidos/{$p['id']}/situacao", ['pagamento' => 'estornado', 'entrega' => 'enviado'])->assertSessionHasErrors('pagamento');
    }

    public function test_busca_de_pecas_com_estoque(): void
    {
        ['ref' => $ref] = $this->produtoDeTeste(['M' => 2]);
        ['ref' => $sem] = $this->produtoDeTeste(['M' => 0]);
        $r = $this->actingAs($this->vendedora)->getJson('/painel/pecas/busca?q='.strtolower($ref))->assertOk()->json();
        $this->assertSame([$ref], array_column($r, 'referencia'));
        $this->assertSame([], $this->actingAs($this->vendedora)->getJson("/painel/pecas/busca?q={$sem}")->json());
    }

    public function test_novo_pedido_selecao_condicional_e_venda_na_loja(): void
    {
        $v = $this->produtoDeTeste(['M' => 5], 100)['v'];
        $this->actingAs($this->vendedora)->get('/painel/pedidos/novo?tipo=balcao&cliente='.$this->cliente->id)->assertOk()
            ->assertInertia(fn (AssertableInertia $p) => $p->component('Painel/Pedidos/Novo')->where('tipoInicial', 'balcao')->where('clienteInicial', $this->cliente->id)->has('clientes', 1));

        $r = $this->actingAs($this->vendedora)->postJson('/painel/pedidos', ['clienteId' => $this->cliente->id, 'tipo' => 'condicional', 'linhas' => [['varianteId' => $v['M'], 'quantidade' => 2]]])->assertOk()->json();
        $this->assertTrue($r['ok']);
        $this->assertStringStartsWith('COND-', $r['codigo']);
        $this->assertSame(['vendedor', 2], [$this->pedido($r['pedidoId'])->origem->value, $this->variante($v['M'])->reservado]);

        $b = $this->actingAs($this->vendedora)->postJson('/painel/pedidos', ['clienteId' => $this->cliente->id, 'tipo' => 'balcao', 'linhas' => [['varianteId' => $v['M'], 'quantidade' => 1]]])->json();
        $this->assertSame(['balcao', 'confirmado'], [$this->pedido($b['pedidoId'])->origem->value, $this->pedido($b['pedidoId'])->status->value]);
        $this->assertSame(4, $this->variante($v['M'])->estoque);
        $this->assertTrue(AtividadeEquipe::query()->where('tipo', 'venda_balcao')->exists());

        $outra = User::factory()->vendedor()->create();
        $this->assertSame(['ok' => false, 'erro' => 'Escolha o cliente.'], $this->actingAs($outra)->postJson('/painel/pedidos', ['clienteId' => $this->cliente->id, 'linhas' => [['varianteId' => $v['M'], 'quantidade' => 1]]])->json());
        $this->cliente->update(['telefone' => '(49) 9999-1']);
        $this->assertSame('O WhatsApp deste cliente está incompleto no cadastro.', $this->actingAs($this->vendedora)->postJson('/painel/pedidos', ['clienteId' => $this->cliente->id, 'linhas' => [['varianteId' => $v['M'], 'quantidade' => 1]]])->json('erro'));
    }

    public function test_sinal_da_equipe_soma_presenca_e_registra_envio(): void
    {
        $v = $this->produtoDeTeste(['M' => 5])['v'];
        $p = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 1]]);
        $this->actingAs($this->vendedora)->call('POST', '/api/equipe', [], [], [], ['CONTENT_TYPE' => 'text/plain'], json_encode(['seg' => 60, 'envios' => [['acao' => 'oferta', 'pedidoId' => $p['id']]]]))->assertNoContent();
        $this->actingAs($this->vendedora)->call('POST', '/api/equipe', [], [], [], ['CONTENT_TYPE' => 'text/plain'], json_encode(['seg' => 30]))->assertNoContent();
        $this->assertSame(90, (int) SessaoEquipe::query()->where('usuarioId', $this->vendedora->id)->value('segundos'));
        $this->assertTrue(AtividadeEquipe::query()->where('tipo', 'oferta_enviada')->where('pedidoId', $p['id'])->exists());
        $this->actingAs($this->vendedora)->call('POST', '/api/equipe', [], [], [], ['CONTENT_TYPE' => 'text/plain', 'HTTP_ORIGIN' => 'https://golpe.com'], '{}')->assertStatus(403);
    }
}
