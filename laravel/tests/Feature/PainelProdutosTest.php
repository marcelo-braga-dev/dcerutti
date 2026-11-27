<?php

namespace Tests\Feature;

use App\Models\Custo;
use App\Models\Marca;
use App\Models\MovimentoEstoque;
use App\Models\Produto;
use App\Models\Variante;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\File;
use Imagick;
use ImagickPixel;
use Inertia\Testing\AssertableInertia;
use Tests\Concerns\MundoDeTeste;
use Tests\TestCase;

/** Produtos, estoque e mídia (porta das regras de src/server/acoes/produtos.ts, arquivos.ts e exclusao.ts). */
class PainelProdutosTest extends TestCase
{
    use MundoDeTeste, RefreshDatabase;

    private string $pasta;

    protected function setUp(): void
    {
        parent::setUp();
        $this->criarMundo();
        $this->pasta = storage_path('framework/testing/arquivos');
        File::deleteDirectory($this->pasta);
        config(['services.arquivos.dir' => $this->pasta]);
    }

    private function jpeg(int $largura = 2400, int $altura = 3200): UploadedFile
    {
        $img = new Imagick;
        $img->newImage($largura, $altura, new ImagickPixel('#c9a27e'));
        $img->setImageFormat('jpeg');
        $caminho = tempnam(sys_get_temp_dir(), 'foto').'.jpg';
        file_put_contents($caminho, $img->getImageBlob());

        return new UploadedFile($caminho, 'foto.jpg', 'image/jpeg', null, true);
    }

    /** @return array<string, mixed> */
    private function dados(array $extra = []): array
    {
        $marca = Marca::query()->firstOrCreate(['slug' => 'hering'], ['nome' => 'Hering']);

        return ['referencia' => 'ref123', 'nome' => 'Camiseta Gola V - Off White', 'marcaId' => $marca->id, 'categoriaId' => 'nova', 'novaCategoria' => 'Camisetas Básicas', 'genero' => 'feminino', 'preco' => '89,90', 'precoCheio' => '119,90', 'custo' => '35', 'ativo' => true, ...$extra];
    }

    public function test_upload_de_foto_vira_webp_reduzido_e_o_produto_e_cadastrado_com_ela(): void
    {
        $r = $this->actingAs($this->gestora)->post('/api/upload', ['referencia' => 'REF123', 'arquivo' => $this->jpeg()])->assertOk()->json();
        $this->assertMatchesRegularExpression('#^/arquivos/produtos/REF123/[a-z0-9]+-[0-9a-f]{8}\.webp$#', $r['publica']);
        $img = new Imagick($this->pasta.substr($r['publica'], strlen('/arquivos')));
        $this->assertSame(['WEBP', 1200, 1600], [$img->getImageFormat(), $img->getImageWidth(), $img->getImageHeight()]);

        $this->actingAs($this->gestora)->post('/painel/produtos', $this->dados(['imagens' => [$r['publica']], 'destaques' => ['Tecido macio']]))->assertRedirect();
        $p = Produto::query()->with(['imagens', 'categoria', 'custo'])->where('referencia', 'REF123')->first();
        $this->assertSame([$r['publica']], $p->imagens->pluck('url')->all());
        $this->assertSame(['Camisetas Básicas', 89.9, 119.9, 35.0, ['Tecido macio']], [$p->categoria->nome, (float) $p->preco, (float) $p->precoCheio, (float) $p->custo->valor, $p->destaques]);
    }

    public function test_upload_recusa_arquivo_que_nao_e_imagem_e_vendedora_em_peca_que_nao_existe(): void
    {
        $falso = UploadedFile::fake()->createWithContent('foto.jpg', 'isto não é imagem');
        $this->actingAs($this->gestora)->post('/api/upload', ['referencia' => 'X1', 'arquivo' => $falso])->assertStatus(400)->assertJson(['erro' => 'O arquivo não é uma imagem válida.']);
        $this->actingAs($this->vendedora)->post('/api/upload', ['referencia' => 'NAOEXISTE', 'arquivo' => $this->jpeg(10, 10)])->assertForbidden();
        $this->actingAs($this->vendedora)->post('/api/upload', ['referencia' => $this->produtoDeTeste()['ref'], 'arquivo' => $this->jpeg(10, 10)])->assertOk();
    }

