<?php

namespace Tests\Feature;

use App\Enums\StatusPedido;
use App\Models\Atividade;
use App\Models\Cliente;
use App\Models\Configuracao;
use App\Models\Cupom;
use App\Models\Favorito;
use App\Models\Notificacao;
use App\Models\Pedido;
use App\Models\SacolaCliente;
use App\Models\User;
use App\Models\Verification;
use App\Services\Catalogo;
use App\Services\Config;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Inertia\Testing\AssertableInertia;
use Tests\Concerns\MundoDeTeste;
use Tests\TestCase;

/** Loja e conta da cliente (porta das regras de src/app/(loja), acoes/pedidos.ts, conta.ts, favoritos.ts e navegacao.ts). */
class LojaTest extends TestCase
{
    use MundoDeTeste, RefreshDatabase;

    private User $conta;

    protected function setUp(): void
    {
        parent::setUp();
        $this->criarMundo();
        $this->withoutDefer();
        $this->conta = User::factory()->create(['name' => 'Juliana Ferreira', 'aceitouPrivacidadeEm' => now()]);
        $this->cliente->update(['userId' => $this->conta->id]);
    }

    private function configurar(array $valores): void
    {
        app(Config::class)->salvar($valores);
    }

    public function test_acesso_exige_login_e_aceite_da_privacidade(): void
    {
        $this->get('/catalogo?genero=feminino')->assertRedirect('/entrar?volta='.rawurlencode('/catalogo?genero=feminino'));
        $this->configurar(['catalogoPublico' => true]);
        $this->get('/catalogo')->assertOk();

        $this->conta->update(['aceitouPrivacidadeEm' => null]);
        $this->actingAs($this->conta)->get('/produto/X1')->assertRedirect('/privacidade?volta=%2Fproduto%2FX1');
        $this->actingAs($this->conta)->get('/minha-conta')->assertOk();
        $this->actingAs($this->conta)->post('/privacidade', ['volta' => '/sacola'])->assertRedirect('/sacola');
        $this->assertNotNull($this->conta->fresh()->aceitouPrivacidadeEm);
    }

    public function test_catalogo_filtra_e_conta_e_a_peca_abre_pela_referencia(): void
    {
        ['ref' => $ref] = $this->produtoDeTeste(['P' => 2, 'M' => 0]);
        $this->produtoDeTeste(['G' => 0]);
        $this->actingAs($this->conta)->get('/catalogo?tamanho=p')->assertOk()->assertInertia(fn (AssertableInertia $p) => $p->component('Loja/Catalogo')
            ->where('total', 1)->where('filtros.tamanho', 'P')->where('produtos.0.referencia', $ref)->where('contagens.disponiveis', 1)->has('loja.atalhos', 1));
        $this->actingAs($this->conta)->get('/catalogo?q=nada-assim')->assertInertia(fn (AssertableInertia $p) => $p->where('total', 0)->has('sugestoes', 1));
        $this->actingAs($this->conta)->get('/produto/'.strtolower($ref))->assertOk()->assertInertia(fn (AssertableInertia $p) => $p->component('Loja/Produto')
            ->where('produto.referencia', $ref)->where('atendimento.nome', 'a loja'));
        $this->actingAs($this->conta)->get('/produto/NAOEXISTE')->assertNotFound();
    }

