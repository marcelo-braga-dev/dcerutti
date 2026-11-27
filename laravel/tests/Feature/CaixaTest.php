<?php

namespace Tests\Feature;

use App\Enums\StatusPedido;
use App\Models\Cliente;
use App\Models\Cupom;
use App\Models\Pedido;
use App\Models\PedidoItem;
use App\Models\User;
use App\Services\Caixa;
use App\Services\Config;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia;
use Tests\Concerns\MundoDeTeste;
use Tests\TestCase;

/** Caixa da loja física (porta de tests/integracao/caixa.test.ts). */
class CaixaTest extends TestCase
{
    use MundoDeTeste, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->criarMundo();
    }

    private function vender(User $u, array $dados): array
    {
        return $this->actingAs($u)->postJson('/caixa/vendas', $dados)->assertOk()->json();
    }

    public function test_sem_cliente_vai_para_consumidor_final_confirma_baixa_estoque_e_grava_pagamentos(): void
    {
        ['v' => $v] = $this->produtoDeTeste(['M' => 5], 100);
        $r = $this->vender($this->vendedora, ['linhas' => [['varianteId' => $v['M'], 'quantidade' => 2]], 'pagamentos' => [['forma' => 'pix', 'valor' => 120], ['forma' => 'dinheiro', 'valor' => 80, 'recebido' => 100]]]);
        $this->assertSame([true, 200, 20, null], [$r['ok'], $r['total'], $r['troco'], $r['telefone']]);
        $p = Pedido::query()->with(['pagamentos', 'venda', 'cliente'])->find($r['pedidoId']);
        $this->assertSame(['balcao', StatusPedido::Confirmado, 'Consumidor final', ''], [$p->origem->value, $p->status, $p->nomeCliente, $p->telefoneCliente]);
        $this->assertSame(Caixa::CONSUMIDOR_EMAIL, $p->cliente->email);
        $this->assertSame([['pix', 120.0, null], ['dinheiro', 80.0, 100.0]], $p->pagamentos->map(fn ($g) => [$g->forma->value, (float) $g->valor, $g->recebido === null ? null : (float) $g->recebido])->all());
        $this->assertSame([$this->vendedora->id, 'Caixa da loja'], [$p->venda->vendedorId, $p->venda->observacao]);
        $this->assertSame(3, $this->variante($v['M'])->estoque);
        $this->assertEquals([200, 0], [$r['subtotal'], $r['desconto']]);
    }

    public function test_desconto_do_vendedor_dentro_do_limite_e_acima_so_o_gestor(): void
    {
        ['v' => $v] = $this->produtoDeTeste(['M' => 5], 100);
        $ok = $this->vender($this->vendedora, ['linhas' => [['varianteId' => $v['M'], 'quantidade' => 1, 'precoCombinado' => 90]], 'pagamentos' => [['forma' => 'debito', 'valor' => 90]]]);
        $this->assertSame([true, 90], [$ok['ok'], $ok['total']]);
        $item = PedidoItem::query()->where('pedidoId', $ok['pedidoId'])->first();
        $this->assertSame([90.0, 100.0], [(float) $item->precoUnitario, (float) $item->precoTabela]);

        $geral = ['linhas' => [['varianteId' => $v['M'], 'quantidade' => 1]], 'descontoGeral' => ['tipo' => 'percentual', 'valor' => 25], 'pagamentos' => [['forma' => 'pix', 'valor' => 75]]];
        $this->assertStringContainsString('só o gestor', $this->vender($this->vendedora, $geral)['erro']);
        $this->assertStringContainsString('Vendido por', $this->vender($this->gestora, $geral)['erro']);
        $this->assertSame([true, 75], array_values(array_intersect_key($this->vender($this->gestora, [...$geral, 'vendedorId' => $this->vendedora->id]), ['ok' => 0, 'total' => 0])));
    }

    public function test_pagamento_que_nao_fecha_o_total_nao_confirma_nada(): void
    {
        ['v' => $v] = $this->produtoDeTeste(['M' => 2], 100);
        $r = $this->vender($this->vendedora, ['linhas' => [['varianteId' => $v['M'], 'quantidade' => 1]], 'pagamentos' => [['forma' => 'pix', 'valor' => 50]]]);
        $this->assertSame([false, 100], [$r['ok'], $r['total']]);
        $this->assertStringContainsString('os pagamentos somam R$'."\u{a0}".'50,00', $r['erro']);
        $this->assertSame(2, $this->variante($v['M'])->estoque);
        $this->assertFalse(Pedido::query()->where('status', StatusPedido::Confirmado)->exists());
    }

    public function test_recusas_credito_acima_das_parcelas_sem_estoque_e_cliente_de_outra(): void
    {
        ['v' => $v] = $this->produtoDeTeste(['M' => 1], 60);
        $this->assertStringContainsString('até 6x', $this->vender($this->vendedora, ['linhas' => [['varianteId' => $v['M'], 'quantidade' => 1]], 'pagamentos' => [['forma' => 'credito', 'valor' => 60, 'parcelas' => 13]]])['erro']);
        $this->assertFalse($this->vender($this->vendedora, ['linhas' => [['varianteId' => $v['M'], 'quantidade' => 2]], 'pagamentos' => [['forma' => 'pix', 'valor' => 120]]])['ok']);
        $outra = User::factory()->vendedor()->create();
        $deOutra = Cliente::query()->create(['vendedorId' => $outra->id, 'nome' => 'Da Outra', 'telefone' => '(49) 99111-2222']);
        $this->assertStringContainsString('Cliente não encontrada', $this->vender($this->vendedora, ['linhas' => [['varianteId' => $v['M'], 'quantidade' => 1]], 'clienteId' => $deOutra->id, 'pagamentos' => [['forma' => 'pix', 'valor' => 60]]])['erro']);
    }

    public function test_cadastro_rapido_e_venda_identificada(): void
    {
        $c = $this->actingAs($this->vendedora)->postJson('/caixa/clientes', ['nome' => 'Cliente do Balcão', 'telefone' => '49988776655'])->json();
        $this->assertSame([true, false, '(49) 98877-6655'], [$c['ok'], $c['existente'], $c['cliente']['telefone']]);
        $this->actingAs($this->vendedora)->postJson('/caixa/clientes', ['nome' => 'Outra', 'telefone' => '(49) 98877-6655'])->assertJson(['ok' => true, 'existente' => true]);
        $outra = User::factory()->vendedor()->create(['name' => 'Carla']);
        Cliente::query()->create(['vendedorId' => $outra->id, 'nome' => 'Da Carla', 'telefone' => '(49) 99111-3333']);
        $this->assertStringContainsString('já é cliente de Carla', $this->actingAs($this->vendedora)->postJson('/caixa/clientes', ['nome' => 'Outra', 'telefone' => '49991113333'])->json('erro'));
        $this->actingAs($this->vendedora)->getJson('/caixa/clientes?q=balc')->assertJsonCount(1)->assertJsonPath('0.nome', 'Cliente do Balcão');
        $this->actingAs($this->vendedora)->getJson('/caixa/clientes?q=3333')->assertJsonCount(0);

        ['v' => $v] = $this->produtoDeTeste(['M' => 2], 80);
        $r = $this->vender($this->vendedora, ['linhas' => [['varianteId' => $v['M'], 'quantidade' => 1]], 'clienteId' => $c['cliente']['id'], 'pagamentos' => [['forma' => 'credito', 'valor' => 80, 'parcelas' => 3]]]);
        $this->assertSame([true, 'Cliente do Balcão', '(49) 98877-6655'], [$r['ok'], $r['nomeCliente'], $r['telefone']]);
    }

    public function test_cupom_no_caixa_e_vendas_do_dia(): void
    {
        app(Config::class)->salvar(['cupons' => ['ligados' => true, 'vendedorAplica' => true]]);
        Cupom::query()->create(['codigo' => 'BALCAO10', 'tipo' => 'percentual', 'valor' => 10, 'quemAplica' => 'ambos', 'origem' => 'manual', 'ativo' => true, 'inicioEm' => now()->subDay()]);
        ['v' => $v] = $this->produtoDeTeste(['M' => 5], 100);
        $linhas = [['varianteId' => $v['M'], 'quantidade' => 1, 'precoCombinado' => 95]];
        $this->actingAs($this->vendedora)->postJson('/caixa/cupom', ['codigo' => 'balcao10', 'linhas' => $linhas])->assertJson(['ok' => true, 'codigo' => 'BALCAO10', 'desconto' => 9.5]);
        $r = $this->vender($this->vendedora, ['linhas' => $linhas, 'cupom' => 'BALCAO10', 'pagamentos' => [['forma' => 'pix', 'valor' => 85.5]]]);
        $this->assertSame([true, 85.5], [$r['ok'], $r['total']]);
        $this->assertSame(['codigo' => 'BALCAO10', 'desconto' => 9.5], $r['cupom']);
        $this->vender($this->vendedora, ['linhas' => [['varianteId' => $v['M'], 'quantidade' => 1]], 'pagamentos' => [['forma' => 'dinheiro', 'valor' => 100, 'recebido' => 150]]]);

        $this->actingAs($this->vendedora)->get('/caixa/vendas')->assertOk()->assertInertia(fn (AssertableInertia $p) => $p->component('Caixa/Vendas')
            ->where('r.vendas', 2)->where('r.total', 185.5)->where('r.troco', 50)->has('r.porForma', 2)->where('r.porVendedor.0.nome', $this->vendedora->name));
        $outra = User::factory()->vendedor()->create();
        $this->actingAs($outra)->get('/caixa/vendas')->assertInertia(fn (AssertableInertia $p) => $p->where('r.vendas', 0));
        $this->actingAs($this->vendedora)->get('/caixa')->assertOk()->assertInertia(fn (AssertableInertia $p) => $p->component('Caixa/Index')->where('resumo.vendas', 2)->where('vendedores', null)->has('produtos'));
        $this->actingAs($this->cliente->user ?? User::factory()->create())->get('/caixa')->assertRedirect('/');
    }
}
