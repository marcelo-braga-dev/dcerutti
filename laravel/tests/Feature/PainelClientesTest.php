<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\AtividadeEquipe;
use App\Models\Cliente;
use App\Models\Pedido;
use App\Models\User;
use App\Models\Venda;
use App\Support\Datas;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia;
use Tests\Concerns\MundoDeTeste;
use Tests\TestCase;

/** Clientes no painel (porta das regras de src/server/acoes/clientes.ts e consultas/clientes.ts). */
class PainelClientesTest extends TestCase
{
    use MundoDeTeste, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->criarMundo();
    }

    /** @param array<string, mixed> $extra @return array<string, mixed> */
    private function dados(array $extra = []): array
    {
        return ['nome' => 'Clara Nunes', 'telefone' => '49999887766', 'cidade' => 'Maravilha', ...$extra];
    }

    public function test_vendedora_cadastra_para_si_e_o_gestor_escolhe_a_vendedora(): void
    {
        $this->actingAs($this->vendedora)->post('/painel/clientes', $this->dados(['cpf' => '529.982.247-25', 'instagram' => '@Clara.Nunes', 'aceitaOfertas' => true]))->assertRedirect();
        $c = Cliente::query()->where('nome', 'Clara Nunes')->first();
        $this->assertSame([$this->vendedora->id, '(49) 99988-7766', '529.982.247-25', 'clara.nunes'], [$c->vendedorId, $c->telefone, $c->cpf, $c->instagram]);
        $this->assertNotNull($c->aceitaOfertasEm);
        $this->assertTrue(AtividadeEquipe::query()->where('tipo', 'cliente_cadastrado')->where('clienteId', $c->id)->exists());

        $this->actingAs($this->gestora)->post('/painel/clientes', $this->dados(['nome' => 'Sem Vendedora', 'telefone' => '49999887700']))->assertSessionHasErrors(['vendedorId' => 'Escolha o vendedor.']);
        $this->actingAs($this->gestora)->post('/painel/clientes', $this->dados(['nome' => 'Com Vendedora', 'telefone' => '49999887701', 'vendedorId' => $this->vendedora->id]))->assertSessionHasNoErrors();
    }

    public function test_validacoes_de_telefone_cpf_e_email(): void
    {
        $this->actingAs($this->vendedora)->post('/painel/clientes', $this->dados(['telefone' => '4999988']))->assertSessionHasErrors(['telefone' => 'Informe o WhatsApp com DDD e 9 dígitos.']);
        $this->actingAs($this->vendedora)->post('/painel/clientes', $this->dados(['cpf' => '111.111.111-11']))->assertSessionHasErrors(['cpf' => 'CPF inválido. Confira os 11 números.']);
        $this->cliente->update(['cpf' => '529.982.247-25']);
        $this->actingAs($this->vendedora)->post('/painel/clientes', $this->dados(['cpf' => '52998224725']))->assertSessionHasErrors(['cpf' => 'Este CPF já está na ficha de outra cliente.']);
        $this->actingAs($this->vendedora)->post('/painel/clientes', $this->dados(['email' => $this->gestora->email]))->assertSessionHasErrors(['email' => 'Este e-mail já está em uso.']);
    }

    public function test_email_e_senha_criam_o_acesso_e_so_o_gestor_troca_depois(): void
    {
        $this->actingAs($this->vendedora)->post('/painel/clientes', $this->dados(['email' => 'Clara@Exemplo.com', 'senha' => 'senha-forte-1']))->assertSessionHasNoErrors();
        $c = Cliente::query()->where('nome', 'Clara Nunes')->first();
        $this->assertNotNull($c->userId);
        $this->assertSame('clara@exemplo.com', User::query()->find($c->userId)->email);

        $this->actingAs($this->vendedora)->put("/painel/clientes/{$c->id}", $this->dados(['email' => 'clara@exemplo.com', 'senha' => 'outra-senha-9']))->assertSessionHasErrors(['senha' => 'Só o gestor troca a senha de um cliente com acesso à loja.']);
        $this->actingAs($this->vendedora)->put("/painel/clientes/{$c->id}", $this->dados(['email' => 'nova@exemplo.com']))->assertSessionHasErrors(['email' => 'Só o gestor troca o e-mail de um cliente com acesso à loja.']);
        $antes = Account::query()->where('userId', $c->userId)->value('password');
        $this->actingAs($this->gestora)->put("/painel/clientes/{$c->id}", $this->dados(['email' => 'clara@exemplo.com', 'senha' => 'outra-senha-9', 'vendedorId' => $this->vendedora->id]))->assertSessionHasNoErrors();
        $this->assertNotSame($antes, Account::query()->where('userId', $c->userId)->value('password'));
    }

    public function test_trocar_a_vendedora_leva_os_pedidos_em_aberto(): void
    {
        $v = $this->produtoDeTeste(['M' => 5])['v'];
        $p = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 1]]);
        $nova = User::factory()->vendedor()->create();
        $this->actingAs($this->gestora)->put("/painel/clientes/{$this->cliente->id}", ['nome' => $this->cliente->nome, 'telefone' => '49998765432', 'vendedorId' => $nova->id])->assertSessionHasNoErrors();
        $this->assertSame($nova->id, Pedido::query()->find($p['id'])->vendedorId);
        $this->actingAs($this->vendedora)->get("/painel/clientes/{$this->cliente->id}")->assertNotFound();
    }

    public function test_lista_ficha_historico_e_venda_manual(): void
    {
        $this->actingAs($this->vendedora)->get('/painel/clientes?q=juliana')->assertOk()->assertInertia(fn (AssertableInertia $p) => $p->component('Painel/Clientes/Index')->has('clientes', 1));
        $this->actingAs($this->vendedora)->get('/painel/clientes?compra=nunca')->assertInertia(fn (AssertableInertia $p) => $p->has('clientes', 1));
        $this->actingAs($this->vendedora)->get("/painel/clientes/{$this->cliente->id}")->assertOk()->assertInertia(fn (AssertableInertia $p) => $p->component('Painel/Clientes/Show')->where('cliente.nome', 'Juliana Ferreira'));
        $this->actingAs($this->vendedora)->get("/painel/clientes/{$this->cliente->id}/historico?filtro=pedidos")->assertOk();

        $this->actingAs($this->vendedora)->post("/painel/clientes/{$this->cliente->id}/vendas", ['valor' => '1.259,70', 'data' => Datas::somarDiaIso(1)])->assertSessionHasErrors(['data' => 'A data não pode ser no futuro.']);
        $this->actingAs($this->vendedora)->post("/painel/clientes/{$this->cliente->id}/vendas", ['valor' => '1.259,70', 'data' => Datas::dia(), 'observacao' => 'Pix'])->assertSessionHasNoErrors();
        $venda = Venda::query()->where('clienteId', $this->cliente->id)->first();
        $this->assertSame([1259.7, 'Pix'], [(float) $venda->valor, $venda->observacao]);
        $this->actingAs($this->vendedora)->get('/painel/clientes?compra=recente')->assertInertia(fn (AssertableInertia $p) => $p->has('clientes', 1)->where('clientes.0.comprado', 1259.7));
        $this->actingAs($this->vendedora)->delete("/painel/vendas/{$venda->id}")->assertSessionHasNoErrors();
        $this->assertFalse(Venda::query()->whereKey($venda->id)->exists());
    }
}