    public function test_enviar_pedido_da_sacola_grava_avisa_e_limpa_a_sacola_guardada(): void
    {
        ['v' => $v] = $this->produtoDeTeste(['M' => 3]);
        SacolaCliente::query()->create(['clienteId' => $this->cliente->id, 'itens' => [['varianteId' => $v['M'], 'quantidade' => 1]]]);
        $r = $this->actingAs($this->conta)->postJson('/sacola/enviar', ['tipo' => 'compra', 'linhas' => [['varianteId' => $v['M'], 'quantidade' => 2]]])->assertOk()->json();
        $this->assertTrue($r['ok']);
        $this->assertMatchesRegularExpression('/^PED-/', $r['codigo']);
        $this->assertSame('49988036499', $r['telefone']);
        $this->assertStringContainsString('/p/', $r['linkPublico']);
        $p = Pedido::query()->where('codigo', $r['codigo'])->first();
        $this->assertSame(['loja', $this->vendedora->id, 200.0], [$p->origem->value, $p->vendedorId, (float) $p->total]);
        $this->assertFalse(SacolaCliente::query()->where('clienteId', $this->cliente->id)->exists());
        $this->assertTrue(Notificacao::query()->where('usuarioId', $this->vendedora->id)->where('tipo', 'pedido_novo')->exists());

        $falta = $this->actingAs($this->conta)->postJson('/sacola/enviar', ['tipo' => 'compra', 'linhas' => [['varianteId' => $v['M'], 'quantidade' => 4]]])->json();
        $this->assertFalse($falta['ok']);
        $this->assertStringContainsString('3 disponível', $falta['erro']);
        $this->actingAs($this->vendedora)->postJson('/sacola/enviar', ['tipo' => 'compra', 'linhas' => [['varianteId' => $v['M'], 'quantidade' => 1]]])->assertForbidden();
    }

    public function test_condicional_confere_o_cep_e_reserva(): void
    {
        ['v' => $v] = $this->produtoDeTeste(['P' => 2]);
        $linhas = [['varianteId' => $v['P'], 'quantidade' => 1]];
        $this->actingAs($this->conta)->postJson('/sacola/enviar', ['tipo' => 'condicional', 'linhas' => $linhas, 'cep' => '123'])->assertJson(['ok' => false, 'erro' => 'Digite um CEP válido com 8 números.']);
        $this->actingAs($this->conta)->postJson('/sacola/enviar', ['tipo' => 'condicional', 'linhas' => $linhas, 'cep' => '01001000'])->assertJson(['ok' => false, 'cepFora' => true]);
        $r = $this->actingAs($this->conta)->postJson('/sacola/enviar', ['tipo' => 'condicional', 'linhas' => $linhas, 'cep' => '89874000'])->assertJson(['ok' => true, 'tipo' => 'condicional', 'frete' => null])->json();
        $this->assertSame(1, $this->variante($v['P'])->reservado);
        $this->assertSame('89874-000', $this->cliente->fresh()->cep);
        $this->assertSame('89874-000', $r['cep']);
    }

    public function test_previa_do_cupom_e_conferencia_da_sacola(): void
    {
        ['v' => $v] = $this->produtoDeTeste(['M' => 3], 100);
        $linhas = [['varianteId' => $v['M'], 'quantidade' => 2]];
        $this->actingAs($this->conta)->postJson('/sacola/cupom', ['codigo' => 'X', 'tipo' => 'compra', 'linhas' => $linhas])->assertJson(['ok' => false, 'erro' => 'Os cupons não estão disponíveis agora.']);
        $this->configurar(['cupons' => ['ligados' => true, 'vendedorAplica' => true]]);
        Cupom::query()->create(['codigo' => 'BEMVINDA10', 'tipo' => 'percentual', 'valor' => 10, 'quemAplica' => 'ambos', 'origem' => 'manual', 'ativo' => true, 'inicioEm' => now()->subDay()]);
        $this->actingAs($this->conta)->postJson('/sacola/cupom', ['codigo' => 'bemvinda10', 'tipo' => 'compra', 'linhas' => $linhas])->assertJson(['ok' => true, 'codigo' => 'BEMVINDA10', 'desconto' => 20, 'freteGratis' => false]);
        $this->actingAs($this->conta)->postJson('/sacola/cupom', ['codigo' => 'NAOHA', 'tipo' => 'compra', 'linhas' => $linhas])->assertJson(['ok' => false, 'erro' => 'Cupom não encontrado. Confira as letras e os números.']);
        $this->assertSame(2, Atividade::query()->where('clienteId', $this->cliente->id)->where('tipo', 'cupom')->count());

        $c = $this->actingAs($this->conta)->postJson('/sacola/conferir', ['ids' => [$v['M'], 999999]])->assertOk()->json();
        $this->assertSame(['preco' => 100, 'disponivel' => 3], $c[$v['M']]);
        $this->assertNull($c['999999']);
    }

