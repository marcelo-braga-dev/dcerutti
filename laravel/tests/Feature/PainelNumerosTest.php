<?php

namespace Tests\Feature;

use App\Models\Configuracao;
use App\Models\NumeroWhatsApp;
use App\Models\Pedido;
use App\Models\User;
use App\Models\VinculoNumero;
use App\Services\Numeros;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia;
use Tests\Concerns\MundoDeTeste;
use Tests\TestCase;

/** Números de WhatsApp da loja (porta de tests/integracao/numeros.test.ts). */
class PainelNumerosTest extends TestCase
{
    use MundoDeTeste, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->criarMundo();
        $this->withoutDefer();
    }

    private function numero(string $apelido = 'Linha 1', string $telefone = '49999110001', array $extra = []): NumeroWhatsApp
    {
        return NumeroWhatsApp::query()->create(['apelido' => $apelido, 'telefone' => $telefone, 'criadoPorId' => $this->gestora->id, ...$extra]);
    }

    private function vinculo(NumeroWhatsApp $n, User $u): VinculoNumero
    {
        return VinculoNumero::query()->where('numeroId', $n->id)->where('usuarioId', $u->id)->latest('id')->first();
    }

    public function test_so_a_gestora_e_cadastro_com_validacao(): void
    {
        $this->actingAs($this->vendedora)->get('/painel/numeros')->assertForbidden();
        $this->actingAs($this->vendedora)->post('/painel/numeros', ['telefone' => '49999110001', 'apelido' => 'X'])->assertForbidden();
        $this->actingAs($this->gestora)->post('/painel/numeros', ['telefone' => '4999', 'apelido' => 'Linha'])->assertSessionHasErrors(['telefone' => 'Informe o WhatsApp com DDD e 9 dígitos.']);
        $this->actingAs($this->gestora)->post('/painel/numeros', ['telefone' => '(49) 99911-0001', 'apelido' => 'L'])->assertSessionHasErrors('apelido');
        $this->actingAs($this->gestora)->post('/painel/numeros', ['telefone' => '(49) 99911-0001', 'apelido' => 'Linha Ana'])->assertSessionHasNoErrors();
        $this->assertSame('49999110001', NumeroWhatsApp::query()->value('telefone'));
        $this->actingAs($this->gestora)->post('/painel/numeros', ['telefone' => '49999110001', 'apelido' => 'Outra'])->assertSessionHasErrors(['erro' => 'Este telefone já está cadastrado.']);
    }

    public function test_numero_com_historico_nao_troca_de_telefone_mas_troca_de_nome(): void
    {
        $n = $this->numero();
        $this->actingAs($this->gestora)->post("/painel/numeros/{$n->id}/ligar", ['usuarioId' => $this->vendedora->id])->assertSessionHasNoErrors();
        $this->actingAs($this->gestora)->put("/painel/numeros/{$n->id}", ['telefone' => '49999110002', 'apelido' => 'Linha 1'])->assertSessionHasErrors('erro');
        $this->actingAs($this->gestora)->put("/painel/numeros/{$n->id}", ['telefone' => '49999110001', 'apelido' => 'Linha Nova'])->assertSessionHasNoErrors();
        $this->assertSame('Linha Nova', $n->fresh()->apelido);
    }

    public function test_primeiro_numero_vira_principal_da_vendedora_e_gestora_nao_tem_principal(): void
    {
        $n = $this->numero();
        $this->actingAs($this->gestora)->post("/painel/numeros/{$n->id}/ligar", ['usuarioId' => $this->vendedora->id]);
        $this->actingAs($this->gestora)->post("/painel/numeros/{$n->id}/ligar", ['usuarioId' => $this->gestora->id]);
        $this->assertSame($n->id, $this->vendedora->fresh()->numeroPrincipalId);
        $this->assertNull($this->gestora->fresh()->numeroPrincipalId);
        $this->actingAs($this->gestora)->post("/painel/numeros/{$n->id}/ligar", ['usuarioId' => $this->vendedora->id])->assertSessionHasErrors(['erro' => 'Esta pessoa já está neste número.']);
        $this->actingAs($this->gestora)->post("/painel/numeros/{$n->id}/principal", ['usuarioId' => $this->gestora->id])->assertSessionHasErrors(['erro' => 'Só quem vende tem número principal: o gestor não fica com carteira.']);
        $inativa = User::factory()->vendedor()->inativo()->create();
        $this->actingAs($this->gestora)->post("/painel/numeros/{$n->id}/ligar", ['usuarioId' => $inativa->id])->assertSessionHasErrors(['erro' => 'Pessoa não encontrada ou inativa.']);
        $off = $this->numero('Desligado', '49999110009', ['status' => 'desativado']);
        $this->actingAs($this->gestora)->post("/painel/numeros/{$off->id}/ligar", ['usuarioId' => $this->vendedora->id])->assertSessionHasErrors('erro');
    }

    public function test_tirar_aparelho_conectado_deixa_pendencia_e_outro_numero_assume_o_principal(): void
    {
        $a = $this->numero('A', '49999110001');
        $b = $this->numero('B', '49999110002');
        $this->actingAs($this->gestora)->post("/painel/numeros/{$a->id}/ligar", ['usuarioId' => $this->vendedora->id]);
        $this->actingAs($this->gestora)->post("/painel/numeros/{$b->id}/ligar", ['usuarioId' => $this->vendedora->id]);
        $v = $this->vinculo($a, $this->vendedora);
        $this->actingAs($this->gestora)->post("/painel/numeros/vinculos/{$v->id}/conexao", ['estado' => 'conectado'])->assertSessionHasNoErrors();
        $this->actingAs($this->gestora)->post("/painel/numeros/{$a->id}/tirar", ['usuarioId' => $this->vendedora->id, 'motivo' => 'Trocou de aparelho'])->assertSessionHas('sucesso');
        $this->assertSame($b->id, $this->vendedora->fresh()->numeroPrincipalId);
        $v->refresh();
        $this->assertNotNull($v->fimEm);
        $this->assertNull($v->desconectadoEm);
        $this->actingAs($this->gestora)->get('/painel/numeros')->assertInertia(fn (AssertableInertia $p) => $p->component('Painel/Numeros/Index')->has('pendencias', 1)->has('numeros', 2));
        $this->actingAs($this->gestora)->post("/painel/numeros/vinculos/{$v->id}/conexao", ['estado' => 'desconectado'])->assertSessionHasNoErrors();
        $this->assertNotNull($v->fresh()->desconectadoEm);

        $this->actingAs($this->gestora)->post("/painel/numeros/{$b->id}/tirar", ['usuarioId' => $this->vendedora->id]);
        $this->assertNotNull($this->vinculo($b, $this->vendedora)->desconectadoEm); // sem conexão, sem pendência
    }

    public function test_mover_leva_o_principal_e_a_carteira_so_muda_se_escolher(): void
    {
        $a = $this->numero('A', '49999110001');
        $b = $this->numero('B', '49999110002');
        $this->actingAs($this->gestora)->post("/painel/numeros/{$a->id}/ligar", ['usuarioId' => $this->vendedora->id]);
        $this->actingAs($this->gestora)->post("/painel/numeros/{$a->id}/mover", ['usuarioId' => $this->vendedora->id, 'destinoId' => $b->id])->assertSessionHasNoErrors();
        $this->assertSame($b->id, $this->vendedora->fresh()->numeroPrincipalId);
        $this->assertSame('Mudou para B', $this->vinculo($a, $this->vendedora)->motivoFim);

        $nova = User::factory()->vendedor()->create();
        $this->actingAs($this->gestora)->getJson("/painel/numeros/{$b->id}/impacto?usuarioId={$this->vendedora->id}")->assertJson(['clientes' => 1, 'principal' => true, 'ficaSemNumero' => true, 'podeTransferir' => true]);
        $this->actingAs($this->gestora)->post("/painel/numeros/{$b->id}/tirar", ['usuarioId' => $this->vendedora->id, 'transferirPara' => $nova->id])->assertSessionHasNoErrors();
        $this->assertSame($nova->id, $this->cliente->fresh()->vendedorId);
    }

    public function test_pausar_desativar_padrao_protegido_e_trocar_o_padrao(): void
    {
        $a = $this->numero('A', '49999110001');
        $b = $this->numero('B', '49999110002');
        $this->actingAs($this->gestora)->post("/painel/numeros/{$a->id}/ligar", ['usuarioId' => $this->vendedora->id]);
        $this->actingAs($this->gestora)->post("/painel/numeros/{$a->id}/status", ['status' => 'pausado'])->assertSessionHasNoErrors();
        $this->assertNull($this->vendedora->fresh()->numeroPrincipalId);
        $this->assertNull($this->vinculo($a, $this->vendedora)->fimEm);
        $this->actingAs($this->gestora)->post("/painel/numeros/{$a->id}/status", ['status' => 'desativado']);
        $this->assertNotNull($this->vinculo($a, $this->vendedora)->fimEm);

        $this->actingAs($this->gestora)->post("/painel/numeros/{$b->id}/padrao")->assertSessionHasNoErrors();
        $this->assertSame('49999110002', Configuracao::query()->where('chave', 'whatsappLoja')->value('valor'));
        $this->actingAs($this->gestora)->post("/painel/numeros/{$b->id}/status", ['status' => 'pausado'])->assertSessionHasErrors(['erro' => 'Este é o número padrão da loja. Defina outro como padrão antes.']);
        $this->actingAs($this->gestora)->post("/painel/numeros/{$a->id}/status", ['status' => 'ativo']);
        $this->actingAs($this->gestora)->post("/painel/numeros/{$a->id}/padrao");
        $this->assertSame([true, false], [$a->fresh()->padrao, $b->fresh()->padrao]);
    }

    public function test_pedido_guarda_o_numero_e_a_pagina_do_numero_mostra_o_historico(): void
    {
        $n = $this->numero();
        app(Numeros::class)->vincular($n->id, $this->vendedora->id, $this->gestora->id);
        $v = $this->produtoDeTeste(['M' => 3])['v'];
        $p = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 1]]);
        $this->assertSame($n->id, Pedido::query()->find($p['id'])->numeroId);
        $this->actingAs($this->gestora)->get("/painel/numeros/{$n->id}")->assertOk()->assertInertia(fn (AssertableInertia $x) => $x->component('Painel/Numeros/Show')
            ->where('pedidos', 1)->where('atendendo', 1)->has('vinculos', 1)->where('vinculos.0.vinculadoPor', $this->gestora->name));
    }
}
