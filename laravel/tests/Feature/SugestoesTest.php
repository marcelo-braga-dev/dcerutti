<?php

namespace Tests\Feature;

use App\Models\Notificacao;
use App\Models\Pedido;
use App\Models\Sugestao;
use App\Models\SugestaoItem;
use App\Models\User;
use App\Support\Links;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia;
use Tests\Concerns\MundoDeTeste;
use Tests\TestCase;

/** Sugestões para você (porta das regras de src/server/sugestoes.ts e acoes/sugestoes.ts). */
class SugestoesTest extends TestCase
{
    use MundoDeTeste, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->criarMundo();
        $this->withoutDefer();
    }

    private function criar(array $extra = [], ?User $quem = null): array
    {
        ['produto' => $p, 'v' => $v] = $this->produtoDeTeste(['P' => 3, 'M' => 3], 100);

        $r = $this->actingAs($quem ?? $this->vendedora)->postJson('/painel/sugestoes', ['clienteId' => $this->cliente->id, 'titulo' => 'Novidades no seu tamanho', 'dias' => 7,
            'itens' => [['produtoId' => $p->id, 'varianteId' => $v['M'], 'precoOferta' => 90, 'nota' => 'Linda em você']], ...$extra])->json();

        return [$r, $p, $v];
    }

    public function test_cria_com_limite_de_desconto_e_so_para_a_propria_carteira(): void
    {
        [$r] = $this->criar();
        $this->assertTrue($r['ok']);
        $this->assertMatchesRegularExpression('/^SUG-\d{6}$/', $r['codigo']);
        $this->assertStringContainsString('/s/SUG-', $r['link']);
        $s = Sugestao::query()->find($r['id']);
        $this->assertSame([$this->vendedora->id, 'enviada'], [$s->vendedorId, $s->status->value]);
        $this->assertNotNull($s->enviadaEm);

        ['produto' => $p] = $this->produtoDeTeste(['M' => 2], 100);
        $caro = $this->actingAs($this->vendedora)->postJson('/painel/sugestoes', ['clienteId' => $this->cliente->id, 'titulo' => 'Oferta', 'itens' => [['produtoId' => $p->id, 'precoOferta' => 80]]])->json();
        $this->assertStringContainsString('só o gestor', $caro['erro']);
        $this->assertTrue($this->actingAs($this->gestora)->postJson('/painel/sugestoes', ['clienteId' => $this->cliente->id, 'titulo' => 'Oferta', 'itens' => [['produtoId' => $p->id, 'precoOferta' => 80]]])->json('ok'));
        $outra = User::factory()->vendedor()->create();
        $this->assertSame('Escolha a cliente.', $this->actingAs($outra)->postJson('/painel/sugestoes', ['clienteId' => $this->cliente->id, 'titulo' => 'Oi oi', 'itens' => [['produtoId' => $p->id]]])->json('erro'));
        $soCriar = $this->actingAs($this->vendedora)->postJson('/painel/sugestoes', ['clienteId' => $this->cliente->id, 'titulo' => 'Depois', 'enviar' => false, 'itens' => [['produtoId' => $p->id]]])->json();
        $this->actingAs($this->vendedora)->get('/painel/sugestoes?situacao=atencao')->assertInertia(fn (AssertableInertia $x) => $x->component('Painel/Sugestoes/Index')->where('totalAtencao', 1)->where('lista.0.id', $soCriar['id']));
    }

    public function test_cliente_abre_escolhe_e_compra_com_o_preco_especial(): void
    {
        [$r, $p, $v] = $this->criar();
        $chave = Links::chaveDaSugestao($r['codigo']);
        auth()->logout();
        $this->get('/s/SUG-000001.abcdefghijklmnop')->assertNotFound();
        $this->get("/s/{$chave}")->assertOk()->assertInertia(fn (AssertableInertia $x) => $x->component('Publico/Sugestao')->where('s.nomeCliente', 'Juliana')->where('s.itens.0.preco', 90)->where('s.situacao', 'vista'));
        $this->assertTrue(Notificacao::query()->where('tipo', 'carrinho_visto')->where('usuarioId', $this->vendedora->id)->exists());

        $item = SugestaoItem::query()->first();
        $this->postJson("/s/{$chave}/responder", ['modo' => 'compra', 'escolhas' => [['id' => $item->id, 'escolha' => 'nao', 'varianteId' => $v['M'], 'quantidade' => 1]]])->assertJson(['ok' => false, 'erro' => 'Marque "Quero" nas peças que você quer.']);
        $resp = $this->postJson("/s/{$chave}/responder", ['modo' => 'compra', 'escolhas' => [['id' => $item->id, 'escolha' => 'quero', 'varianteId' => $v['P'], 'quantidade' => 2]]])->json();
        $this->assertTrue($resp['ok']);
        $pedido = Pedido::query()->where('codigo', $resp['codigo'])->with('itens')->first();
        $this->assertSame([180.0, $v['P'], 2], [(float) $pedido->total, $pedido->itens[0]->varianteId, $pedido->itens[0]->quantidade]);
        $s = Sugestao::query()->find($r['id']);
        $this->assertSame(['convertida', $pedido->id], [$s->status->value, $s->pedidoId]);
        $this->postJson("/s/{$chave}/responder", ['modo' => 'compra', 'escolhas' => []])->assertJson(['ok' => false, 'erro' => 'Você já respondeu esta sugestão: o pedido foi enviado.']);
    }

    public function test_pensando_vencida_renovar_cancelar_e_mais_para_voce(): void
    {
        [$r] = $this->criar();
        $chave = Links::chaveDaSugestao($r['codigo']);
        $item = SugestaoItem::query()->first();
        $this->postJson("/s/{$chave}/responder", ['modo' => 'pensando', 'escolhas' => [['id' => $item->id, 'escolha' => 'talvez', 'varianteId' => null, 'quantidade' => 1]]])->assertJson(['ok' => true, 'codigo' => null]);
        $this->assertSame('respondida', Sugestao::query()->find($r['id'])->status->value);
        $this->assertTrue(Notificacao::query()->where('tipo', 'carrinho_respondido')->exists());

        ['produto' => $extra] = $this->produtoDeTeste(['G' => 1]);
        $this->postJson("/s/{$chave}/adicionar", ['produtoId' => $extra->id])->assertJson(['ok' => true, 'item' => ['produtoId' => $extra->id, 'escolha' => 'quero']]);
        $this->postJson("/s/{$chave}/adicionar", ['produtoId' => $extra->id])->assertJson(['ok' => false, 'erro' => 'Esta peça já está na sugestão.']);

        Sugestao::query()->whereKey($r['id'])->update(['validaAte' => now()->subDay()]);
        $this->get("/s/{$chave}")->assertInertia(fn (AssertableInertia $x) => $x->where('s.situacao', 'vencida')->where('s.itens.0.preco', 100));
        $this->postJson("/s/{$chave}/responder", ['modo' => 'compra', 'escolhas' => []])->assertJson(['ok' => false, 'erro' => 'Esta sugestão venceu. Fale com quem te atende para receber outra.']);
        $this->actingAs($this->vendedora)->post("/painel/sugestoes/{$r['id']}/renovar", ['dias' => 15])->assertSessionHasNoErrors();
        $this->assertTrue(Sugestao::query()->find($r['id'])->validaAte->isFuture());
        $this->actingAs($this->vendedora)->post("/painel/sugestoes/{$r['id']}/cancelar")->assertSessionHasNoErrors();
        $this->get("/s/{$chave}")->assertInertia(fn (AssertableInertia $x) => $x->where('s.situacao', 'cancelada'));
        $this->actingAs(User::factory()->vendedor()->create())->get("/painel/sugestoes/{$r['id']}")->assertNotFound();
        $this->actingAs($this->vendedora)->get("/painel/sugestoes/{$r['id']}")->assertOk()->assertInertia(fn (AssertableInertia $x) => $x->component('Painel/Sugestoes/Show')->has('sugestao.itens', 2));
    }

    public function test_montador_historico_e_sugestao_automatica(): void
    {
        $this->produtoDeTeste(['M' => 2]);
        $this->actingAs($this->vendedora)->get('/painel/sugestoes/nova?cliente='.$this->cliente->id)->assertOk()->assertInertia(fn (AssertableInertia $x) => $x->component('Painel/Sugestoes/Novo')->where('clienteInicial', $this->cliente->id)->where('limiteDesconto', 10));
        $this->actingAs($this->vendedora)->getJson('/painel/sugestoes/historico/'.$this->cliente->id)->assertOk()->assertJsonStructure(['tamanhos', 'vistas', 'favoritos', 'naoFechados', 'compras']);
        $this->actingAs($this->vendedora)->getJson('/painel/sugestoes/automatica/'.$this->cliente->id)->assertOk();
        $this->actingAs($this->vendedora)->getJson('/painel/sugestoes/pecas?q=produto')->assertOk()->assertJsonCount(1);
    }
}