    public function test_favoritos_cancelar_e_comprar_de_novo(): void
    {
        ['produto' => $prod, 'v' => $v] = $this->produtoDeTeste(['M' => 3, 'G' => 1]);
        $this->actingAs($this->conta)->postJson("/favoritos/{$prod->id}")->assertJson(['favorito' => true]);
        $this->actingAs($this->conta)->get('/minha-conta/favoritos')->assertInertia(fn (AssertableInertia $p) => $p->component('Loja/MinhaConta/Favoritos')->has('produtos', 1)->where('conta.resumo.favoritos', 1));
        $this->actingAs($this->conta)->postJson("/favoritos/{$prod->id}")->assertJson(['favorito' => false]);
        $this->assertSame(0, Favorito::query()->count());

        $r = $this->actingAs($this->conta)->postJson('/sacola/enviar', ['tipo' => 'compra', 'linhas' => [['varianteId' => $v['M'], 'quantidade' => 2], ['varianteId' => $v['G'], 'quantidade' => 1]]])->json();
        $p = Pedido::query()->where('codigo', $r['codigo'])->first();
        $outra = User::factory()->create(['aceitouPrivacidadeEm' => now()]);
        $this->actingAs($outra)->post("/minha-conta/pedidos/{$p->id}/cancelar")->assertSessionHasErrors(['erro' => 'Pedido não encontrado.']);
        $this->actingAs($this->conta)->get('/minha-conta/pedidos')->assertInertia(fn (AssertableInertia $x) => $x->component('Loja/MinhaConta/Pedidos')->has('pedidos', 1)->has('pedidos.0.itens', 2));
        $this->actingAs($this->conta)->post("/minha-conta/pedidos/{$p->id}/cancelar")->assertSessionHasNoErrors();
        $this->assertSame(StatusPedido::Cancelado, $p->fresh()->status);
        $this->assertSame('cliente', $p->fresh()->motivoCancelamento);

        $this->variante($v['G'])->update(['estoque' => 0]);
        app(Catalogo::class)->invalidar();
        $re = $this->actingAs($this->conta)->getJson("/minha-conta/pedidos/{$p->id}/recomprar")->json();
        $this->assertSame([[$v['M'], 2]], array_map(fn ($i) => [$i['varianteId'], $i['quantidade']], $re['itens']));
        $this->assertCount(1, $re['indisponiveis']);
    }

    public function test_cadastro_pelo_convite_da_vendedora(): void
    {
        $outra = User::factory()->vendedor()->create(['name' => 'Bruna']);
        $this->get("/cadastro?v={$outra->id}")->assertInertia(fn (AssertableInertia $p) => $p->component('Conta/Cadastro')->where('convite.nome', 'Bruna'));
        $dados = ['nome' => 'Clara Nunes', 'telefone' => '49999112233', 'email' => 'Clara@Exemplo.com', 'senha' => 'senha-forte-1', 'vendedorId' => $outra->id, 'aceite' => true, 'aceitaOfertas' => true];
        $this->post('/cadastro', [...$dados, 'aceite' => false])->assertSessionHasErrors(['aceite' => 'Para criar a conta, aceite a política de privacidade.']);
        $this->post('/cadastro', [...$dados, 'cpf' => '111.111.111-11'])->assertSessionHasErrors(['cpf' => 'CPF inválido. Confira os 11 números.']);
        $this->post('/cadastro', [...$dados, 'email' => $this->conta->email])->assertSessionHasErrors(['email' => 'Este e-mail já tem conta. Use "Entrar".']);
        $this->post('/cadastro', [...$dados, 'volta' => '/sacola'])->assertRedirect('/sacola');
        $this->assertAuthenticated();
        $c = Cliente::query()->where('email', 'clara@exemplo.com')->first();
        $this->assertSame([$outra->id, '(49) 99911-2233'], [$c->vendedorId, $c->telefone]);
        $this->assertNotNull($c->aceitaOfertasEm);
        $this->assertNotNull(User::query()->find($c->userId)->aceitouPrivacidadeEm);
        $this->assertTrue(Notificacao::query()->where('usuarioId', $outra->id)->where('tipo', 'cliente_nova')->exists());
    }

