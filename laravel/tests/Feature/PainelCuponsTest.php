<?php

namespace Tests\Feature;

use App\Models\Categoria;
use App\Models\Cliente;
use App\Models\Cupom;
use App\Models\Pedido;
use App\Services\Config;
use App\Support\Datas;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia;
use Tests\Concerns\MundoDeTeste;
use Tests\TestCase;

/** Cupons no painel (porta da parte de cadastro de tests/integracao/cupons.test.ts). */
class PainelCuponsTest extends TestCase
{
    use MundoDeTeste, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->criarMundo();
    }

    /** @return array<string, mixed> */
    private function dados(array $extra = []): array
    {
        return ['codigo' => 'PRIMAVERA10', 'tipo' => 'percentual', 'valor' => '10', 'quemAplica' => 'ambos', 'limitePorCliente' => '1', 'ativo' => true, ...$extra];
    }

    public function test_so_o_gestor_cadastra_e_a_vendedora_ve_os_para_divulgar(): void
    {
        $this->actingAs($this->vendedora)->post('/painel/cupons', $this->dados())->assertForbidden();
        $this->actingAs($this->vendedora)->get('/painel/cupons/novo')->assertForbidden();
        app(Config::class)->salvar(['cupons' => ['ligados' => true, 'vendedorAplica' => true]]);
        $this->actingAs($this->gestora)->post('/painel/cupons', $this->dados());
        Cupom::query()->create(['codigo' => 'DESLIGADO', 'tipo' => 'valor', 'valor' => 5, 'quemAplica' => 'ambos', 'origem' => 'manual', 'ativo' => false, 'inicioEm' => now()]);
        $this->actingAs($this->vendedora)->get('/painel/cupons')->assertOk()->assertInertia(fn (AssertableInertia $p) => $p->component('Painel/Cupons/Index')->where('gestor', false)->has('cupons', 1)->missing('cupons.0.usos'));
        $this->actingAs($this->gestora)->get('/painel/cupons')->assertInertia(fn (AssertableInertia $p) => $p->where('gestor', true)->has('cupons', 2)->where('cupons.0.usos', 0));
    }

    public function test_cria_com_abrangencia_produtos_clientes_e_validade_no_fuso_de_sao_paulo(): void
    {
        ['produto' => $prod, 'ref' => $ref] = $this->produtoDeTeste();
        $cat = Categoria::query()->first();
        $this->actingAs($this->gestora)->post('/painel/cupons', $this->dados([
            'codigo' => ' verao-26 ', 'categorias' => [(string) $cat->id], 'clientes' => [$this->cliente->id], 'referencias' => strtolower($ref).', ',
            'inicio' => '2026-12-01', 'fim' => '2026-12-31', 'tetoDesconto' => '50', 'minimoCompra' => '150,00', 'valePromocao' => true,
        ]))->assertRedirect();
        $c = Cupom::query()->with(['categorias', 'produtos', 'clientes'])->where('codigo', 'VERAO-26')->first();
        $this->assertSame([[$cat->id], [$prod->id], [$this->cliente->id]], [$c->categorias->pluck('categoriaId')->all(), $c->produtos->pluck('produtoId')->all(), $c->clientes->pluck('clienteId')->all()]);
        $this->assertEquals(Datas::inicioDoDia('2026-12-01'), $c->inicioEm);
        $this->assertSame('2026-12-31', Datas::dia($c->fimEm));
        $this->assertSame([50.0, 150.0, true], [(float) $c->tetoDesconto, (float) $c->minimoCompra, $c->valePromocao]);

        $this->actingAs($this->gestora)->post('/painel/cupons', $this->dados(['codigo' => 'FRETE1', 'tipo' => 'freteGratis', 'valor' => '9', 'tetoDesconto' => '3']));
        $f = Cupom::query()->where('codigo', 'FRETE1')->first();
        $this->assertSame([null, null], [$f->valor, $f->tetoDesconto]);
    }

    public function test_validacoes(): void
    {
        $this->actingAs($this->gestora)->post('/painel/cupons', $this->dados());
        $this->actingAs($this->gestora)->post('/painel/cupons', $this->dados(['codigo' => 'AB']))->assertSessionHasErrors('codigo');
        $this->actingAs($this->gestora)->post('/painel/cupons', $this->dados(['codigo' => 'primavera10']))->assertSessionHasErrors(['codigo' => 'Já existe um cupom com o código PRIMAVERA10.']);
        $this->actingAs($this->gestora)->post('/painel/cupons', $this->dados(['codigo' => 'X100', 'valor' => '120']))->assertSessionHasErrors(['valor' => 'Informe o percentual, de 0,01 a 100.']);
        $this->actingAs($this->gestora)->post('/painel/cupons', $this->dados(['codigo' => 'X101', 'tipo' => 'valor', 'valor' => '']))->assertSessionHasErrors(['valor' => 'Informe o valor do desconto em reais.']);
        $this->actingAs($this->gestora)->post('/painel/cupons', $this->dados(['codigo' => 'X102', 'inicio' => '2026-11-10', 'fim' => '2026-11-01']))->assertSessionHasErrors('fim');
        $this->actingAs($this->gestora)->post('/painel/cupons', $this->dados(['codigo' => 'X103', 'limiteTotal' => '0']))->assertSessionHasErrors('limiteTotal');
        $this->actingAs($this->gestora)->post('/painel/cupons', $this->dados(['codigo' => 'X104', 'referencias' => 'NAOEXISTE123']))->assertSessionHasErrors(['referencias' => 'Referência não encontrada: NAOEXISTE123.']);
    }

    public function test_sem_uso_edita_tudo_e_apaga_usado_trava_e_nao_apaga(): void
    {
        $this->actingAs($this->gestora)->post('/painel/cupons', $this->dados());
        $c = Cupom::query()->where('codigo', 'PRIMAVERA10')->first();
        $this->actingAs($this->gestora)->put("/painel/cupons/{$c->id}", $this->dados(['tipo' => 'valor', 'valor' => '25']))->assertSessionHasNoErrors();
        $this->assertSame(25.0, (float) $c->fresh()->valor);
        $this->actingAs($this->gestora)->post("/painel/cupons/{$c->id}/ativo", ['ativo' => false]);
        $this->assertFalse($c->fresh()->ativo);

        $v = $this->produtoDeTeste(['M' => 5])['v'];
        $p = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 1]]);
        Pedido::query()->whereKey($p['id'])->update(['cupomId' => $c->id]);
        $this->actingAs($this->gestora)->put("/painel/cupons/{$c->id}", $this->dados(['tipo' => 'valor', 'valor' => '20']))->assertSessionHasErrors('erro');
        $this->actingAs($this->gestora)->put("/painel/cupons/{$c->id}", $this->dados(['codigo' => 'OUTRO1', 'tipo' => 'valor', 'valor' => '25']))->assertSessionHasErrors('erro');
        $this->actingAs($this->gestora)->put("/painel/cupons/{$c->id}", $this->dados(['tipo' => 'valor', 'valor' => '25', 'descricao' => 'Campanha', 'fim' => '2026-12-31', 'limiteTotal' => '5']))->assertSessionHasNoErrors();
        $this->assertSame([5, 'Campanha'], [$c->fresh()->limiteTotal, $c->fresh()->descricao]);
        $this->actingAs($this->gestora)->delete("/painel/cupons/{$c->id}")->assertSessionHasErrors(['erro' => 'Este cupom já foi usado em pedidos: desative em vez de apagar.']);
        $this->actingAs($this->gestora)->get("/painel/cupons/{$c->id}")->assertOk()->assertInertia(fn (AssertableInertia $x) => $x->component('Painel/Cupons/Form')->where('usado', true)->has('pedidos', 1));

        $this->actingAs($this->gestora)->post('/painel/cupons', $this->dados(['codigo' => 'APAGAR1']));
        $novo = Cupom::query()->where('codigo', 'APAGAR1')->first();
        $this->actingAs($this->gestora)->delete("/painel/cupons/{$novo->id}")->assertRedirect('/painel/cupons');
        $this->assertNull($novo->fresh());
    }

    public function test_campanhas_de_primeira_e_proxima_compra(): void
    {
        $this->actingAs($this->gestora)->get('/painel/cupons/campanhas')->assertOk()->assertInertia(fn (AssertableInertia $p) => $p->component('Painel/Cupons/Campanhas')->where('primeira.codigo', 'BEMVINDA'));
        $this->actingAs($this->gestora)->post('/painel/cupons/campanhas', ['campanha' => 'primeiraCompra', 'codigo' => 'bemvinda', 'tipo' => 'percentual', 'valor' => '10', 'quemAplica' => 'ambos', 'diasAposCadastro' => '30', 'ativo' => true])->assertSessionHasNoErrors();
        $c = Cupom::query()->where('origem', 'primeiraCompra')->first();
        $this->assertSame(['BEMVINDA', 1, true, 30], [$c->codigo, $c->limitePorCliente, $c->somentePrimeiraCompra, $c->diasAposCadastro]);

        $this->actingAs($this->gestora)->post('/painel/cupons/campanhas', ['campanha' => 'proximaCompra', 'tipo' => 'percentual', 'valor' => '10', 'tetoDesconto' => '50', 'quemAplica' => 'ambos', 'diasValidade' => ''])->assertSessionHasErrors('diasValidade');
        $this->actingAs($this->gestora)->post('/painel/cupons/campanhas', ['campanha' => 'proximaCompra', 'tipo' => 'percentual', 'valor' => '15', 'tetoDesconto' => '50', 'quemAplica' => 'cliente', 'minimoParaGerar' => '200', 'diasParaComecar' => '2', 'diasValidade' => '45', 'acumula' => true, 'ativo' => true])->assertSessionHasNoErrors();
        $m = Cupom::query()->where('origem', 'proximaCompra')->where('modelo', true)->first();
        $this->assertSame([15.0, 'cliente'], [(float) $m->valor, $m->quemAplica->value]);
        $this->assertEquals(['minimoParaGerar' => 200, 'diasParaComecar' => 2, 'diasValidade' => 45, 'geraComCupom' => false, 'acumula' => true], (new Config)->get('proximaCompra'));
        $this->assertSame(1, Cliente::query()->count());
    }
}
