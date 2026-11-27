<?php

namespace Tests\Feature;

use App\Models\Atendimento;
use App\Models\AtendimentoRegistro;
use App\Models\Cliente;
use App\Models\NumeroWhatsApp;
use App\Models\Pedido;
use App\Models\Produto;
use App\Models\User;
use App\Services\Config;
use App\Services\InteressePublico;
use App\Support\Links;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia;
use Tests\Concerns\MundoDeTeste;
use Tests\TestCase;

/** Link da peça (porta de tests/integracao/peca.test.ts): página pública, "Quero esta peça" e "enviar peça" no painel. */
class PecaPublicaTest extends TestCase
{
    use MundoDeTeste, RefreshDatabase;

    private int $seq = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->criarMundo();
        $this->withoutDefer();
        app(Config::class)->salvar(['atendimento' => ['ligado' => true]]);
        $n = NumeroWhatsApp::query()->create(['apelido' => 'Ana', 'telefone' => '49988904646', 'criadoPorId' => $this->gestora->id, 'status' => 'ativo']);
        $this->vendedora->update(['numeroPrincipalId' => $n->id]);
    }

    private function celular(): string
    {
        $d = str_pad((string) (++$this->seq * 7919 % 100000000), 8, '0', STR_PAD_LEFT);

        return '(49) 9'.substr($d, 0, 4).'-'.substr($d, 4);
    }

    /** @return array{produto: Produto, v: array<string, int>, ref: string, chave: string} */
    private function chaveDaAna(array $estoque = ['P' => 5, 'M' => 5, 'G' => 5], ?float $custo = 40): array
    {
        $t = $this->produtoDeTeste($estoque, 100, $custo);

        return [...$t, 'chave' => Links::chaveDaPeca($t['ref'], $this->vendedora->id)];
    }

    private function quero(string $chave, int $varianteId, ?string $telefone = null, array $extra = [], string $ip = '10.1.0.1'): TestResponse
    {
        return $this->withServerVariables(['REMOTE_ADDR' => $ip])->postJson('/peca/'.rawurlencode($chave).'/quero', ['varianteId' => $varianteId, 'nome' => 'Fulana Pública', 'telefone' => $telefone ?? $this->celular(), 'aceite' => true, ...$extra]);
    }

    public function test_pagina_publica_so_com_a_chave_certa_e_sem_custo(): void
    {
        ['chave' => $chave, 'ref' => $ref] = $this->chaveDaAna(['P' => 9, 'M' => 1, 'G' => 0], 77);
        $s = app(InteressePublico::class);
        $this->assertNull($s->peca("{$ref}~{$this->vendedora->id}.aaaaaaaaaaaaaaaa"));
        $p = $s->peca($chave);
        $this->assertSame([['P', false], ['M', true]], array_map(fn ($v) => [$v['tamanho'], $v['ultimas']], $p['variantes']));
        $json = json_encode($p);
        $this->assertDoesNotMatchRegularExpression('/custo|estoque|disponivel|codigoInterno|"reservado"/i', $json);
        $this->assertStringNotContainsString(':77', $json);
        $this->assertSame('Ana', $p['contato']['nome']);
        $this->get('/peca/'.rawurlencode($chave))->assertOk()->assertInertia(fn (AssertableInertia $x) => $x->component('Publico/Peca')->where('p.referencia', $ref));
        $this->get('/peca/chave-falsa')->assertNotFound();

        $inativa = $this->produtoDeTeste(ativo: false);
        $outra = User::factory()->vendedor()->create(['name' => 'Gustavo']);
        $this->assertNull($s->peca(Links::chaveDaPeca($inativa['ref'], $outra->id)));
        $t = $this->produtoDeTeste();
        $this->assertSame(['telefone' => '49988036499', 'nome' => null], $s->peca(Links::chaveDaPeca($t['ref'], $outra->id))['contato']);
    }

    public function test_quero_registra_para_quem_enviou_sem_ficha_pedido_nem_reserva(): void
    {
        ['chave' => $chave, 'v' => $v] = $this->chaveDaAna();
        $tel = $this->celular();
        $fichas = Cliente::query()->count();
        $pedidos = Pedido::query()->count();
        $r = $this->quero($chave, $v['P'], $tel)->json();
        $this->assertSame([true, 'Ana', '49988904646'], [$r['ok'], $r['destinatario'], $r['telefone']]);
        $this->assertMatchesRegularExpression('/^Oi, Ana! Quero esta peça: .+, tam\. P\. \(AT-\d{6}\)$/', $r['texto']);
        $a = Atendimento::query()->with('itens')->where('contatoTelefone', $tel)->first();
        $this->assertSame([$this->vendedora->id, 'link_peca', null, 'Fulana Pública'], [$a->responsavelId, $a->canal->value, $a->clienteId, $a->contatoNome]);
        $this->assertNotNull($a->aceitouContatoEm);
        $this->assertSame([$v['P']], $a->itens->pluck('varianteId')->all());
        $this->assertSame([$fichas, $pedidos, 0], [Cliente::query()->count(), Pedido::query()->count(), $this->variante($v['P'])->reservado]);
    }

    public function test_telefone_de_outra_carteira_vai_para_a_dona_e_mesma_pessoa_junta_as_pecas(): void
    {
        ['chave' => $chave, 'v' => $v] = $this->chaveDaAna();
        $carlos = User::factory()->vendedor()->create(['name' => 'Carlos']);
        $ficha = Cliente::query()->create(['nome' => 'Ficha Secreta', 'telefone' => $this->celular(), 'vendedorId' => $carlos->id]);
        $conhecido = $this->quero($chave, $v['P'], $ficha->telefone)->json();
        $desconhecido = $this->quero($chave, $v['P'])->json();
        $sem = fn ($r) => preg_replace('/AT-\d+/', 'AT', $r['texto']);
        $this->assertSame($sem($conhecido), $sem($desconhecido));
        $this->assertDoesNotMatchRegularExpression('/Carlos|Secreta/', json_encode($conhecido));
        $a = Atendimento::query()->with('registros')->where('clienteId', $ficha->id)->first();
        $this->assertSame([$carlos->id, null], [$a->responsavelId, $a->contatoNome]);
        $this->assertStringContainsString('Fulana Pública', $a->registros[0]->texto);
        $this->assertSame('Ficha Secreta', $ficha->refresh()->nome);

        $tel = $this->celular();
        $this->quero($chave, $v['P'], $tel);
        $this->quero($chave, $v['M'], $tel, [], '10.2.0.1');
        $this->quero($chave, $v['M'], $tel, [], '10.2.0.1');
        $lista = Atendimento::query()->with('itens')->where('contatoTelefone', $tel)->get();
        $this->assertCount(1, $lista);
        $this->assertEqualsCanonicalizing([[$v['P'], 1], [$v['M'], 1]], $lista[0]->itens->map(fn ($i) => [$i->varianteId, $i->quantidade])->all());
    }

    public function test_validacoes_robo_e_limites(): void
    {
        ['chave' => $chave, 'v' => $v] = $this->chaveDaAna(['P' => 1, 'G' => 0]);
        $outra = $this->produtoDeTeste();
        $antes = Atendimento::query()->count();
        $this->assertFalse($this->quero($chave, $v['P'], null, ['aceite' => false])->json('ok'));
        $this->assertFalse($this->quero($chave, $v['P'], '123')->json('ok'));
        $this->assertSame('Informe seu nome.', $this->quero($chave, $v['P'], null, ['nome' => 'A'])->json('erro'));
        $this->assertSame('Este tamanho acabou. Escolha outro.', $this->quero($chave, $outra['v']['P'])->json('erro'));
        $this->assertFalse($this->quero($chave, $v['G'])->json('ok'));
        $this->assertFalse($this->quero('chave-falsa', $v['P'])->json('ok'));
        $tel = $this->celular();
        $this->assertTrue($this->quero($chave, $v['P'], $tel, ['site' => 'http://spam'])->json('ok'));
        $this->assertSame($antes, Atendimento::query()->count());

        $r = [];
        for ($i = 0; $i < 11; $i++) {
            $r[] = $this->quero($chave, $v['P'], null, [], '10.3.0.1')->json();
        }
        $this->assertTrue(collect(array_slice($r, 0, 10))->every(fn ($x) => $x['ok']));
        $this->assertStringContainsString('Muitos pedidos', $r[10]['erro']);
        $tel = $this->celular();
        for ($i = 0; $i < 5; $i++) {
            $this->assertTrue($this->quero($chave, $v['P'], $tel, [], "10.4.0.{$i}")->json('ok'));
        }
        $this->assertFalse($this->quero($chave, $v['P'], $tel, [], '10.4.0.99')->json('ok'));
    }

    public function test_confirmado_o_numero_o_atendimento_publico_cria_a_ficha(): void
    {
        ['chave' => $chave, 'v' => $v] = $this->chaveDaAna();
        $tel = $this->celular();
        $this->quero($chave, $v['P'], $tel);
        $a = Atendimento::query()->where('contatoTelefone', $tel)->first();
        $this->actingAs($this->vendedora)->post("/painel/atendimento/{$a->id}/contato", ['telefone' => $tel])->assertSessionHasNoErrors();
        $c = Cliente::query()->find($a->refresh()->clienteId);
        $this->assertSame(['Fulana Pública', $tel, $this->vendedora->id, 'link_peca'], [$c->nome, $c->telefone, $c->vendedorId, $c->origem->value ?? $c->origem]);
    }

    public function test_enviar_peca_so_equipe_link_de_quem_enviou_e_historico(): void
    {
        ['ref' => $ref] = $this->produtoDeTeste();
        $u = User::factory()->create(['papel' => 'cliente']);
        $this->actingAs($u)->getJson("/painel/pecas/{$ref}/envio")->assertRedirect();
        $r = $this->actingAs($this->vendedora)->getJson("/painel/pecas/{$ref}/envio")->json();
        $this->assertSame([true, $ref, false], [$r['ok'], $r['referencia'], $r['semEstoque']]);
        $this->assertStringContainsString(Links::chaveDaPeca($ref, $this->vendedora->id), rawurldecode($r['link']));
        $this->assertStringContainsString('Tamanhos: P, M, G', $r['texto']);
        $this->assertFalse($this->getJson('/painel/pecas/NAO-EXISTE/envio')->json('ok'));

        $at = Atendimento::query()->create(['codigo' => 'AT-E00001', 'canal' => 'whatsapp', 'contatoNome' => 'X', 'responsavelId' => $this->vendedora->id]);
        $this->postJson("/painel/pecas/{$ref}/enviada", ['atendimentoId' => $at->id])->assertOk();
        $this->assertSame(1, AtendimentoRegistro::query()->where('atendimentoId', $at->id)->where('tipo', 'envio_peca')->count());
        $carlos = User::factory()->vendedor()->create(['name' => 'Carlos']);
        $this->actingAs($carlos)->postJson("/painel/pecas/{$ref}/enviada", ['atendimentoId' => $at->id])->assertOk();
        $this->assertSame(1, AtendimentoRegistro::query()->where('atendimentoId', $at->id)->where('tipo', 'envio_peca')->count());
    }
}