    public function test_esqueci_e_redefinir_senha(): void
    {
        Mail::fake();
        $this->post('/esqueci-senha', ['email' => 'ninguem@exemplo.com'])->assertSessionHas('sucesso');
        $this->post('/esqueci-senha', ['email' => $this->conta->email])->assertSessionHas('sucesso');
        $v = Verification::query()->where('value', $this->conta->id)->first();
        $token = substr($v->identifier, strlen('reset-password:'));
        $this->post('/redefinir-senha', ['token' => $token, 'senha' => 'nova-senha-1', 'confirmacao' => 'outra'])->assertSessionHasErrors(['confirmacao' => 'As duas senhas não são iguais.']);
        $this->post('/redefinir-senha', ['token' => $token, 'senha' => 'nova-senha-1', 'confirmacao' => 'nova-senha-1'])->assertRedirect('/entrar?redefinida=1');
        $this->post('/redefinir-senha', ['token' => $token, 'senha' => 'nova-senha-2', 'confirmacao' => 'nova-senha-2'])->assertSessionHasErrors('erro');
        $this->post('/entrar', ['email' => $this->conta->email, 'senha' => 'nova-senha-1'])->assertRedirect('/');
    }

    public function test_meus_dados_e_exclusao_da_conta(): void
    {
        $this->actingAs($this->conta)->put('/minha-conta', ['nome' => 'Juliana F.', 'telefone' => '4999', 'cep' => ''])->assertSessionHasErrors('telefone');
        $this->actingAs($this->conta)->put('/minha-conta', ['nome' => 'Juliana F. Souza', 'telefone' => '49 98888-7777', 'cep' => '89874000', 'aceitaOfertas' => true])->assertSessionHasNoErrors();
        $this->assertSame(['Juliana F. Souza', '(49) 98888-7777', '89874-000'], [$this->cliente->fresh()->nome, $this->cliente->fresh()->telefone, $this->cliente->fresh()->cep]);

        ['v' => $v] = $this->produtoDeTeste(['M' => 3]);
        $this->actingAs($this->conta)->postJson('/sacola/enviar', ['tipo' => 'compra', 'linhas' => [['varianteId' => $v['M'], 'quantidade' => 1]]]);
        $this->actingAs($this->conta)->delete('/minha-conta')->assertSessionHasErrors('erro');
        Pedido::query()->update(['status' => StatusPedido::Cancelado]);
        $this->actingAs($this->conta)->delete('/minha-conta')->assertRedirect('/entrar');
        $this->assertGuest();
        $this->assertNull(User::query()->find($this->conta->id));
        $c = $this->cliente->fresh();
        $this->assertSame(['Cliente removido', '', null], [$c->nome, $c->telefone, $c->userId]);
        $this->assertSame('Cliente removido', Pedido::query()->first()->nomeCliente);
    }

