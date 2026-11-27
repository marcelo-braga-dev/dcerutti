<?php

namespace Tests\Feature;

use App\Http\Controllers\Publico\PedidoController;
use App\Models\Atividade;
use App\Models\AtividadeEquipe;
use App\Models\Cliente;
use App\Models\ImportacaoEstoque as Registro;
use App\Models\Meta;
use App\Models\MovimentoEstoque;
use App\Models\Notificacao;
use App\Models\Produto;
use App\Models\SacolaCliente;
use App\Models\User;
use App\Models\Variante;
use App\Services\Config;
use App\Services\ImportacaoEstoque;
use App\Services\Manutencao;
use App\Support\Links;
use App\Support\PlanilhaEstoque;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia;
use Tests\Concerns\MundoDeTeste;
use Tests\TestCase;
use ZipArchive;

/** Retaguarda (fase 7): configurações, identidade, notificações, manutenção, link do pedido, relatórios e importação. */
class RetaguardaTest extends TestCase
{
    use MundoDeTeste, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->criarMundo();
        $this->withoutDefer();
    }

    /** Configuração lida do banco (a instância por requisição pode estar com o valor de antes). */
    private function lida(): Config
    {
        $this->app->forgetScopedInstances();

        return app(Config::class);
    }

    private function campos(): array
    {
        return ['cepsCondicional' => '89874-000', 'cidadeCondicional' => 'Maravilha', 'parcelas' => '0', 'diasExpiracao' => '7', 'horasSacola' => '24', 'parcelasMax' => '6', 'descontoMaxVendedor' => '10'];
    }

    public function test_configuracoes_frete_ceps_validacoes_e_so_gestor(): void
    {
        $this->actingAs($this->vendedora)->put('/painel/configuracoes', $this->campos())->assertForbidden();
        $this->actingAs($this->gestora)->put('/painel/configuracoes', [...$this->campos(), 'freteValor' => '30'])->assertSessionHasNoErrors();
        $this->assertNull($this->lida()->get('frete'));
        $this->put('/painel/configuracoes', [...$this->campos(), 'cobrarFrete' => '1', 'freteValor' => '24,90', 'freteGratisAcima' => '299']);
        $this->assertEquals(['valor' => 24.9, 'gratisAcima' => 299], $this->lida()->get('frete'));
        $this->put('/painel/configuracoes', [...$this->campos(), 'cepsCondicional' => "89874000, 89874-001;89875000\n89876-000"])->assertSessionHasNoErrors();
        $this->assertSame(['89874-000', '89874-001', '89875-000', '89876-000'], $this->lida()->get('cepsCondicional'));
        $this->put('/painel/configuracoes', [...$this->campos(), 'cepsCondicional' => '89874-000, 8987'])->assertSessionHasErrors('cepsCondicional');
        foreach ([['cidadeCondicional' => ' '], ['parcelas' => '13'], ['diasExpiracao' => '91'], ['diasExpiracao' => '-1'], ['diasExpiracao' => '2.5'], ['cobrarFrete' => '1', 'freteValor' => '']] as $ruim) {
            $this->put('/painel/configuracoes', [...$this->campos(), 'diasExpiracao' => '9', ...$ruim])->assertSessionHasErrors(array_key_last($ruim) === 'freteValor' ? 'freteValor' : array_key_first($ruim));
        }
        $this->assertSame(7, $this->lida()->get('diasExpiracao'));
        $this->put('/painel/configuracoes', [...$this->campos(), 'catalogoPublico' => '1', 'vendedorPadraoId' => $this->vendedora->id, 'vitrinesLigadas' => '1', 'instagramLoja' => '@Loja.Nova'])->assertSessionHasNoErrors();
        $c = $this->lida();
        $this->assertSame([true, $this->vendedora->id, true, 'loja.nova'], [$c->get('catalogoPublico'), $c->get('vendedorPadraoId'), $c->get('vitrines.ligadas'), $c->get('instagramLoja')]);
        $this->get('/painel/configuracoes')->assertInertia(fn (AssertableInertia $p) => $p->component('Painel/Configuracoes/Index'));
    }

    public function test_identidade_nome_cores_e_padrao_nao_gravado(): void
    {
        $this->actingAs($this->gestora)->post('/painel/identidade', ['nome' => 'A', 'slogan' => ''])->assertSessionHasErrors('erro');
        $this->post('/painel/identidade', ['nome' => 'Loja Teste', 'slogan' => '', 'cor:caramelo' => '#ABC', 'cor:creme' => '#f6f2ec', 'cor:oliva' => 'zz'])->assertSessionHasErrors('erro');
        $this->post('/painel/identidade', ['nome' => 'Loja Teste', 'slogan' => '', 'cor:caramelo' => '#ABC', 'cor:creme' => '#f6f2ec'])->assertSessionHasNoErrors();
        $id = $this->lida()->get('identidade');
        $this->assertSame('Loja Teste', $id['nome']);
        $this->assertEquals(['caramelo' => '#aabbcc'], (array) $id['cores']);
        $this->assertSame('Loja Teste', $this->lida()->nomeDaLoja()['nome']);
        $this->get('/painel/identidade')->assertInertia(fn (AssertableInertia $p) => $p->component('Painel/Identidade')->where('inicial.nome', 'Loja Teste'));
    }

    public function test_notificacoes_lidas_preferencias_e_escopo(): void
    {
        $outra = User::factory()->vendedor()->create();
        $mk = fn ($u, $t) => Notificacao::query()->create(['usuarioId' => $u->id, 'tipo' => 'pedido_novo', 'titulo' => $t]);
        $a = $mk($this->vendedora, 'Uma');
        $mk($this->vendedora, 'Duas');
        $c = $mk($outra, 'Da outra');
        $this->actingAs($this->vendedora)->get('/painel/notificacoes?ver=nao-lidas')->assertInertia(fn (AssertableInertia $p) => $p->component('Painel/Notificacoes')->where('naoLidas', 2)->has('lista', 2));
        $this->post('/painel/notificacoes/lidas', ['id' => (string) $c->id]);
        $this->assertNull($c->refresh()->lidaEm);
        $this->post('/painel/notificacoes/lidas', ['id' => (string) $a->id]);
        $this->assertNotNull($a->refresh()->lidaEm);
        $this->post('/painel/notificacoes/lidas');
        $this->assertSame(0, Notificacao::query()->where('usuarioId', $this->vendedora->id)->whereNull('lidaEm')->count());
        $this->post('/painel/notificacoes/preferencias', ['painel' => ['pedido_novo', 'inventado'], 'email' => ['sacola_parada']]);
        $this->assertEquals(['painel' => ['pedido_novo'], 'email' => ['sacola_parada']], $this->vendedora->refresh()->preferenciasNotificacao);
    }

    public function test_manutencao_retencao_sacola_parada_e_verificacoes(): void
    {
        $agora = CarbonImmutable::now();
        $velho = Atividade::query()->create(['clienteId' => $this->cliente->id, 'tipo' => 'pagina', 'caminho' => '/', 'criadoEm' => $agora->subDays(400)]);
        $novo = Atividade::query()->create(['clienteId' => $this->cliente->id, 'tipo' => 'pagina', 'caminho' => '/', 'criadoEm' => $agora->subDays(300)]);
        $notif = Notificacao::query()->create(['usuarioId' => $this->vendedora->id, 'tipo' => 'pedido_novo', 'titulo' => 'velha']);
        Notificacao::query()->whereKey($notif->id)->update(['criadaEm' => $agora->subMonths(7)]);
        AtividadeEquipe::query()->create(['usuarioId' => $this->vendedora->id, 'tipo' => 'login', 'criadoEm' => $agora->subMonths(14)]);

        $t = $this->produtoDeTeste(['M' => 3]);
        SacolaCliente::query()->create(['clienteId' => $this->cliente->id, 'itens' => [['varianteId' => $t['v']['M'], 'quantidade' => 1]]]);
        DB::table('sacola_cliente')->where('clienteId', $this->cliente->id)->update(['atualizadoEm' => $agora->subHours(30)]);
        Meta::query()->create(['vendedorId' => $this->vendedora->id, 'mes' => now()->format('Y-m'), 'valor' => 100]);
        $p = $this->criarPedido([['varianteId' => $t['v']['M'], 'quantidade' => 2]]);
        $this->pedidos()->confirmar($p['id'], [], $this->vendedora->id);

        $r = app(Manutencao::class)->rodar($agora);
        $this->assertSame(1, $r['historico']);
        $this->assertNull(Atividade::query()->find($velho->id));
        $this->assertNotNull(Atividade::query()->find($novo->id));
        $this->assertNull(Notificacao::query()->find($notif->id));
        $this->assertSame(0, AtividadeEquipe::query()->where('criadoEm', '<', $agora->subMonths(13))->count());
        // A sacola parada não avisa: a cliente fez pedido depois de mexer nela. Mas fica marcada para não repetir.
        $this->assertSame(0, $r['sacolas']);
        $this->assertNotNull(SacolaCliente::query()->find($this->cliente->id)->avisadoEm);
        $this->assertSame(1, Notificacao::query()->where('usuarioId', $this->vendedora->id)->where('tipo', 'meta_batida')->count());
        app(Manutencao::class)->rodar($agora);
        $this->assertSame(1, Notificacao::query()->where('usuarioId', $this->vendedora->id)->where('tipo', 'meta_batida')->count());

        // Sacola de outra cliente, sem pedido depois: avisa uma vez.
        $outra = Cliente::query()->create(['vendedorId' => $this->vendedora->id, 'nome' => 'Sacola Parada', 'telefone' => '(49) 99900-0000']);
        SacolaCliente::query()->create(['clienteId' => $outra->id, 'itens' => [['varianteId' => $t['v']['M'], 'quantidade' => 1]]]);
        DB::table('sacola_cliente')->where('clienteId', $outra->id)->update(['atualizadoEm' => $agora->subHours(30)]);
        $this->assertSame(1, app(Manutencao::class)->avisarSacolasParadas($agora));
        $this->assertSame(0, app(Manutencao::class)->avisarSacolasParadas($agora));
        $this->assertSame(1, Notificacao::query()->where('tipo', 'sacola_parada')->where('usuarioId', $this->vendedora->id)->count());
    }

    public function test_link_publico_do_pedido_e_cartao(): void
    {
        $t = $this->produtoDeTeste(['P' => 3, 'M' => 3], 80);
        $p = $this->criarPedido([['varianteId' => $t['v']['P'], 'quantidade' => 1], ['varianteId' => $t['v']['M'], 'quantidade' => 2]]);
        $chave = Links::chaveDoPedido($p['codigo']);
        $this->get("/p/{$chave}")->assertOk()->assertInertia(fn (AssertableInertia $x) => $x->component('Publico/Pedido')->where('p.codigo', $p['codigo'])->where('p.pecas', 3));
        $json = json_encode(PedidoController::publico($chave));
        foreach (['nomeCliente', 'telefoneCliente', '"cep"', 'vendedor', 'custo', $this->cliente->nome] as $campo) {
            $this->assertStringNotContainsString($campo, $json);
        }
        $r = $this->get("/p/{$chave}/cartao.jpg")->assertOk()->assertHeader('Content-Type', 'image/jpeg');
        $img = $r->getContent();
        $this->assertLessThan(300 * 1024, strlen($img));
        $this->assertSame([1200, 630], array_slice(getimagesizefromstring($img), 0, 2));
        $this->assertSame($img, $this->get("/p/{$chave}/cartao.jpg")->getContent());
        $this->get('/p/'.Links::chaveDoPedido('PED-999999').'/cartao.jpg')->assertNotFound();
        $this->get('/p/PED-000001.aaaaaaaaaaaaaaaa')->assertNotFound();
    }

    public function test_resultados_interesse_e_equipe(): void
    {
        $t = $this->produtoDeTeste(['M' => 5], 100, 40);
        $p = $this->criarPedido([['varianteId' => $t['v']['M'], 'quantidade' => 2]]);
        $this->pedidos()->confirmar($p['id'], [], $this->vendedora->id);
        $this->actingAs($this->vendedora)->get('/painel/resultados')->assertForbidden();
        $this->actingAs($this->gestora)->get('/painel/resultados')->assertInertia(fn (AssertableInertia $x) => $x->component('Painel/Resultados')
            ->where('r.receita', 200)->where('r.custo', 80)->where('r.lucro', 120)->where('r.vendas', 1)->where('r.porProduto.0.lucro', 120));
        $this->get('/painel/resultados?mes=2020-01')->assertInertia(fn (AssertableInertia $x) => $x->where('r.vendas', 0));

        Atividade::query()->create(['clienteId' => $this->cliente->id, 'tipo' => 'produto', 'produtoId' => $t['produto']->id, 'criadoEm' => now()]);
        $outra = User::factory()->vendedor()->create();
        $this->actingAs($outra)->get('/painel/interesse')->assertInertia(fn (AssertableInertia $x) => $x->component('Painel/Interesse')->where('kpis.vistas', 0));
        $this->actingAs($this->vendedora)->get('/painel/interesse')->assertInertia(fn (AssertableInertia $x) => $x->where('kpis.vistas', 1)->where('produtos.0.pedidas', 2));

        AtividadeEquipe::query()->create(['usuarioId' => $this->vendedora->id, 'tipo' => 'cliente_cadastrado', 'criadoEm' => now()]);
        $this->actingAs($this->gestora)->get('/painel/equipe')->assertInertia(fn (AssertableInertia $x) => $x->component('Painel/Equipe')
            ->where('linhas.0.resumo.clientes', 1)->where('linhas.0.vendido', 200)->where('total', 1));
        $this->actingAs($this->vendedora)->get('/painel/equipe')->assertForbidden();
    }

    /** Planilha .xlsx mínima, montada à mão (o formato é um zip de XMLs). */
    private function planilha(array $linhas): string
    {
        $arquivo = tempnam(sys_get_temp_dir(), 'pl').'.xlsx';
        $z = new ZipArchive;
        $z->open($arquivo, ZipArchive::CREATE);
        $z->addFromString('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
        $z->addFromString('xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Estoque" sheetId="1" r:id="rId1"/></sheets></workbook>');
        $z->addFromString('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>');
        $linhasXml = '';
        foreach ([PlanilhaEstoque::COLUNAS, ...$linhas] as $i => $l) {
            $c = '';
            foreach (array_values($l) as $j => $v) {
                $ref = chr(65 + $j).($i + 1);
                $c .= is_int($v) || is_float($v) ? "<c r=\"{$ref}\"><v>{$v}</v></c>" : "<c r=\"{$ref}\" t=\"inlineStr\"><is><t>".htmlspecialchars((string) $v).'</t></is></c>';
            }
            $linhasXml .= '<row r="'.($i + 1)."\">{$c}</row>";
        }
        $z->addFromString('xl/worksheets/sheet1.xml', "<?xml version=\"1.0\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData>{$linhasXml}</sheetData></worksheet>");
        $z->close();

        return $arquivo;
    }

    public function test_importacao_de_estoque_previa_e_confirmacao(): void
    {
        $existente = $this->produtoDeTeste(['M' => 5], 100);
        $codigoM = Variante::query()->find($existente['v']['M'])->codigoInterno;
        $arquivo = $this->planilha([
            ['CIA. HERING.', $codigoM, $existente['ref'], '', 'CAMISETA MM MASC', 'M', 'N1007S', 'PRETO', 8, 1, 0, 119.9],
            ['GARRA JEANS', 'G1', '1010L', '7890000000011', 'CALCA SKINNY FEM', '38', 'PRETO', 'PRETO', 3, 0, 0, 199.9],
            ['GARRA JEANS', 'G2', '1010L', '', 'CALCA SKINNY FEM', '40', 'PRETO', 'PRETO', 2, 0, 0, 199.9],
            ['MAKRO AVIAMENTOS', 'X1', 'BOT', '', 'BOTAO', 'UN', '', '', 100, 0, 0, 1],
        ]);
        $r = ImportacaoEstoque::ler($arquivo);
        $this->assertSame(['Estoque', 4], [$r['aba'], count($r['linhas'])]);

        $up = new UploadedFile($arquivo, 'estoque.xlsx', null, null, true);
        $this->actingAs($this->vendedora)->post('/painel/produtos/importar', ['arquivo' => $up])->assertForbidden();
        $j = $this->actingAs($this->gestora)->post('/painel/produtos/importar', ['arquivo' => $up])->assertOk()->json();
        $this->assertSame(['produtosNovos' => 1, 'variantesNovas' => 2, 'estoqueAlterado' => 1, 'precosAlterados' => 1, 'desativados' => 0, 'reativados' => 0, 'ignoradas' => 1, 'avisos' => 0], $j['resumo']['contagens']);
        $this->assertTrue(collect($j['resumo']['fornecedores'])->firstWhere('nome', 'MAKRO AVIAMENTOS')['ignorar']);
        $this->assertSame(1, Produto::query()->count());

        $regras = collect($j['resumo']['fornecedores'])->mapWithKeys(fn ($f) => [$f['nome'] => ['marca' => $f['nome'] === 'GARRA JEANS' ? 'Garra' : $f['marca'], 'ignorar' => $f['ignorar']]])->all();
        $prev = $this->postJson('/painel/produtos/importar/previa', ['id' => $j['id'], 'regras' => $regras])->json();
        $this->assertSame(['Garra'], $prev['resumo']['marcasNovas']);
        $ok = $this->postJson('/painel/produtos/importar/confirmar', ['id' => $j['id'], 'nomeOriginal' => 'estoque.xlsx', 'regras' => $regras])->json();
        $this->assertTrue($ok['ok']);

        $p = Produto::query()->with('variantes', 'marca')->where('referencia', '<>', $existente['ref'])->first();
        $this->assertSame(['1010L', 'Calça Skinny Feminina - Preto', 'Garra', 'feminino', true], [$p->referencia, $p->nome, $p->marca->nome, $p->genero->value, $p->ativo]);
        $this->assertSame(['38' => 3, '40' => 2], $p->variantes->sortBy('tamanho')->pluck('estoque', 'tamanho')->all());
        $this->assertSame('7890000000011', $p->variantes->firstWhere('tamanho', '38')->ean);
        $e = Produto::query()->with('variantes')->where('referencia', $existente['ref'])->first();
        $this->assertSame([7, 119.9, 119.9], [$e->variantes->first()->estoque, (float) $e->preco, (float) $e->precoCheio]);
        $this->assertSame(7, (int) MovimentoEstoque::query()->where('varianteId', $existente['v']['M'])->sum('delta'));
        $this->assertSame(1, Registro::query()->count());
        $this->assertSame('Garra', $this->lida()->get('fornecedores')['GARRA JEANS']['marca']);
        $this->get('/painel/produtos/importar')->assertInertia(fn (AssertableInertia $x) => $x->component('Painel/Produtos/Importar')->has('historico', 1));
    }
}
