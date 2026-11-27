<?php

namespace Tests\Feature;

use App\Exceptions\ErroNegocio;
use App\Models\Custo;
use App\Models\MovimentoEstoque;
use App\Models\Pedido;
use App\Models\PedidoHistorico;
use App\Models\Produto;
use App\Models\User;
use App\Models\Venda;
use App\Services\Pedidos\Pedidos;
use Closure;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\MundoDeTeste;
use Tests\TestCase;

/**
 * Ciclo de vida do pedido (porta de tests/integracao/pedidos.test.ts). As corridas simultâneas (Promise.all) não têm
 * equivalente num processo PHP só; as travas de linha são as mesmas da versão em Next.
 */
class PedidosTest extends TestCase
{
    use MundoDeTeste, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->criarMundo();
    }

    private function falha(Closure $fn, string $trecho): void
    {
        try {
            $fn();
            $this->fail("devia recusar com: {$trecho}");
        } catch (ErroNegocio $e) {
            $this->assertStringContainsString($trecho, $e->getMessage());
        }
    }

    // ---------- normalizarLinhas ----------

    public function test_normalizar_junta_repetidas_descarta_invalidas_e_limita_a_20(): void
    {
        $this->assertSame(
            [['varianteId' => 1, 'quantidade' => 5], ['varianteId' => 3, 'quantidade' => 20]],
            Pedidos::normalizarLinhas([['varianteId' => 1, 'quantidade' => 2], ['varianteId' => 1, 'quantidade' => 3], ['varianteId' => 2, 'quantidade' => 0], ['varianteId' => 3, 'quantidade' => 50]]),
        );
        $this->assertSame([['varianteId' => 4, 'quantidade' => 1]], Pedidos::normalizarLinhas([['varianteId' => 4, 'quantidade' => 1.9]]));
        $this->falha(fn () => Pedidos::normalizarLinhas([]), 'A sacola está vazia.');
        $this->falha(fn () => Pedidos::normalizarLinhas([['varianteId' => 1.5, 'quantidade' => 1]]), 'A sacola está vazia.');
        $this->falha(fn () => Pedidos::normalizarLinhas(array_map(fn ($i) => ['varianteId' => $i, 'quantidade' => 1], range(1, 41))), 'peças demais');
    }

    // ---------- criar ----------

    public function test_compra_usa_o_preco_do_banco_nao_reserva_e_grava_a_copia_da_peca(): void
    {
        ['v' => $v, 'produto' => $produto] = $this->produtoDeTeste(['P' => 3, 'M' => 3], 89.9);
        $p = $this->criarPedido([['varianteId' => $v['P'], 'quantidade' => 2], ['varianteId' => $v['M'], 'quantidade' => 1]]);
        $this->assertMatchesRegularExpression('/^PED-\d{6}$/', $p['codigo']);
        $this->assertEqualsWithDelta(269.7, $p['total'], 0.001);
        $this->assertNull($p['frete']);
        $this->assertSame(0, $this->variante($v['P'])->reservado);
        $this->assertSame(
            [['P', 2, 89.9, 'pendente', $produto->referencia, $produto->nome], ['M', 1, 89.9, 'pendente', $produto->referencia, $produto->nome]],
            $this->itensDe($p['id'])->map(fn ($i) => [$i->tamanho, $i->quantidade, (float) $i->precoUnitario, $i->situacao->value, $i->referencia, $i->nome])->all(),
        );
    }

    public function test_condicional_reserva_na_hora_e_usa_o_codigo_cond(): void
    {
        $v = $this->produtoDeTeste(['M' => 4])['v'];
        $p = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 3]], 'condicional', ['cep' => '89874-000']);
        $this->assertMatchesRegularExpression('/^COND-\d{6}$/', $p['codigo']);
        $this->assertSame([4, 3], [$this->variante($v['M'])->estoque, $this->variante($v['M'])->reservado]);
        $this->assertSame('89874-000', $this->pedido($p['id'])->cep);
    }

    public function test_frete_a_combinar_cobra_abaixo_e_gratis_acima(): void
    {
        $v = $this->produtoDeTeste(['M' => 50], 100)['v'];
        $regra = ['valor' => 24.9, 'gratisAcima' => 299];
        $c = fn (int $q, ?array $r) => $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => $q]], 'compra', ['regraFrete' => $r]);
        $this->assertNull($c(1, null)['frete']);
        $this->assertSame(24.9, $c(2, $regra)['frete']);
        $this->assertSame(0.0, $c(3, $regra)['frete']);
        $this->assertSame(15.0, $c(9, ['valor' => 15, 'gratisAcima' => 0])['frete']);
        $this->assertNull($this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 1]], 'condicional', ['regraFrete' => $regra])['frete'], 'condicional nunca tem frete');
    }

    public function test_recusa_peca_indisponivel_inativa_ou_inexistente_e_nao_grava_nada(): void
    {
        $v = $this->produtoDeTeste(['M' => 1])['v'];
        $vi = $this->produtoDeTeste(['M' => 5], ativo: false)['v'];
        $antes = Pedido::query()->count();
        $this->falha(fn () => $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 2]]), '1 disponível');
        $this->falha(fn () => $this->criarPedido([['varianteId' => $vi['M'], 'quantidade' => 1]]), 'não está mais disponível');
        $this->falha(fn () => $this->criarPedido([['varianteId' => 999_999_999, 'quantidade' => 1]]), 'não está mais disponível');
        $this->assertSame($antes, Pedido::query()->count());
    }

    public function test_peca_reservada_em_condicional_nao_esta_disponivel_para_outro(): void
    {
        $v = $this->produtoDeTeste(['M' => 2])['v'];
        $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 2]], 'condicional');
        $this->falha(fn () => $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 1]]), '0 disponível');
    }

    public function test_codigos_sequenciais(): void
    {
        $v = $this->produtoDeTeste(['M' => 100])['v'];
        $numeros = array_map(fn () => (int) substr($this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 1]])['codigo'], -6), range(1, 5));
        $this->assertSame(range($numeros[0], $numeros[0] + 4), $numeros);
    }

    // ---------- confirmar ----------

    public function test_compra_confirmada_baixa_grava_custo_do_momento_e_cria_a_venda(): void
    {
        ['v' => $v, 'produto' => $produto] = $this->produtoDeTeste(['M' => 5], 120, 50);
        $p = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 2]]);
        Custo::query()->where('produtoId', $produto->id)->update(['valor' => 55]); // muda antes de confirmar: vale o do momento
        $this->pedidos()->confirmar($p['id'], [], $this->gestora->id);

        $this->assertSame(3, $this->variante($v['M'])->estoque);
        $ped = Pedido::query()->with(['itens', 'venda'])->find($p['id']);
        $this->assertSame('confirmado', $ped->status->value);
        $this->assertNotNull($ped->confirmadoEm);
        $this->assertSame([['vendido', 55.0]], $ped->itens->map(fn ($i) => [$i->situacao->value, (float) $i->custoUnitario])->all());
        $this->assertSame([$this->cliente->vendedorId, $this->cliente->id, 240.0, 110.0, "Pedido {$p['codigo']}"], [$ped->venda->vendedorId, $ped->venda->clienteId, (float) $ped->venda->valor, (float) $ped->venda->custo, $ped->venda->observacao]);
        $mov = MovimentoEstoque::query()->where('pedidoId', $p['id'])->first();
        $this->assertSame([-2, 'venda', $this->gestora->id, $p['codigo']], [$mov->delta, $mov->motivo->value, $mov->usuarioId, $mov->observacao]);
    }

    public function test_produto_sem_custo_vende_sem_custo(): void
    {
        $v = $this->produtoDeTeste(['M' => 5], custo: null)['v'];
        $p = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 1]]);
        $this->pedidos()->confirmar($p['id'], [], $this->gestora->id);
        $this->assertNull(Venda::query()->where('pedidoId', $p['id'])->first()->custo);
    }

    public function test_condicional_parcial_divide_a_linha_e_libera_so_o_que_voltou(): void
    {
        $v = $this->produtoDeTeste(['M' => 5, 'G' => 5], 100, 40)['v'];
        $p = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 3], ['varianteId' => $v['G'], 'quantidade' => 1]], 'condicional');
        [$m, $g] = $this->itensDe($p['id'])->all();
        $this->pedidos()->confirmar($p['id'], [$m->id => 1, $g->id => 0], $this->vendedora->id);

        $this->assertSame([4, 0], [$this->variante($v['M'])->estoque, $this->variante($v['M'])->reservado]);
        $this->assertSame([5, 0], [$this->variante($v['G'])->estoque, $this->variante($v['G'])->reservado]);
        $this->assertSame(
            [['M', 1, 'vendido', 40.0], ['G', 1, 'devolvido', null], ['M', 2, 'devolvido', null]],
            $this->itensDe($p['id'])->map(fn ($i) => [$i->tamanho, $i->quantidade, $i->situacao->value, $i->custoUnitario === null ? null : (float) $i->custoUnitario])->all(),
        );
        $this->assertSame(100.0, (float) Venda::query()->where('pedidoId', $p['id'])->value('valor'));
        $this->assertSame(400.0, (float) $this->pedido($p['id'])->total, 'o total original não muda');
    }

    public function test_condicional_em_que_tudo_voltou_confirma_sem_venda_e_sem_baixa(): void
    {
        $v = $this->produtoDeTeste(['M' => 3])['v'];
        $p = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 2]], 'condicional');
        $m = $this->itensDe($p['id'])->first();
        $this->pedidos()->confirmar($p['id'], [$m->id => 0], $this->vendedora->id);
        $this->assertSame([3, 0], [$this->variante($v['M'])->estoque, $this->variante($v['M'])->reservado]);
        $this->assertFalse(Venda::query()->where('pedidoId', $p['id'])->exists());
        $this->assertSame('confirmado', $this->pedido($p['id'])->status->value);
    }

    public function test_condicional_sem_marcar_todas_ou_quantidade_impossivel_recusa(): void
    {
        $v = $this->produtoDeTeste(['M' => 3, 'G' => 3])['v'];
        $p = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 2], ['varianteId' => $v['G'], 'quantidade' => 1]], 'condicional');
        [$m, $g] = $this->itensDe($p['id'])->all();
        foreach ([[$m->id => 1], [$m->id => 3, $g->id => 0], [$m->id => -1, $g->id => 0]] as $ficaram) {
            $this->falha(fn () => $this->pedidos()->confirmar($p['id'], $ficaram, $this->vendedora->id), 'Marque quantas unidades');
        }
        $this->assertSame('pendente', $this->pedido($p['id'])->status->value);
        $this->assertSame([3, 2], [$this->variante($v['M'])->estoque, $this->variante($v['M'])->reservado]);
    }

    public function test_compra_cuja_peca_acabou_depois_recusa_a_confirmacao(): void
    {
        $v = $this->produtoDeTeste(['M' => 2])['v'];
        $p1 = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 2]]);
        $p2 = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 1]]);
        $this->pedidos()->confirmar($p1['id'], [], $this->vendedora->id);
        $this->falha(fn () => $this->pedidos()->confirmar($p2['id'], [], $this->vendedora->id), 'Estoque insuficiente');
        $this->assertSame('pendente', $this->pedido($p2['id'])->status->value);
        $this->assertSame(0, $this->variante($v['M'])->estoque);
    }

    public function test_confirmar_duas_vezes_ou_cancelar_depois_so_a_primeira_vale(): void
    {
        $v = $this->produtoDeTeste(['M' => 5])['v'];
        $p = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 1]]);
        $this->pedidos()->confirmar($p['id'], [], $this->vendedora->id);
        $this->falha(fn () => $this->pedidos()->confirmar($p['id'], [], $this->vendedora->id), 'já foi fechado');
        $this->falha(fn () => $this->pedidos()->cancelar($p['id'], 'equipe'), 'já foi fechado');
        $this->assertSame(4, $this->variante($v['M'])->estoque);
        $this->assertSame(1, Venda::query()->where('pedidoId', $p['id'])->count());
    }

    public function test_pedido_inexistente(): void
    {
        $this->falha(fn () => $this->pedidos()->confirmar('nao-existe', [], 'x'), 'Pedido não encontrado.');
        $this->falha(fn () => $this->pedidos()->cancelar('nao-existe', 'equipe'), 'Pedido não encontrado.');
    }

    // ---------- cancelar ----------

    public function test_cancelar_condicional_libera_a_reserva_e_grava_motivo_e_data(): void
    {
        $v = $this->produtoDeTeste(['M' => 3])['v'];
        $p = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 3]], 'condicional');
        $this->pedidos()->cancelar($p['id'], 'cliente');
        $this->assertSame([3, 0], [$this->variante($v['M'])->estoque, $this->variante($v['M'])->reservado]);
        $c = $this->pedido($p['id']);
        $this->assertSame(['cancelado', 'cliente'], [$c->status->value, $c->motivoCancelamento]);
        $this->assertNotNull($c->canceladoEm);
    }

    public function test_cancelar_compra_nao_mexe_no_estoque(): void
    {
        $v = $this->produtoDeTeste(['M' => 3])['v'];
        $p = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 2]]);
        $this->pedidos()->cancelar($p['id'], 'equipe');
        $this->assertSame([3, 0], [$this->variante($v['M'])->estoque, $this->variante($v['M'])->reservado]);
    }

    // ---------- editar ----------

    /** Edição só de quantidades (0 = retirar), mantendo peça e preço de cada linha. @param array<int, int|float> $q */
    private function editarQuantidades(string $pedidoId, array $q, ?array $regra): void
    {
        $linhas = $this->itensDe($pedidoId)->map(fn ($i) => ['itemId' => $i->id, 'varianteId' => $i->varianteId, 'quantidade' => $q[$i->id] ?? $i->quantidade, 'preco' => (float) $i->precoUnitario])
            ->filter(fn ($l) => $l['quantidade'] !== 0)->values()->all();
        $this->pedidos()->editar($pedidoId, $linhas, $regra, $this->vendedora->id);
    }

    public function test_editar_condicional_reserva_mais_devolve_e_retira(): void
    {
        $v = $this->produtoDeTeste(['M' => 5, 'G' => 5], 50)['v'];
        $p = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 2], ['varianteId' => $v['G'], 'quantidade' => 2]], 'condicional');
        [$m, $g] = $this->itensDe($p['id'])->all();
        $this->editarQuantidades($p['id'], [$m->id => 4, $g->id => 0], null);
        $this->assertSame(4, $this->variante($v['M'])->reservado);
        $this->assertSame(0, $this->variante($v['G'])->reservado);
        $this->assertSame([['M', 4]], $this->itensDe($p['id'])->map(fn ($i) => [$i->tamanho, $i->quantidade])->all());
        $this->assertSame(200.0, (float) $this->pedido($p['id'])->total);
    }

    public function test_editar_mantem_o_preco_combinado_mesmo_que_o_produto_mude(): void
    {
        ['v' => $v, 'produto' => $produto] = $this->produtoDeTeste(['M' => 5], 50);
        $p = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 1]]);
        $produto->update(['preco' => 80, 'precoCheio' => 80]);
        $this->editarQuantidades($p['id'], [$this->itensDe($p['id'])->first()->id => 3], null);
        $this->assertSame(150.0, (float) $this->pedido($p['id'])->total);
    }

    public function test_editar_recusa_aumentar_alem_do_disponivel(): void
    {
        $v = $this->produtoDeTeste(['M' => 2])['v'];
        $compra = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 1]]);
        $this->falha(fn () => $this->editarQuantidades($compra['id'], [$this->itensDe($compra['id'])->first()->id => 3], null), 'só 2 disponível');
        $this->assertSame(1, $this->itensDe($compra['id'])->first()->quantidade);

        $v2 = $this->produtoDeTeste(['M' => 2])['v'];
        $cond = $this->criarPedido([['varianteId' => $v2['M'], 'quantidade' => 1]], 'condicional');
        $this->falha(fn () => $this->editarQuantidades($cond['id'], [$this->itensDe($cond['id'])->first()->id => 3], null), 'não há 2 a mais');
        $this->assertSame(1, $this->variante($v2['M'])->reservado);
    }

    public function test_editar_recusa_pedido_sem_pecas_quantidade_invalida_e_nada_alterado(): void
    {
        $v = $this->produtoDeTeste(['M' => 5])['v'];
        $p = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 1]]);
        $m = $this->itensDe($p['id'])->first();
        $this->falha(fn () => $this->editarQuantidades($p['id'], [$m->id => 0], null), 'pelo menos uma peça');
        $this->falha(fn () => $this->editarQuantidades($p['id'], [$m->id => 21], null), 'Quantidade inválida.');
        $this->falha(fn () => $this->editarQuantidades($p['id'], [$m->id => 1.5], null), 'Quantidade inválida.');
        $this->falha(fn () => $this->editarQuantidades($p['id'], [], null), 'Nada foi alterado.');
    }

    public function test_pedido_fechado_nao_e_editado(): void
    {
        $v = $this->produtoDeTeste(['M' => 5])['v'];
        $p = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 1]]);
        $this->pedidos()->cancelar($p['id'], 'equipe');
        $this->falha(fn () => $this->editarQuantidades($p['id'], [$this->itensDe($p['id'])->first()->id => 2], null), 'já foi fechado');
        $this->falha(fn () => $this->pedidos()->editar('nao-existe', [], null, 'x'), 'Pedido não encontrado.');
    }

    public function test_editar_recalcula_o_frete_e_a_combinar_continua_a_combinar(): void
    {
        $v = $this->produtoDeTeste(['M' => 10], 100)['v'];
        $regra = ['valor' => 24.9, 'gratisAcima' => 299];
        $comFrete = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 1]], 'compra', ['regraFrete' => $regra]);
        $m = $this->itensDe($comFrete['id'])->first();
        $this->editarQuantidades($comFrete['id'], [$m->id => 3], $regra);
        $this->assertSame(0.0, (float) $this->pedido($comFrete['id'])->frete);
        $this->editarQuantidades($comFrete['id'], [$m->id => 1], $regra);
        $this->assertSame(24.9, (float) $this->pedido($comFrete['id'])->frete);
        $aCombinar = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 1]]);
        $this->editarQuantidades($aCombinar['id'], [$this->itensDe($aCombinar['id'])->first()->id => 2], $regra);
        $this->assertNull($this->pedido($aCombinar['id'])->frete);
    }

    public function test_troca_tamanho_e_cor_devolve_e_reserva_e_grava_a_copia_da_peca_nova(): void
    {
        $a = $this->produtoDeTeste(['M' => 5, 'G' => 5], 100);
        $b = $this->produtoDeTeste(['P' => 3], 120);
        $b['produto']->update(['cor' => 'Preto']);
        $p = $this->criarPedido([['varianteId' => $a['v']['M'], 'quantidade' => 1], ['varianteId' => $a['v']['G'], 'quantidade' => 2]], 'condicional');
        [$m, $g] = $this->itensDe($p['id'])->all();
        $this->pedidos()->editar($p['id'], [
            ['itemId' => $m->id, 'varianteId' => $b['v']['P'], 'quantidade' => 1, 'preco' => 120],
            ['itemId' => $g->id, 'varianteId' => $a['v']['M'], 'quantidade' => 2, 'preco' => 100],
        ], null, $this->vendedora->id, 'Cliente preferiu o preto');
        $this->assertSame(0, $this->variante($a['v']['G'])->reservado);
        $this->assertSame(2, $this->variante($a['v']['M'])->reservado);
        $this->assertSame(1, $this->variante($b['v']['P'])->reservado);
        $this->assertSame(
            [[$m->id, $b['ref'], 'P', 'Preto', 120.0], [$g->id, $a['ref'], 'M', null, 100.0]],
            $this->itensDe($p['id'])->map(fn ($i) => [$i->id, $i->referencia, $i->tamanho, $i->cor, (float) $i->precoTabela])->all(),
        );
        $this->assertSame(320.0, (float) $this->pedido($p['id'])->total);
    }

    public function test_inclui_peca_nova_com_desconto_e_a_venda_sai_pelo_preco_combinado(): void
    {
        $a = $this->produtoDeTeste(['M' => 5], 100);
        $b = $this->produtoDeTeste(['G' => 5], 50);
        $p = $this->criarPedido([['varianteId' => $a['v']['M'], 'quantidade' => 1]]);
        $m = $this->itensDe($p['id'])->first();
        $this->pedidos()->editar($p['id'], [['itemId' => $m->id, 'varianteId' => $a['v']['M'], 'quantidade' => 1, 'preco' => 89.9], ['varianteId' => $b['v']['G'], 'quantidade' => 2, 'preco' => 45]], null, $this->vendedora->id);
        $this->assertSame([[89.9, 100.0, 1], [45.0, 50.0, 2]], $this->itensDe($p['id'])->map(fn ($i) => [(float) $i->precoUnitario, (float) $i->precoTabela, $i->quantidade])->all());
        $this->assertEqualsWithDelta(179.9, (float) $this->pedido($p['id'])->total, 0.001);
        $this->pedidos()->confirmar($p['id'], [], $this->vendedora->id);
        $this->assertEqualsWithDelta(179.9, (float) Venda::query()->where('pedidoId', $p['id'])->value('valor'), 0.001);
    }

    public function test_editar_recusa_preco_invalido_peca_repetida_linha_de_outro_pedido_e_peca_inativa(): void
    {
        $a = $this->produtoDeTeste(['M' => 5, 'G' => 5]);
        $inativo = $this->produtoDeTeste(['M' => 5], ativo: false);
        $p = $this->criarPedido([['varianteId' => $a['v']['M'], 'quantidade' => 1]]);
        $outro = $this->criarPedido([['varianteId' => $a['v']['G'], 'quantidade' => 1]]);
        $m = $this->itensDe($p['id'])->first();
        $o = $this->itensDe($outro['id'])->first();
        $linha = ['itemId' => $m->id, 'varianteId' => $a['v']['M'], 'quantidade' => 1, 'preco' => 100];
        $editar = fn (array $linhas) => fn () => $this->pedidos()->editar($p['id'], $linhas, null, $this->vendedora->id);
        $this->falha($editar([[...$linha, 'preco' => -1]]), 'Preço inválido.');
        $this->falha($editar([$linha, ['varianteId' => $a['v']['M'], 'quantidade' => 1, 'preco' => 100]]), 'duas vezes');
        $this->falha($editar([[...$linha, 'itemId' => $o->id]]), 'mudou enquanto');
        $this->falha($editar([$linha, ['varianteId' => $inativo['v']['M'], 'quantidade' => 1, 'preco' => 100]]), 'não está mais no catálogo');
        $this->assertSame(1, PedidoHistorico::query()->where('pedidoId', $p['id'])->count());
    }

    // ---------- histórico ----------

    public function test_historico_guarda_o_pedido_cada_edicao_e_o_fechamento(): void
    {
        $a = $this->produtoDeTeste(['M' => 5, 'G' => 5], 100);
        $conta = User::factory()->create();
        $this->cliente->update(['userId' => $conta->id]);
        $p = $this->criarPedido([['varianteId' => $a['v']['M'], 'quantidade' => 1]], 'compra', ['usuarioId' => $conta->id]);
        $m = $this->itensDe($p['id'])->first();
        $this->pedidos()->editar($p['id'], [['itemId' => $m->id, 'varianteId' => $a['v']['G'], 'quantidade' => 2, 'preco' => 90]], null, $this->vendedora->id, 'Trocou para G');
        $this->pedidos()->confirmar($p['id'], [], $this->vendedora->id);

        $h = PedidoHistorico::query()->where('pedidoId', $p['id'])->orderBy('id')->get();
        $this->assertSame([['criado', 'cliente', null], ['editado', 'equipe', 'Ana Paula'], ['confirmado', 'equipe', 'Ana Paula']], $h->map(fn ($x) => [$x->acao->value, $x->autor, $x->nomeUsuario])->all());
        $this->assertSame([$a['ref'], 'M', 1, 100], [$h[0]->itens[0]['referencia'], $h[0]->itens[0]['tamanho'], $h[0]->itens[0]['quantidade'], $h[0]->itens[0]['preco']]);
        $nome = "Produto de teste {$a['ref']}";
        $this->assertSame("Trocou {$nome} · tam. M por {$nome} · tam. G", $h[1]->mudancas[0]);
        $this->assertSame("{$nome} · tam. G: quantidade de 1 para 2", $h[1]->mudancas[1]);
        $this->assertMatchesRegularExpression('/preço de R\$\s100,00 para R\$\s90,00/u', $h[1]->mudancas[2]);
        $this->assertMatchesRegularExpression('/Total das peças de R\$\s100,00 para R\$\s180,00/u', $h[1]->mudancas[3]);
        $this->assertSame('Trocou para G', $h[1]->observacao);
        $this->assertSame(['G', 2, 90, 100], [$h[1]->itens[0]['tamanho'], $h[1]->itens[0]['quantidade'], $h[1]->itens[0]['preco'], $h[1]->itens[0]['precoTabela']]);
        $this->assertMatchesRegularExpression('/Venda de R\$\s180,00/u', $h[2]->mudancas[0]);
    }

    public function test_pedido_antigo_ganha_o_retrato_inicial_e_expiracao_registra_como_sistema(): void
    {
        $v = $this->produtoDeTeste(['M' => 5])['v'];
        $p = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 1]], 'condicional');
        PedidoHistorico::query()->where('pedidoId', $p['id'])->delete();
        $this->pedidos()->cancelar($p['id'], 'expirado');
        $h = PedidoHistorico::query()->where('pedidoId', $p['id'])->orderBy('id')->get();
        $this->assertSame([['criado', 'sistema'], ['cancelado', 'sistema']], $h->map(fn ($x) => [$x->acao->value, $x->autor])->all());
        $this->assertSame(['Cancelado por prazo vencido'], $h[1]->mudancas);
    }

    // ---------- desfazer venda ----------

    public function test_desfazer_venda_devolve_ao_estoque_tira_a_venda_e_registra(): void
    {
        $v = $this->produtoDeTeste(['M' => 5, 'G' => 5], 100)['v'];
        $p = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 2], ['varianteId' => $v['G'], 'quantidade' => 1]], 'condicional');
        [$m, $g] = $this->itensDe($p['id'])->all();
        $this->pedidos()->confirmar($p['id'], [$m->id => 1, $g->id => 1], $this->vendedora->id); // ficou 1 M e 1 G
        $this->assertSame([4, 4], [$this->variante($v['M'])->estoque, $this->variante($v['G'])->estoque]);

        $this->pedidos()->desfazerVenda($p['id'], $this->vendedora->id, 'Cliente devolveu as peças');
        $this->assertSame([5, 5], [$this->variante($v['M'])->estoque, $this->variante($v['G'])->estoque]);
        $this->assertSame([0, 0], [$this->variante($v['M'])->reservado, $this->variante($v['G'])->reservado]);
        $this->assertFalse(Venda::query()->where('pedidoId', $p['id'])->exists());
        $ped = $this->pedido($p['id']);
        $this->assertSame(['cancelado', 'equipe'], [$ped->status->value, $ped->motivoCancelamento]);
        $this->assertSame([1, 1], MovimentoEstoque::query()->where('pedidoId', $p['id'])->where('motivo', 'estorno')->pluck('delta')->all());
        $h = PedidoHistorico::query()->where('pedidoId', $p['id'])->where('acao', 'cancelado')->first();
        $this->assertSame(['equipe', 'Cliente devolveu as peças'], [$h->autor, $h->observacao]);
        $this->assertSame('Venda desfeita: 2 peças voltaram ao estoque', $h->mudancas[0]);
        $this->assertMatchesRegularExpression('/Venda de R\$\s200,00 removida/u', $h->mudancas[1]);
        $this->falha(fn () => $this->pedidos()->desfazerVenda($p['id'], $this->vendedora->id, 'De novo'), 'Este pedido já foi cancelado.');
    }

    public function test_pedido_em_aberto_nao_tem_venda_para_desfazer(): void
    {
        $v = $this->produtoDeTeste(['M' => 5])['v'];
        $p = $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 1]]);
        $this->falha(fn () => $this->pedidos()->desfazerVenda($p['id'], $this->vendedora->id, 'x'), 'Este pedido ainda está em aberto.');
        $this->assertTrue(Produto::query()->exists());
    }
}
