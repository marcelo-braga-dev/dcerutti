<?php

namespace Tests\Feature;

use App\Models\Atendimento;
use App\Models\AtendimentoRegistro;
use App\Models\Cliente;
use App\Models\Notificacao;
use App\Models\Pedido;
use App\Models\RespostaPronta;
use App\Models\User;
use App\Services\Config;
use App\Services\Pedidos\Pedidos;
use App\Support\Datas;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia;
use Tests\Concerns\MundoDeTeste;
use Tests\TestCase;

/** Atendimento online (porta de tests/integracao/atendimento.test.ts). */
class AtendimentoTest extends TestCase
{
    use MundoDeTeste, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->criarMundo();
        $this->withoutDefer();
        app(Config::class)->salvar(['atendimento' => ['ligado' => true, 'diasPosVenda' => ['entrega' => 1, 'satisfacao' => 7, 'sugestao' => 30, 'reativacao' => 90]]]);
    }

    private function novo(User $u, array $d): Atendimento
    {
        $this->actingAs($u)->post('/painel/atendimento', ['nome' => 'Fulana Souza', 'canal' => 'instagram', ...$d]);

        return Atendimento::query()->latest('criadoEm')->latest('id')->first();
    }

    public function test_desligado_nao_existe_e_validacoes(): void
    {
        $this->actingAs($this->vendedora)->post('/painel/atendimento', ['nome' => 'F', 'canal' => 'instagram'])->assertSessionHasErrors('nome');
        $this->actingAs($this->vendedora)->post('/painel/atendimento', ['nome' => 'Fulana', 'canal' => 'instagram'])->assertSessionHasErrors(['telefone' => 'Informe o WhatsApp ou o @ do Instagram.']);
        $this->actingAs($this->vendedora)->post('/painel/atendimento', ['nome' => 'Fulana', 'canal' => 'instagram', 'telefone' => '4999'])->assertSessionHasErrors('telefone');
        app(Config::class)->salvar(['atendimento' => ['ligado' => false]]);
        $this->actingAs($this->vendedora)->get('/painel/atendimento')->assertNotFound();
    }

    public function test_com_whatsapp_nasce_a_ficha_so_com_arroba_nao(): void
    {
        $a = $this->novo($this->vendedora, ['telefone' => '49988112233', 'nota' => 'Quer jaqueta']);
        $this->assertNotNull($a->clienteId);
        $c = Cliente::query()->find($a->clienteId);
        $this->assertSame([$this->vendedora->id, '(49) 98811-2233', 'instagram'], [$c->vendedorId, $c->telefone, $c->origem->value ?? $c->origem]);
        $this->assertMatchesRegularExpression('/^AT-\d{6}$/', $a->codigo);

        $b = $this->novo($this->vendedora, ['nome' => 'Só Insta', 'instagram' => '@So.Insta']);
        $this->assertNull($b->clienteId);
        $this->assertSame('so.insta', $b->contatoInstagram);
        $this->actingAs($this->vendedora)->post("/painel/atendimento/{$b->id}/contato", ['telefone' => '49988110000'])->assertSessionHasNoErrors();
        $b->refresh();
        $this->assertNotNull($b->clienteId);
        $this->assertSame('so.insta', Cliente::query()->find($b->clienteId)->instagram);
    }

    public function test_contato_de_outra_carteira_vai_para_a_dona_e_conversa_aberta_junta_a_nota(): void
    {
        $outra = User::factory()->vendedor()->create(['name' => 'Bruna Lima']);
        $this->actingAs($outra)->post('/painel/atendimento', ['nome' => 'Juliana', 'canal' => 'whatsapp', 'telefone' => '49998765432', 'nota' => 'Viu no Insta'])
            ->assertSessionHas('sucesso', fn ($m) => str_contains($m, 'Este contato é de Ana'));
        $a = Atendimento::query()->first();
        $this->assertSame([$this->vendedora->id, $this->cliente->id], [$a->responsavelId, $a->clienteId]);
        $this->assertTrue(Notificacao::query()->where('usuarioId', $this->vendedora->id)->where('tipo', 'atendimento_novo')->exists());
        $this->actingAs($outra)->get("/painel/atendimento/{$a->id}")->assertNotFound();

        $this->actingAs($this->vendedora)->post('/painel/atendimento', ['nome' => 'Juliana', 'canal' => 'whatsapp', 'telefone' => '49998765432', 'nota' => 'Segunda nota']);
        $this->assertSame(1, Atendimento::query()->count());
        $this->assertSame(2, AtendimentoRegistro::query()->where('atendimentoId', $a->id)->where('tipo', 'nota')->count());
    }

    public function test_gestor_sem_padrao_fica_sem_responsavel_e_passa_para_uma_vendedora(): void
    {
        $a = $this->novo($this->gestora, ['telefone' => '49988776600']);
        $this->assertSame([null, null], [$a->responsavelId, $a->clienteId]);
        $this->actingAs($this->gestora)->get('/painel/atendimento/equipe')->assertInertia(fn (AssertableInertia $p) => $p->component('Painel/Atendimento/Equipe')->has('semResponsavel', 1));
        $this->actingAs($this->vendedora)->post("/painel/atendimento/{$a->id}/transferir", ['para' => $this->vendedora->id])->assertForbidden();
        $this->actingAs($this->gestora)->post("/painel/atendimento/{$a->id}/transferir", ['para' => $this->vendedora->id])->assertSessionHasNoErrors();
        $a->refresh();
        $this->assertSame($this->vendedora->id, $a->responsavelId);
        $this->assertSame($this->vendedora->id, Cliente::query()->find($a->clienteId)->vendedorId);
    }

    public function test_etapas_e_fila_de_hoje(): void
    {
        $a = $this->novo($this->vendedora, ['telefone' => '49988112244']);
        $this->actingAs($this->vendedora)->get('/painel/atendimento')->assertInertia(fn (AssertableInertia $p) => $p->component('Painel/Atendimento/Index')->has('novos', 1)->has('retornos', 0));
        $this->actingAs($this->vendedora)->post("/painel/atendimento/{$a->id}/etapa", ['etapa' => 'proposta'])->assertSessionHasErrors(['proximoContato' => 'Marque a data do próximo contato.']);
        $this->actingAs($this->vendedora)->post("/painel/atendimento/{$a->id}/etapa", ['etapa' => 'perdido'])->assertSessionHasErrors('motivoPerda');
        $this->actingAs($this->vendedora)->post("/painel/atendimento/{$a->id}/etapa", ['etapa' => 'ganho', 'proximoContato' => Datas::dia()])->assertSessionHasErrors(['erro' => 'Esta etapa vem do pedido.']);

        $this->actingAs($this->vendedora)->postJson("/painel/atendimento/{$a->id}/contato-feito", ['canal' => 'whatsapp'])->assertJson(['ok' => true]);
        $primeiro = $a->fresh()->primeiroContatoEm;
        $this->travel(5)->minutes();
        $this->actingAs($this->vendedora)->postJson("/painel/atendimento/{$a->id}/contato-feito", ['canal' => 'instagram']);
        $a->refresh();
        $this->assertEquals($primeiro, $a->primeiroContatoEm);
        $this->assertSame('em_conversa', $a->etapa->value);
        $this->assertSame(2, AtendimentoRegistro::query()->whereIn('tipo', ['contato_whatsapp', 'contato_direct'])->count());
        $this->actingAs($this->vendedora)->get('/painel/atendimento')->assertInertia(fn (AssertableInertia $p) => $p->has('novos', 0)->has('retornos', 0));
        $this->actingAs($this->vendedora)->post("/painel/atendimento/{$a->id}/etapa", ['etapa' => 'perdido', 'motivoPerda' => 'preco'])->assertSessionHasNoErrors();
        $this->assertNotNull($a->fresh()->fechadoEm);
    }

    public function test_vira_pedido_uma_vez_e_a_venda_fica_com_a_carteira(): void
    {
        $outra = User::factory()->vendedor()->create();
        $a = $this->novo($outra, ['instagram' => '@semficha']);
        $this->assertSame('Informe o WhatsApp da cliente antes de criar o pedido.', $this->actingAs($outra)->postJson("/painel/atendimento/{$a->id}/pedido", ['tipo' => 'compra'])->json('erro'));

        $b = $this->novo($this->vendedora, ['telefone' => '49998765432']);
        $this->assertSame('Adicione pelo menos uma peça.', $this->actingAs($this->vendedora)->postJson("/painel/atendimento/{$b->id}/pedido", ['tipo' => 'compra'])->json('erro'));
        ['v' => $v] = $this->produtoDeTeste(['M' => 3]);
        $this->actingAs($this->vendedora)->post("/painel/atendimento/{$b->id}/pecas", ['varianteId' => $v['M']]);
        $this->actingAs($this->vendedora)->post("/painel/atendimento/{$b->id}/pecas", ['varianteId' => $v['M']]);
        $r = $this->actingAs($this->vendedora)->postJson("/painel/atendimento/{$b->id}/pedido", ['tipo' => 'compra'])->json();
        $this->assertTrue($r['ok']);
        $p = Pedido::query()->with('itens')->find($r['pedidoId']);
        $this->assertSame([2, $this->vendedora->id], [$p->itens[0]->quantidade, $p->vendedorId]);
        $this->assertSame(['aguardando_pagamento', $p->id], [$b->fresh()->etapa->value, $b->fresh()->pedidoId]);
        $this->assertSame('Este atendimento já virou pedido.', $this->actingAs($this->vendedora)->postJson("/painel/atendimento/{$b->id}/pedido", ['tipo' => 'compra'])->json('erro'));

        app(Pedidos::class)->confirmar($p->id, [], $this->vendedora->id);
        $this->assertSame('ganho', $b->fresh()->etapa->value);
    }

    public function test_gestor_apaga_contato_sem_ficha_e_respostas_prontas(): void
    {
        $a = $this->novo($this->vendedora, ['instagram' => '@apagar']);
        $this->actingAs($this->vendedora)->delete("/painel/atendimento/{$a->id}")->assertForbidden();
        $this->actingAs($this->gestora)->delete("/painel/atendimento/{$a->id}")->assertRedirect('/painel/atendimento/lista');
        $this->assertNull($a->fresh());
        $b = $this->novo($this->vendedora, ['telefone' => '49988000111']);
        $this->actingAs($this->gestora)->delete("/painel/atendimento/{$b->id}")->assertSessionHasErrors(['erro' => 'Este contato tem ficha: a exclusão é pela ficha da cliente.']);

        $this->actingAs($this->vendedora)->post('/painel/atendimento/respostas', ['titulo' => 'Oi', 'texto' => 'Oi {nome}!', 'daLoja' => true])->assertSessionHasErrors(['erro' => 'Só o gestor edita as respostas da loja.']);
        $this->actingAs($this->vendedora)->post('/painel/atendimento/respostas', ['titulo' => 'Oi', 'texto' => 'Oi {nmoe}!'])->assertSessionHasErrors('texto');
        $this->actingAs($this->vendedora)->post('/painel/atendimento/respostas', ['titulo' => 'Oi', 'texto' => 'Oi {nome}, aqui é {vendedora}!'])->assertSessionHasNoErrors();
        $this->actingAs($this->gestora)->post('/painel/atendimento/respostas', ['titulo' => 'Da loja', 'texto' => 'Bem-vinda à {loja}', 'daLoja' => true])->assertSessionHasNoErrors();
        $this->assertSame([$this->vendedora->id, null], RespostaPronta::query()->orderBy('id')->pluck('usuarioId')->all());
        $this->actingAs($this->vendedora)->get("/painel/atendimento/{$b->id}")->assertOk()->assertInertia(fn (AssertableInertia $p) => $p->component('Painel/Atendimento/Show')->has('respostas', 2)->where('atendimento.nome', 'Fulana Souza'));
        $daLoja = RespostaPronta::query()->whereNull('usuarioId')->value('id');
        $this->actingAs($this->vendedora)->delete("/painel/atendimento/respostas/{$daLoja}")->assertSessionHasErrors('erro');
    }
}
