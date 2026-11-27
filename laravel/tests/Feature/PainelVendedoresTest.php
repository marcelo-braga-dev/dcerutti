<?php

namespace Tests\Feature;

use App\Models\Cliente;
use App\Models\Meta;
use App\Models\Pedido;
use App\Models\User;
use App\Support\Datas;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia;
use Tests\Concerns\MundoDeTeste;
use Tests\TestCase;

/** Vendedores do gestor (porta das regras de src/server/acoes/gestao.ts). */
class PainelVendedoresTest extends TestCase
{
    use MundoDeTeste, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->criarMundo();
    }

    public function test_cadastra_com_senha_e_meta_do_mes_e_recusa_email_repetido(): void
    {
        $this->actingAs($this->gestora)->post('/painel/vendedores', ['nome' => 'Bia Costa', 'email' => 'Bia@Loja.com', 'senha' => 'curta'])->assertSessionHasErrors(['senha' => 'Defina uma senha com pelo menos 8 caracteres.']);
        $this->actingAs($this->gestora)->post('/painel/vendedores', ['nome' => 'Bia Costa', 'email' => 'Bia@Loja.com', 'senha' => 'senha-forte-1', 'meta' => '12.000,00', 'telefone' => '49999112233'])->assertRedirect();
        $bia = User::query()->where('email', 'bia@loja.com')->first();
        $this->assertSame(['vendedor', '(49) 99911-2233'], [$bia->papel->value, $bia->telefone]);
        $this->assertSame(12000.0, (float) Meta::query()->where('vendedorId', $bia->id)->where('mes', Datas::mes())->value('valor'));
        $this->actingAs($this->gestora)->post('/painel/vendedores', ['nome' => 'Outra', 'email' => 'bia@loja.com', 'senha' => 'senha-forte-1'])->assertSessionHasErrors(['email' => 'Este e-mail já está em uso.']);
        $this->actingAs($this->vendedora)->get('/painel/vendedores')->assertForbidden();
    }

    public function test_desativar_exige_transferir_e_leva_clientes_e_pedidos_em_aberto(): void
    {
        $v = $this->produtoDeTeste(['M' => 5])['v'];
        $p = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 1]]);
        $nova = User::factory()->vendedor()->create();
        $this->actingAs($this->gestora)->post("/painel/vendedores/{$this->vendedora->id}/desativar")->assertSessionHasErrors(['transferirPara' => 'Escolha para quem transferir os clientes e os pedidos em aberto.']);
        $this->actingAs($this->gestora)->post("/painel/vendedores/{$this->vendedora->id}/desativar", ['transferirPara' => $nova->id])->assertSessionHasNoErrors();
        $this->assertFalse($this->vendedora->fresh()->ativo);
        $this->assertSame($nova->id, Cliente::query()->find($this->cliente->id)->vendedorId);
        $this->assertSame($nova->id, Pedido::query()->find($p['id'])->vendedorId);
        $this->actingAs($this->gestora)->post("/painel/vendedores/{$this->vendedora->id}/reativar")->assertSessionHasNoErrors();
        $this->assertTrue($this->vendedora->fresh()->ativo);
    }

    public function test_perfil_lista_e_meta_de_outro_mes(): void
    {
        $this->actingAs($this->gestora)->get('/painel/vendedores')->assertOk()->assertInertia(fn (AssertableInertia $x) => $x->component('Painel/Vendedores/Index')->has('vendedores', 1));
        $this->actingAs($this->gestora)->get("/painel/vendedores/{$this->vendedora->id}")->assertOk()->assertInertia(fn (AssertableInertia $x) => $x->component('Painel/Vendedores/Show')->where('perfil.clientes', 1));
        $this->actingAs($this->gestora)->post("/painel/vendedores/{$this->vendedora->id}/metas", ['mes' => '2030-01', 'valor' => '9.500'])->assertSessionHasNoErrors();
        $this->assertSame(9500.0, (float) Meta::query()->where('vendedorId', $this->vendedora->id)->where('mes', '2030-01')->value('valor'));
    }
}