    public function test_api_de_atividade_registra_a_navegacao_da_cliente(): void
    {
        ['ref' => $ref, 'v' => $v] = $this->produtoDeTeste(['M' => 3]);
        $lote = ['eventos' => [
            ['tipo' => 'pagina', 'ref' => 'abc12345', 'caminho' => "/produto/{$ref}"],
            ['tipo' => 'pagina', 'ref' => 'abc12346', 'caminho' => '/catalogo?q=camiseta&genero=feminino'],
            ['tipo' => 'duracao', 'ref' => 'abc12345', 'seg' => 30],
            ['tipo' => 'sacola', 'varianteId' => $v['M'], 'delta' => 1],
            ['tipo' => 'carrinho', 'itens' => [['varianteId' => $v['M'], 'quantidade' => 1]]],
        ]];
        $this->actingAs($this->conta)->call('POST', '/api/atividade', [], [], [], ['CONTENT_TYPE' => 'text/plain'], json_encode($lote))->assertNoContent();
        $tipos = Atividade::query()->where('clienteId', $this->cliente->id)->orderBy('id')->pluck('tipo')->map->value->all();
        $this->assertSame(['acesso', 'produto', 'busca', 'sacola'], $tipos);
        $this->assertSame(30, Atividade::query()->where('tipo', 'produto')->value('duracaoSeg'));
        $this->assertSame(['filtros' => ['genero' => 'feminino'], 'resultados' => 0], Atividade::query()->where('tipo', 'busca')->value('dados'));
        $this->assertTrue(SacolaCliente::query()->where('clienteId', $this->cliente->id)->exists());

        $this->actingAs($this->conta)->call('POST', '/api/atividade', [], [], [], ['CONTENT_TYPE' => 'text/plain'], json_encode(['eventos' => [['tipo' => 'pagina', 'ref' => 'x', 'caminho' => '/painel']]]))->assertStatus(400);
        $this->actingAs($this->vendedora)->call('POST', '/api/atividade', [], [], [], ['CONTENT_TYPE' => 'text/plain'], json_encode($lote))->assertNoContent();
        $this->actingAs($this->conta)->call('POST', '/api/atividade', [], [], [], ['CONTENT_TYPE' => 'text/plain', 'HTTP_ORIGIN' => 'https://outro.site'], json_encode($lote))->assertForbidden();
    }

    public function test_editor_da_pagina_inicial_guarda_so_o_que_mudou(): void
    {
        $this->actingAs($this->vendedora)->get('/editar/inicio')->assertForbidden();
        $this->actingAs($this->gestora)->get('/editar/inicio')->assertOk()->assertInertia(fn (AssertableInertia $p) => $p->component('Loja/EditarInicio')->has('destinos', 5));
        $conteudo = [
            'textos' => ['banner.titulo' => '  Nova   coleção ', 'banner.destaque' => 'aconchego', 'inexistente' => 'x'],
            'imagens' => [], 'links' => ['banner.botao1' => '/catalogo?promo=1', 'categoria.camisetas' => '/catalogo?categoria=camisetas'], 'ocultas' => ['marcas', 'qualquer'],
        ];
        $this->actingAs($this->gestora)->put('/editar/inicio', $conteudo)->assertSessionHasNoErrors();
        $salvo = Configuracao::query()->where('chave', 'inicio')->value('valor');
        $this->assertEquals(['textos' => ['banner.titulo' => 'Nova coleção'], 'imagens' => [], 'links' => ['banner.botao1' => '/catalogo?promo=1'], 'ocultas' => ['marcas']], $salvo);
        $this->actingAs($this->gestora)->put('/editar/inicio', [...$conteudo, 'links' => ['banner.botao1' => '//fora.com']])->assertSessionHasErrors(['erro' => 'Link inválido.']);
        $this->actingAs($this->gestora)->put('/editar/inicio', [...$conteudo, 'imagens' => ['banner.feminino' => '/arquivos/produtos/x.webp']])->assertSessionHasErrors(['erro' => 'Foto inválida.']);
        $this->actingAs($this->conta)->get('/')->assertInertia(fn (AssertableInertia $p) => $p->component('Loja/Inicio')->where('conteudo.textos', ['banner.titulo' => 'Nova coleção']));
    }
}
