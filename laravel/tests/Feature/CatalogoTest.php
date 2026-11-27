<?php

namespace Tests\Feature;

use App\Services\Catalogo;
use App\Support\Pecas;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\MundoDeTeste;
use Tests\TestCase;

/** Catálogo em cache (src/server/catalogo.ts) e os auxiliares de tamanho e cor. */
class CatalogoTest extends TestCase
{
    use MundoDeTeste, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->criarMundo();
    }

    public function test_o_catalogo_ja_mostra_a_reserva_logo_depois_do_pedido(): void
    {
        ['v' => $v, 'ref' => $ref] = $this->produtoDeTeste(['M' => 5]);
        app(Catalogo::class)->lista();
        $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 2]], 'condicional');
        $p = app(Catalogo::class)->porReferencia($ref);
        $this->assertSame(3, collect($p['variantes'])->firstWhere('tamanho', 'M')['disponivel']);
    }

    public function test_inativo_fica_fora_e_nunca_traz_custo(): void
    {
        $ativo = $this->produtoDeTeste(['M' => 1], custo: 40);
        $inativo = $this->produtoDeTeste(['M' => 1], ativo: false);
        $c = app(Catalogo::class);
        $c->invalidar();
        $this->assertNotNull($c->porReferencia($ativo['ref']));
        $this->assertNull($c->porReferencia($inativo['ref']));
        $this->assertArrayNotHasKey('custo', $c->porReferencia($ativo['ref']));
    }

    public function test_cores_do_mesmo_modelo_e_tamanhos(): void
    {
        $preto = $this->produtoDeTeste(['G' => 0, 'P' => 1]);
        $preto['produto']->update(['nome' => 'Bermuda Básica Chino - PRETO']);
        $bege = $this->produtoDeTeste(['M' => 1]);
        $bege['produto']->update(['nome' => 'Bermuda Básica Chino - bege 2']);
        $c = app(Catalogo::class);
        $c->invalidar();
        $p = $c->porReferencia($preto['ref']);
        $this->assertSame('Preto', $p['corNome']);
        $this->assertSame(['Preto', 'Bege'], array_column($p['cores'], 'cor'));
        $this->assertSame($p['modelo'], $c->porReferencia($bege['ref'])['modelo']);
        $this->assertSame(['UNI', 'UNI', 'GG'], [Pecas::normalizarTamanho('u'), Pecas::normalizarTamanho(' Único '), Pecas::normalizarTamanho('gg')]);
        $this->assertLessThan(Pecas::posicaoTamanho('G'), Pecas::posicaoTamanho('P'));
        $this->assertSame('bermuda basica', Pecas::normalizar(' Bermuda Básica '));
    }
}