    public function test_upload_de_video_confere_o_formato_pelo_conteudo(): void
    {
        $this->actingAs($this->gestora)->call('POST', '/api/upload/video?referencia=REF9', [], [], [], ['CONTENT_TYPE' => 'video/mp4'], 'não é vídeo')
            ->assertStatus(400)->assertJson(['erro' => 'O arquivo não é um vídeo válido. Use MP4, MOV ou WebM.']);
        $mp4 = '/var/www/armazenamento/produtos/SEED/video-1.mp4';
        if (! is_file($mp4)) {
            $this->markTestSkipped('Vídeo de exemplo do seed não encontrado.');
        }
        $r = $this->actingAs($this->gestora)->call('POST', '/api/upload/video?referencia=REF9', [], [], [], ['CONTENT_TYPE' => 'video/mp4'], file_get_contents($mp4))->assertOk()->json();
        $this->assertMatchesRegularExpression('#^/arquivos/produtos/REF9/.+\.mp4$#', $r['publica']);
    }

    public function test_validacoes_do_cadastro(): void
    {
        $this->actingAs($this->gestora)->post('/painel/produtos', $this->dados(['precoCheio' => '50']))->assertSessionHasErrors(['precoCheio' => 'O preço cheio deve ser maior ou igual ao preço de venda.']);
        $this->actingAs($this->gestora)->post('/painel/produtos', $this->dados(['preco' => 'abc']))->assertSessionHasErrors(['preco' => 'Informe o preço de venda.']);
        $this->actingAs($this->gestora)->post('/painel/produtos', $this->dados(['imagens' => ['http://site.com/x.jpg']]))->assertSessionHasErrors('imagens');
        $existente = $this->produtoDeTeste()['ref'];
        $this->actingAs($this->gestora)->post('/painel/produtos', $this->dados(['referencia' => strtolower($existente)]))->assertSessionHasErrors(['referencia' => 'Já existe um produto com esta referência.']);
        $this->actingAs($this->vendedora)->post('/painel/produtos', $this->dados())->assertForbidden();
    }

    public function test_tamanhos_e_movimentacao_de_estoque_com_historico(): void
    {
        ['produto' => $p, 'v' => $v] = $this->produtoDeTeste(['P' => 2]);
        $this->actingAs($this->gestora)->post("/painel/produtos/{$p->id}/variantes", ['tamanho' => 'm', 'estoque' => 4, 'codigoInterno' => 'C999'])->assertSessionHasNoErrors();
        $m = Variante::query()->where('produtoId', $p->id)->where('tamanho', 'M')->first();
        $this->assertSame([4, 'C999'], [$m->estoque, $m->codigoInterno]);
        $this->actingAs($this->gestora)->post("/painel/produtos/{$p->id}/variantes", ['tamanho' => 'M', 'estoque' => 1])->assertSessionHasErrors(['tamanho' => 'Este tamanho já existe no produto.']);

        $this->actingAs($this->gestora)->post("/painel/produtos/{$p->id}/estoque", ['varianteId' => $v['P'], 'tipo' => 'entrada', 'quantidade' => 0])->assertSessionHasErrors(['quantidade' => 'Informe quantas peças entraram.']);
        $this->actingAs($this->gestora)->post("/painel/produtos/{$p->id}/estoque", ['varianteId' => $v['P'], 'tipo' => 'entrada', 'quantidade' => 3, 'observacao' => 'NF 12'])->assertSessionHasNoErrors();
        $this->actingAs($this->gestora)->post("/painel/produtos/{$p->id}/estoque", ['varianteId' => $v['P'], 'tipo' => 'ajuste', 'quantidade' => 4])->assertSessionHasNoErrors();
        $this->assertSame(4, $this->variante($v['P'])->estoque);
        $this->assertSame([3, -1], MovimentoEstoque::query()->where('varianteId', $v['P'])->where('observacao', '<>', 'Estoque inicial (teste)')->orWhere(fn ($q) => $q->where('varianteId', $v['P'])->whereNull('observacao'))->orderBy('id')->pluck('delta')->all());

        $this->criarPedido([['varianteId' => $m->id, 'quantidade' => 1]]);
        $this->actingAs($this->gestora)->delete("/painel/produtos/{$p->id}/variantes/{$m->id}")->assertSessionHasErrors(['erro' => 'Este tamanho tem pedidos ou reserva. Zere o estoque em vez de remover.']);
        $this->actingAs($this->gestora)->get("/painel/produtos/{$p->id}")->assertOk()->assertInertia(fn (AssertableInertia $x) => $x->component('Painel/Produtos/Form')->has('produto.variantes', 2)->has('movimentos'));
    }

