<?php

namespace Tests\Feature;

use App\Models\Atendimento;
use App\Models\Cliente;
use App\Models\NumeroWhatsApp;
use App\Models\Pedido;
use App\Models\Produto;
use App\Models\User;
use App\Models\Vitrine;
use App\Models\VitrinePeca;
use App\Services\Config;
use App\Services\Vitrines;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia;
use Tests\Concerns\MundoDeTeste;
use Tests\TestCase;

/** Vitrines (porta de tests/integracao/vitrines.test.ts): permissões, preço especial, o que o público vê e o formulário público. */
class VitrinesTest extends TestCase
{
    use MundoDeTeste, RefreshDatabase;

    private int $seq = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->criarMundo();
        $this->withoutDefer();
        app(Config::class)->salvar(['vitrines' => ['ligadas' => true], 'atendimento' => ['ligado' => true]]);
        $n = NumeroWhatsApp::query()->create(['apelido' => 'Ana', 'telefone' => '49988904646', 'criadoPorId' => $this->gestora->id, 'status' => 'ativo']);
        $this->vendedora->update(['numeroPrincipalId' => $n->id]);
    }

    private function celular(): string
    {
        $d = str_pad((string) (++$this->seq * 7919 % 100000000), 8, '0', STR_PAD_LEFT);

        return '(49) 9'.substr($d, 0, 4).'-'.substr($d, 4);
    }

    private function criar(?User $u = null, array $campos = []): Vitrine
    {
        $this->actingAs($u ?? $this->vendedora)->post('/painel/vitrines', ['tipo' => 'post', 'titulo' => 'Vitrine '.(++$this->seq), ...$campos])->assertSessionHasNoErrors();

        return Vitrine::query()->latest('criadoEm')->latest('id')->first();
    }

    /** @return array{v: Vitrine, produto: Produto, t: array<string, int>} */
    private function publicada(array $estoque = ['P' => 5, 'M' => 5, 'G' => 5], float $preco = 100, array $campos = []): array
    {
        $v = $this->criar(null, $campos);
        $p = $this->produtoDeTeste($estoque, $preco);
        $this->post("/painel/vitrines/{$v->id}/pecas", ['produtoId' => $p['produto']->id])->assertSessionHasNoErrors();
        $this->post("/painel/vitrines/{$v->id}/status", ['status' => 'publicada'])->assertSessionHasNoErrors();

        return ['v' => $v->refresh(), 'produto' => $p['produto'], 't' => $p['v']];
    }

    private function quero(string $slug, array $variantes, ?string $telefone = null, array $extra = [], string $ip = '10.9.0.1'): TestResponse
    {
        return $this->withServerVariables(['REMOTE_ADDR' => $ip])->postJson("/vitrine/{$slug}/interesse", ['variantes' => $variantes, 'nome' => 'Fulana Pública', 'telefone' => $telefone ?? $this->celular(), 'aceite' => true, ...$extra]);
    }

    private function publico(): void
    {
        auth()->logout();
    }

    public function test_permissoes(): void
    {
        $v = $this->criar();
        $p = $this->produtoDeTeste();
        $this->publico();
        $this->post('/painel/vitrines', [])->assertRedirectContains('/entrar');
        $outra = User::factory()->vendedor()->create(['name' => 'Carlos']);
        $this->actingAs($outra)->get("/painel/vitrines/{$v->id}")->assertNotFound();
        $this->actingAs($outra)->post("/painel/vitrines/{$v->id}/pecas", ['produtoId' => $p['produto']->id])->assertSessionHasErrors(['erro' => 'Vitrine não encontrada.']);
        $this->actingAs($outra)->post("/painel/vitrines/{$v->id}/status", ['status' => 'publicada'])->assertSessionHasErrors(['erro' => 'Vitrine não encontrada.']);
        $this->actingAs($outra)->post("/painel/vitrines/{$v->id}/duplicar")->assertSessionHasErrors(['erro' => 'Vitrine não encontrada.']);
        $this->actingAs($outra)->put("/painel/vitrines/{$v->id}", ['titulo' => 'Invadida'])->assertSessionHasErrors(['erro' => 'Vitrine não encontrada.']);
        $this->actingAs($outra)->get('/painel/vitrines')->assertInertia(fn (AssertableInertia $p) => $p->component('Painel/Vitrines/Index')->where('lista', []));
        $this->actingAs($this->gestora)->get("/painel/vitrines/{$v->id}")->assertOk();
        $this->actingAs($this->gestora)->get('/painel/vitrines')->assertInertia(fn (AssertableInertia $p) => $p->where('lista.0.id', $v->id));

        $this->assertSame($this->vendedora->id, $v->responsavelId);
        $this->actingAs($this->gestora)->post('/painel/vitrines', ['tipo' => 'post', 'titulo' => 'Sem dona'])->assertSessionHasErrors('responsavelId');
        $this->assertSame($this->vendedora->id, $this->criar($this->gestora, ['responsavelId' => $this->vendedora->id])->responsavelId);

        app(Config::class)->salvar(['vitrines' => ['ligadas' => false]]);
        $this->actingAs($this->vendedora)->get('/painel/vitrines')->assertNotFound();
        $this->publico();
        $this->get('/vitrines')->assertNotFound();
        $this->get('/live')->assertNotFound();
    }

    public function test_cadastro_endereco_e_pecas(): void
    {
        $this->actingAs($this->vendedora)->post('/painel/vitrines', ['tipo' => 'x', 'titulo' => 'Tipo ruim'])->assertSessionHasErrors('tipo');
        $this->post('/painel/vitrines', ['tipo' => 'post', 'titulo' => 'A'])->assertSessionHasErrors('titulo');
        foreach (['javascript:alert(1)', 'https://falso.com/x', 'http://instagram.com/x'] as $u) {
            $this->post('/painel/vitrines', ['tipo' => 'post', 'titulo' => 'Link ruim', 'urlInstagram' => $u])->assertSessionHasErrors('urlInstagram');
        }
        $a = $this->criar(null, ['titulo' => 'Novidades de Inverno!']);
        $b = $this->criar(null, ['titulo' => 'Novidades de Inverno!']);
        $this->assertSame(['novidades-de-inverno', 'novidades-de-inverno-2'], [$a->slug, $b->slug]);
        $this->put("/painel/vitrines/{$a->id}", ['titulo' => 'Outro título'])->assertSessionHasNoErrors();
        $this->assertSame('novidades-de-inverno', $a->refresh()->slug);

        $x = $this->produtoDeTeste();
        $y = $this->produtoDeTeste();
        $this->post("/painel/vitrines/{$a->id}/pecas", ['produtoId' => $x['produto']->id])->assertSessionHasNoErrors();
        $this->post("/painel/vitrines/{$a->id}/pecas", ['produtoId' => $y['produto']->id])->assertSessionHasNoErrors();
        $this->post("/painel/vitrines/{$a->id}/pecas", ['produtoId' => $x['produto']->id])->assertSessionHasErrors(['erro' => 'Esta peça já está na vitrine.']);
        $inativa = $this->produtoDeTeste(ativo: false);
        $this->post("/painel/vitrines/{$a->id}/pecas", ['produtoId' => $inativa['produto']->id])->assertSessionHasErrors('erro');
        $ordem = fn () => VitrinePeca::query()->where('vitrineId', $a->id)->orderBy('ordem')->orderBy('id')->pluck('id')->all();
        [$p1, $p2] = $ordem();
        $this->post("/painel/vitrines/{$a->id}/pecas/{$p2}/mover", ['direcao' => -1]);
        $this->assertSame([$p2, $p1], $ordem());
        $this->post("/painel/vitrines/{$a->id}/pecas/{$p2}/mover", ['direcao' => -1]);
        $this->assertSame([$p2, $p1], $ordem());
        $this->delete("/painel/vitrines/{$a->id}/pecas/{$p1}")->assertSessionHasNoErrors();
        $this->assertCount(1, $ordem());

        $c = $this->criar(null, ['urlInstagram' => 'https://www.instagram.com/p/x/', 'inicioPrevisto' => '2030-01-01T10:00']);
        $z = $this->produtoDeTeste();
        $this->post("/painel/vitrines/{$c->id}/pecas", ['produtoId' => $z['produto']->id]);
        $peca = VitrinePeca::query()->where('vitrineId', $c->id)->first();
        $this->post("/painel/vitrines/{$c->id}/pecas/{$peca->id}/oferta", ['oferta' => '95'])->assertSessionHasNoErrors();
        $this->post("/painel/vitrines/{$c->id}/duplicar")->assertRedirect();
        $copia = Vitrine::query()->with('pecas')->where('titulo', "{$c->titulo} (cópia)")->first();
        $this->assertSame(['rascunho', null, null], [$copia->status->value, $copia->urlInstagram, $copia->inicioPrevisto]);
        $this->assertNotSame($c->slug, $copia->slug);
        $this->assertEquals(95, (float) $copia->pecas[0]->precoOferta);
    }

    public function test_preco_especial(): void
    {
        $v = $this->criar();
        $p = $this->produtoDeTeste(preco: 100);
        $this->post("/painel/vitrines/{$v->id}/pecas", ['produtoId' => $p['produto']->id]);
        $peca = VitrinePeca::query()->where('vitrineId', $v->id)->first();
        $url = "/painel/vitrines/{$v->id}/pecas/{$peca->id}/oferta";
        $this->post($url, ['oferta' => '100'])->assertSessionHasErrors(['erro' => 'O preço especial precisa ser menor que o do catálogo.']);
        $this->post($url, ['oferta' => '0'])->assertSessionHasErrors('erro');
        $this->post($url, ['oferta' => 'abc'])->assertSessionHasErrors('erro');
        $this->post($url, ['oferta' => '50'])->assertSessionHasErrors(['erro' => 'O desconto máximo é de 10%. Para mais, fale com a gestão.']);
        $this->post($url, ['oferta' => '90'])->assertSessionHasNoErrors();
        $this->assertEquals(90, (float) $peca->refresh()->precoOferta);
        $this->actingAs($this->gestora)->post($url, ['oferta' => '50,00'])->assertSessionHasNoErrors();
        $this->assertEquals(50, (float) $peca->refresh()->precoOferta);
        $this->post($url, ['oferta' => ''])->assertSessionHasNoErrors();
        $this->assertNull($peca->refresh()->precoOferta);
    }

    public function test_situacoes_e_live(): void
    {
        $vazia = $this->criar();
        $this->post("/painel/vitrines/{$vazia->id}/status", ['status' => 'publicada'])->assertSessionHasErrors(['erro' => 'Adicione pelo menos uma peça.']);
        $this->post("/painel/vitrines/{$vazia->id}/status", ['status' => 'encerrada'])->assertSessionHasErrors('erro');
        $p = $this->produtoDeTeste();
        $a = $this->criar(null, ['tipo' => 'live']);
        $this->post("/painel/vitrines/{$a->id}/pecas", ['produtoId' => $p['produto']->id]);
        $this->post("/painel/vitrines/{$a->id}/status", ['status' => 'agendada'])->assertSessionHasErrors(['erro' => 'Marque a data e a hora da live.']);
        $this->put("/painel/vitrines/{$a->id}", ['titulo' => $a->titulo, 'inicioPrevisto' => '2030-01-01T19:30'])->assertSessionHasNoErrors();
        $this->assertSame('2030-01-01T22:30:00+00:00', $a->refresh()->inicioPrevisto->utc()->toIso8601String());
        $this->post("/painel/vitrines/{$a->id}/status", ['status' => 'agendada'])->assertSessionHasNoErrors();
        $this->post("/painel/vitrines/{$a->id}/status", ['status' => 'no_ar'])->assertSessionHasNoErrors();
        $this->publico();
        $this->get('/live')->assertRedirect("/vitrine/{$a->slug}");

        $b = $this->criar(null, ['tipo' => 'live', 'inicioPrevisto' => '2030-02-01T19:30']);
        $this->post("/painel/vitrines/{$b->id}/pecas", ['produtoId' => $p['produto']->id]);
        $this->post("/painel/vitrines/{$b->id}/status", ['status' => 'agendada']);
        $this->post("/painel/vitrines/{$b->id}/status", ['status' => 'no_ar'])->assertSessionHasErrors(['erro' => 'Já há uma live no ar. Encerre a outra primeiro.']);
        $this->post("/painel/vitrines/{$a->id}/status", ['status' => 'encerrada'])->assertSessionHasNoErrors();
        $a->refresh();
        $this->assertNotNull($a->inicioEm);
        $this->assertNotNull($a->fimEm);
        $this->publico();
        $this->get('/live')->assertRedirect("/vitrine/{$b->slug}");
    }

    public function test_o_que_o_publico_ve(): void
    {
        $v = $this->criar();
        $p = $this->produtoDeTeste(['P' => 9, 'M' => 1, 'G' => 0], 100, 77);
        $this->post("/painel/vitrines/{$v->id}/pecas", ['produtoId' => $p['produto']->id]);
        $this->get("/vitrine/{$v->slug}")->assertOk();
        $this->publico();
        $this->get("/vitrine/{$v->slug}")->assertNotFound();
        $this->actingAs($this->vendedora)->post("/painel/vitrines/{$v->id}/status", ['status' => 'publicada']);
        $this->publico();
        $r = $this->get("/vitrine/{$v->slug}")->assertOk();
        $r->assertInertia(fn (AssertableInertia $x) => $x->component('Publico/Vitrine')->where('v.pecas.0.variantes', [['id' => $p['v']['P'], 'tamanho' => 'P', 'ultimas' => false], ['id' => $p['v']['M'], 'tamanho' => 'M', 'ultimas' => true]]));
        $json = json_encode(app(Vitrines::class)->publica($v->slug));
        $this->assertDoesNotMatchRegularExpression('/custo|estoque|disponivel|codigoInterno|"reservado"/i', $json);
        $this->assertStringNotContainsString('"77"', $json);
        $this->assertStringNotContainsString(':77', $json);
        $this->assertSame(1, $v->refresh()->visitas);
        $this->withHeader('User-Agent', 'WhatsApp/2.23')->get("/vitrine/{$v->slug}");
        $this->assertSame(1, $v->refresh()->visitas);
        $this->get('/vitrines')->assertInertia(fn (AssertableInertia $x) => $x->component('Publico/Vitrines')->where('publicadas.0.slug', $v->slug)->where('publicadas.0.aPartirDe', 100));

        $this->actingAs($this->vendedora)->post("/painel/vitrines/{$v->id}/status", ['status' => 'encerrada']);
        $this->assertSame([], app(Vitrines::class)->publicas()['publicadas']);
        $this->assertNotNull(app(Vitrines::class)->publica($v->slug));
        $this->post("/painel/vitrines/{$v->id}/status", ['status' => 'arquivada']);
        $this->assertNull(app(Vitrines::class)->publica($v->slug));
        $this->assertNull(app(Vitrines::class)->publica($v->slug, true));
    }

    public function test_preco_especial_some_ao_vencer_e_ao_encerrar(): void
    {
        ['v' => $v, 'produto' => $produto] = $this->publicada(preco: 100);
        $peca = VitrinePeca::query()->where('vitrineId', $v->id)->where('produtoId', $produto->id)->first();
        $this->post("/painel/vitrines/{$v->id}/pecas/{$peca->id}/oferta", ['oferta' => '90']);
        $s = app(Vitrines::class);
        $this->assertEquals(90, $s->publica($v->slug)['pecas'][0]['preco']);
        $this->assertSame(10, $s->publica($v->slug)['pecas'][0]['desconto']);
        $v->update(['ofertaAte' => now()->subMinute()]);
        $vencida = $s->publica($v->slug);
        $this->assertEquals(100, $vencida['pecas'][0]['preco']);
        $this->assertNull($vencida['ofertaAte']);
        $v->update(['ofertaAte' => null]);
        $this->post("/painel/vitrines/{$v->id}/status", ['status' => 'encerrada']);
        $this->assertEquals(100, $s->publica($v->slug)['pecas'][0]['preco']);
    }

    public function test_formulario_publico_registra_para_a_responsavel(): void
    {
        ['v' => $v, 't' => $t] = $this->publicada();
        $tel = $this->celular();
        $this->publico();
        $fichas = Cliente::query()->count();
        $pedidos = Pedido::query()->count();
        $r = $this->quero($v->slug, [$t['P'], $t['M']], $tel)->assertOk()->json();
        $this->assertSame([true, 'Ana', '49988904646'], [$r['ok'], $r['destinatario'], $r['telefone']]);
        $this->assertMatchesRegularExpression('/^Oi, Ana! Vi "Vitrine \d+" e quero: .+, tam\. P; .+, tam\. M\. \(AT-\d{6}\)$/', $r['texto']);
        $a = Atendimento::query()->with('itens')->where('contatoTelefone', $tel)->first();
        $this->assertSame([$this->vendedora->id, 'vitrine', $v->id, null], [$a->responsavelId, $a->canal->value, $a->vitrineId, $a->clienteId]);
        $this->assertEqualsCanonicalizing([$t['P'], $t['M']], $a->itens->pluck('varianteId')->all());
        $this->assertSame([$fichas, $pedidos, 0], [Cliente::query()->count(), Pedido::query()->count(), $this->variante($t['P'])->reservado]);
    }

    public function test_live_usa_canal_live_e_outra_carteira_vai_para_a_dona_com_a_mesma_resposta(): void
    {
        $carlos = User::factory()->vendedor()->create(['name' => 'Carlos']);
        $ficha = Cliente::query()->create(['nome' => 'Ficha Secreta', 'telefone' => $this->celular(), 'vendedorId' => $carlos->id]);
        $v = $this->criar(null, ['tipo' => 'live', 'inicioPrevisto' => '2031-01-01T19:30']);
        $p = $this->produtoDeTeste();
        $this->post("/painel/vitrines/{$v->id}/pecas", ['produtoId' => $p['produto']->id]);
        $this->post("/painel/vitrines/{$v->id}/status", ['status' => 'agendada']);
        $this->publico();
        $conhecido = $this->quero($v->slug, [$p['v']['P']], $ficha->telefone)->json();
        $desconhecido = $this->quero($v->slug, [$p['v']['P']])->json();
        $sem = fn ($r) => preg_replace('/AT-\d+/', 'AT', $r['texto']);
        $this->assertSame($sem($conhecido), $sem($desconhecido));
        $this->assertDoesNotMatchRegularExpression('/Carlos|Secreta/', json_encode($conhecido));
        $a = Atendimento::query()->where('clienteId', $ficha->id)->first();
        $this->assertSame([$carlos->id, 'live', $v->id], [$a->responsavelId, $a->canal->value, $a->vitrineId]);
    }

    public function test_formulario_publico_recusa(): void
    {
        ['v' => $v, 't' => $t] = $this->publicada(['P' => 1, 'G' => 0]);
        $outra = $this->produtoDeTeste();
        $rascunho = $this->criar();
        $this->publico();
        $antes = Atendimento::query()->count();
        $this->assertFalse($this->quero($v->slug, [$outra['v']['P']])->json('ok'));
        $this->assertFalse($this->quero($v->slug, [$t['P'], $outra['v']['P']])->json('ok'));
        $this->assertFalse($this->quero($v->slug, [$t['G']])->json('ok'));
        $this->assertSame('Escolha pelo menos uma peça.', $this->quero($v->slug, [])->json('erro'));
        $this->assertSame('Para continuar, aceite o contato da loja.', $this->quero($v->slug, [$t['P']], null, ['aceite' => false])->json('erro'));
        $this->assertFalse($this->quero($v->slug, [$t['P']], '123')->json('ok'));
        $this->assertFalse($this->quero($rascunho->slug, [$t['P']])->json('ok'));
        $this->actingAs($this->vendedora)->post("/painel/vitrines/{$v->id}/status", ['status' => 'encerrada']);
        $this->publico();
        $this->assertSame('Esta vitrine não está mais aberta. Fale com a loja.', $this->quero($v->slug, [$t['P']])->json('erro'));
        $this->assertFalse($this->quero('nao-existe', [$t['P']])->json('ok'));
        $this->assertSame($antes, Atendimento::query()->count());
    }

    public function test_robo_nao_grava_e_limite_por_conexao(): void
    {
        ['v' => $v, 't' => $t] = $this->publicada();
        $this->publico();
        $tel = $this->celular();
        $this->assertTrue($this->quero($v->slug, [$t['P']], $tel, ['site' => 'http://spam'])->json('ok'));
        $this->assertSame(0, Atendimento::query()->where('contatoTelefone', $tel)->count());
        $r = [];
        for ($i = 0; $i < 11; $i++) {
            $r[] = $this->quero($v->slug, [$t['P']], null, [], '10.8.0.1')->json();
        }
        $this->assertTrue($r[9]['ok']);
        $this->assertFalse($r[10]['ok']);
        $this->assertStringContainsString('Muitos pedidos', $r[10]['erro']);
    }

    public function test_do_atendimento_ao_resultado_com_preco_especial_e_oferta_vencida(): void
    {
        ['v' => $v, 'produto' => $produto, 't' => $t] = $this->publicada(preco: 100);
        $peca = VitrinePeca::query()->where('vitrineId', $v->id)->where('produtoId', $produto->id)->first();
        $this->post("/painel/vitrines/{$v->id}/pecas/{$peca->id}/oferta", ['oferta' => '90']);
        $pedido = function (string $nome) use ($v, $t) {
            $tel = $this->celular();
            $this->publico();
            $this->quero($v->slug, [$t['P']], $tel);
            $a = Atendimento::query()->where('contatoTelefone', $tel)->first();
            $c = Cliente::query()->create(['nome' => $nome, 'telefone' => $tel, 'vendedorId' => $this->vendedora->id]);
            $a->update(['clienteId' => $c->id, 'contatoNome' => null, 'contatoTelefone' => null]);
            $r = $this->actingAs($this->vendedora)->postJson("/painel/atendimento/{$a->id}/pedido", ['tipo' => 'compra'])->json();
            $this->assertTrue($r['ok'], json_encode($r));

            return Pedido::query()->with('itens')->find($r['pedidoId']);
        };
        $p = $pedido('Confirmada');
        $this->assertSame($v->id, $p->vitrineId);
        $this->assertEquals([90, 100], [(float) $p->itens[0]->precoUnitario, (float) $p->itens[0]->precoTabela]);
        $s = app(Vitrines::class);
        $this->assertEquals(['atendimentos' => 1, 'ganhos' => 0, 'pedidos' => 1, 'vendas' => 0, 'valorAberto' => 90, 'valorVendido' => 0, 'conversao' => 0], array_intersect_key($s->resultado($this->vendedora, $v->id), array_flip(['atendimentos', 'ganhos', 'pedidos', 'vendas', 'valorAberto', 'valorVendido', 'conversao'])));
        $this->pedidos()->confirmar($p->id, [], $this->vendedora->id);
        $res = $s->resultado($this->vendedora, $v->id);
        $this->assertEquals(['atendimentos' => 1, 'ganhos' => 1, 'pedidos' => 1, 'vendas' => 1, 'valorAberto' => 0, 'valorVendido' => 90, 'conversao' => 100], array_intersect_key($res, array_flip(['atendimentos', 'ganhos', 'pedidos', 'vendas', 'valorAberto', 'valorVendido', 'conversao'])));
        $this->assertSame(['produtoId' => $produto->id, 'nome' => $produto->nome, 'pedidas' => 1, 'vendidas' => 1], $res['pecas'][0]);
        $this->actingAs($this->vendedora)->get('/painel/vitrines')->assertInertia(fn (AssertableInertia $x) => $x->where('lista.0.vendido', 90)->where('contagem.publicada', 1)->where('emUso', 1));

        $v->update(['ofertaAte' => now()->subMinute()]);
        $this->assertEquals(100, (float) $pedido('Atrasada')->itens[0]->precoUnitario);
    }
}
