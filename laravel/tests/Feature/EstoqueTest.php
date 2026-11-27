<?php

namespace Tests\Feature;

use App\Enums\MotivoEstoque;
use App\Exceptions\ErroNegocio;
use App\Models\MovimentoEstoque;
use App\Services\Estoque;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\MundoDeTeste;
use Tests\TestCase;

/** Módulo único de estoque (porta de tests/integracao/estoque.test.ts). */
class EstoqueTest extends TestCase
{
    use MundoDeTeste, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->criarMundo();
    }

    private function estoque(): Estoque
    {
        return app(Estoque::class);
    }

    /** Movimentos feitos pelo teste (sem o estoque inicial do auxiliar). */
    private function movimentosDoTeste(int $varianteId)
    {
        return MovimentoEstoque::query()->where('varianteId', $varianteId)
            ->where(fn ($q) => $q->whereNull('observacao')->orWhere('observacao', '<>', 'Estoque inicial (teste)'))->orderBy('id')->get();
    }

    public function test_reserva_o_disponivel_e_recusa_alem_disso(): void
    {
        $v = $this->produtoDeTeste(['M' => 3])['v'];
        DB::transaction(fn () => $this->estoque()->reservar($v['M'], 2));
        $this->assertSame(2, $this->variante($v['M'])->reservado);
        try {
            DB::transaction(fn () => $this->estoque()->reservar($v['M'], 2));
            $this->fail('devia recusar');
        } catch (ErroNegocio) {
        }
        $this->assertSame(2, $this->variante($v['M'])->reservado, 'a falha não reserva nada');
        DB::transaction(fn () => $this->estoque()->reservar($v['M'], 1));
        $this->assertSame(3, $this->variante($v['M'])->reservado);
    }

    public function test_liberar_nunca_deixa_a_reserva_negativa(): void
    {
        $v = $this->produtoDeTeste(['M' => 3])['v'];
        DB::transaction(fn () => $this->estoque()->reservar($v['M'], 1));
        DB::transaction(fn () => $this->estoque()->liberarReserva($v['M'], 5));
        $this->assertSame(0, $this->variante($v['M'])->reservado);
    }

    public function test_baixa_sem_reserva_registra_no_historico(): void
    {
        $v = $this->produtoDeTeste(['G' => 4])['v'];
        DB::transaction(fn () => $this->estoque()->baixarVenda($v['G'], 3, false, null, $this->gestora->id, 'teste', 'x'));
        $this->assertSame([1, 0], [$this->variante($v['G'])->estoque, $this->variante($v['G'])->reservado]);
        $m = MovimentoEstoque::query()->where('varianteId', $v['G'])->latest('id')->first();
        $this->assertSame([-3, MotivoEstoque::Venda, $this->gestora->id], [$m->delta, $m->motivo, $m->usuarioId]);
    }

    public function test_baixa_de_peca_reservada_baixa_estoque_e_reserva_juntos(): void
    {
        $v = $this->produtoDeTeste(['G' => 4])['v'];
        DB::transaction(fn () => $this->estoque()->reservar($v['G'], 2));
        DB::transaction(fn () => $this->estoque()->baixarVenda($v['G'], 2, true, null, null, 'x', 'x'));
        $this->assertSame([2, 0], [$this->variante($v['G'])->estoque, $this->variante($v['G'])->reservado]);
    }

    public function test_baixa_sem_estoque_recusa_com_o_nome_da_peca_e_nao_grava_nada(): void
    {
        $v = $this->produtoDeTeste(['G' => 1])['v'];
        try {
            DB::transaction(fn () => $this->estoque()->baixarVenda($v['G'], 2, false, null, null, 'x', 'Camiseta (tam. G)'));
            $this->fail('devia recusar');
        } catch (ErroNegocio $e) {
            $this->assertStringContainsString('Camiseta (tam. G)', $e->getMessage());
        }
        $this->assertSame(1, $this->variante($v['G'])->estoque);
        $this->assertCount(0, $this->movimentosDoTeste($v['G']));
    }

    public function test_entrada_soma_e_ajuste_define_com_quem_fez(): void
    {
        ['v' => $v, 'produto' => $produto] = $this->produtoDeTeste(['P' => 2]);
        $this->assertSame($produto->id, DB::transaction(fn () => $this->estoque()->movimentar($v['P'], MotivoEstoque::Entrada, 5, $this->gestora->id, 'Chegou')));
        $this->assertSame(7, $this->variante($v['P'])->estoque);
        DB::transaction(fn () => $this->estoque()->movimentar($v['P'], MotivoEstoque::Ajuste, 4, $this->gestora->id));
        $this->assertSame(4, $this->variante($v['P'])->estoque);
        $hist = $this->movimentosDoTeste($v['P']);
        $this->assertSame([['entrada', 5, 'Chegou'], ['ajuste', -3, null]], $hist->map(fn ($h) => [$h->motivo->value, $h->delta, $h->observacao])->all());
        $this->assertTrue($hist->every(fn ($h) => $h->usuarioId === $this->gestora->id));
    }

    public function test_ajuste_para_a_mesma_quantidade_nao_cria_movimento(): void
    {
        $v = $this->produtoDeTeste(['P' => 2])['v'];
        DB::transaction(fn () => $this->estoque()->movimentar($v['P'], MotivoEstoque::Ajuste, 2, null));
        $this->assertCount(0, $this->movimentosDoTeste($v['P']));
    }

    public function test_nunca_deixa_o_estoque_abaixo_do_reservado(): void
    {
        $v = $this->produtoDeTeste(['P' => 5])['v'];
        DB::transaction(fn () => $this->estoque()->reservar($v['P'], 3));
        try {
            DB::transaction(fn () => $this->estoque()->movimentar($v['P'], MotivoEstoque::Ajuste, 2, null));
            $this->fail('devia recusar');
        } catch (ErroNegocio $e) {
            $this->assertStringContainsString('3 peças reservadas', $e->getMessage());
        }
        DB::transaction(fn () => $this->estoque()->movimentar($v['P'], MotivoEstoque::Ajuste, 3, null));
        $this->assertSame(3, $this->variante($v['P'])->estoque);
    }

    public function test_tamanho_inexistente(): void
    {
        $this->expectExceptionMessage('Tamanho não encontrado.');
        DB::transaction(fn () => $this->estoque()->movimentar(999_999_999, MotivoEstoque::Entrada, 1, null));
    }

    public function test_estoque_inicial_so_registra_quando_ha_pecas(): void
    {
        $v = $this->produtoDeTeste(['P' => 0, 'M' => 0])['v'];
        $this->estoque()->registrarEstoqueInicial($v['P'], 0, null);
        $this->estoque()->registrarEstoqueInicial($v['M'], 4, null);
        $this->assertSame(0, MovimentoEstoque::query()->where('varianteId', $v['P'])->count());
        $m = MovimentoEstoque::query()->where('varianteId', $v['M'])->first();
        $this->assertSame([4, 'entrada', 'Estoque inicial'], [$m->delta, $m->motivo->value, $m->observacao]);
    }
}