    public function test_excluir_produto_so_sem_pedido_e_apaga_os_arquivos(): void
    {
        $foto = $this->actingAs($this->gestora)->post('/api/upload', ['referencia' => 'APAGAR1', 'arquivo' => $this->jpeg(20, 20)])->json('publica');
        $this->actingAs($this->gestora)->post('/painel/produtos', $this->dados(['referencia' => 'APAGAR1', 'imagens' => [$foto]]));
        $p = Produto::query()->where('referencia', 'APAGAR1')->first();
        $arquivo = $this->pasta.substr($foto, strlen('/arquivos'));
        $this->assertFileExists($arquivo);
        $this->actingAs($this->gestora)->delete("/painel/produtos/{$p->id}")->assertRedirect('/painel/produtos');
        $this->assertFalse(Produto::query()->whereKey($p->id)->exists());
        $this->assertFileDoesNotExist($arquivo);

        ['produto' => $usado, 'v' => $v] = $this->produtoDeTeste(['M' => 3]);
        $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 1]]);
        $this->actingAs($this->gestora)->delete("/painel/produtos/{$usado->id}")->assertSessionHasErrors('erro');
        $this->assertTrue(Produto::query()->whereKey($usado->id)->exists());
    }

    public function test_midia_a_vendedora_so_acrescenta_e_o_gestor_remove(): void
    {
        ['produto' => $p] = $this->produtoDeTeste();
        $p->imagens()->create(['url' => '/arquivos/produtos/X/a.webp', 'ordem' => 0]);
        $this->actingAs($this->vendedora)->get("/painel/produtos/{$p->id}/midia")->assertOk();
        $this->actingAs($this->vendedora)->put("/painel/produtos/{$p->id}/midia", ['imagens' => [], 'videos' => []])->assertSessionHasErrors(['erro' => 'Só a gestão remove fotos e vídeos da peça.']);
        $this->actingAs($this->vendedora)->put("/painel/produtos/{$p->id}/midia", ['imagens' => ['/arquivos/produtos/X/a.webp', 'https://fora.com/b.jpg'], 'videos' => []])->assertSessionHasErrors(['erro' => 'Use fotos enviadas por aqui.']);
        $this->actingAs($this->vendedora)->put("/painel/produtos/{$p->id}/midia", ['imagens' => ['/arquivos/produtos/X/a.webp', '/arquivos/produtos/X/b.webp'], 'videos' => []])->assertSessionHasNoErrors();
        $this->actingAs($this->gestora)->put("/painel/produtos/{$p->id}/midia", ['imagens' => ['/arquivos/produtos/X/b.webp'], 'videos' => []])->assertSessionHasNoErrors();
        $this->assertSame(['/arquivos/produtos/X/b.webp'], $p->imagens()->pluck('url')->all());
        $this->actingAs($this->vendedora)->get('/painel/produtos')->assertForbidden();
        $this->assertSame(1, Custo::query()->where('produtoId', $p->id)->count());
    }
}
