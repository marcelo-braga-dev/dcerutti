<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use Tests\Unit\HasherDeTransicaoTest;

/** Login (src/server/acoes/conta.ts → entrar; docs/29, fase 0). */
class EntrarTest extends TestCase
{
    use RefreshDatabase;

    /** Senha "Senha.Teste1" no formato do Better Auth (mesmo hash de tests/Unit/HasherDeTransicaoTest.php). */
    private function hashBetterAuth(): string
    {
        return (new \ReflectionClassConstant(HasherDeTransicaoTest::class, 'HASH_BETTER_AUTH'))->getValue();
    }

    public function test_equipe_entra_com_senha_antiga_vai_para_o_painel_e_a_senha_vira_bcrypt(): void
    {
        $u = User::factory()->gestor()->comHash($this->hashBetterAuth())->create(['email' => 'gestor@exemplo.com']);

        $this->post('/entrar', ['email' => ' Gestor@Exemplo.com ', 'senha' => 'Senha.Teste1'])->assertRedirect('/painel');

        $this->assertAuthenticatedAs($u);
        $this->assertStringStartsWith('$2y$', Account::query()->where('userId', $u->id)->value('password'));
        $this->assertNotNull($u->fresh()->ultimoLoginEm);
    }

    public function test_cliente_vai_para_a_loja_e_nao_entra_no_painel(): void
    {
        User::factory()->create(['email' => 'cliente@exemplo.com']);

        $this->post('/entrar', ['email' => 'cliente@exemplo.com', 'senha' => 'senha-de-teste'])->assertRedirect('/');
        $this->get('/painel')->assertRedirect('/');
    }

    public function test_volta_para_a_pagina_pedida_so_se_for_interna(): void
    {
        User::factory()->vendedor()->create(['email' => 'v@exemplo.com']);

        $this->post('/entrar', ['email' => 'v@exemplo.com', 'senha' => 'senha-de-teste', 'volta' => '//golpe.com/x'])->assertRedirect('/painel');
        $this->post('/sair');
        $this->post('/entrar', ['email' => 'v@exemplo.com', 'senha' => 'senha-de-teste', 'volta' => '/painel/pedidos?status=pendente'])->assertRedirect('/painel/pedidos?status=pendente');
    }

    public function test_quem_nao_entrou_vai_para_entrar_com_a_volta(): void
    {
        $this->get('/painel')->assertRedirect('/entrar?volta='.urlencode('/painel'));
    }

    public function test_senha_errada_e_conta_desativada_nao_entram(): void
    {
        User::factory()->create(['email' => 'a@exemplo.com']);
        User::factory()->inativo()->create(['email' => 'b@exemplo.com']);

        $this->post('/entrar', ['email' => 'a@exemplo.com', 'senha' => 'errada'])->assertSessionHasErrors(['email' => 'E-mail ou senha incorretos.']);
        $this->post('/entrar', ['email' => 'b@exemplo.com', 'senha' => 'senha-de-teste'])->assertSessionHasErrors('email');
        $this->assertGuest();
    }

    public function test_bloqueia_depois_de_cinco_tentativas_erradas(): void
    {
        User::factory()->create(['email' => 'c@exemplo.com']);
        for ($i = 0; $i < 5; $i++) {
            $this->post('/entrar', ['email' => 'c@exemplo.com', 'senha' => 'errada']);
        }

        $this->post('/entrar', ['email' => 'c@exemplo.com', 'senha' => 'senha-de-teste'])->assertSessionHasErrors(['email' => 'Muitas tentativas. Tente de novo em 15 min.']);
        $this->assertGuest();
    }

    public function test_conta_desativada_perde_o_acesso_com_a_sessao_aberta(): void
    {
        $u = User::factory()->gestor()->create();

        $this->actingAs($u)->get('/painel')->assertOk();
        $u->update(['ativo' => false]);
        $this->actingAs($u->fresh())->get('/painel')->assertRedirect('/entrar');
    }
}
