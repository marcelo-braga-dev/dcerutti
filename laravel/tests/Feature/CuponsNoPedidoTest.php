<?php

namespace Tests\Feature;

use App\Exceptions\ErroNegocio;
use App\Models\Cliente;
use App\Models\Cupom;
use App\Models\Pedido;
use App\Models\PedidoHistorico;
use App\Models\Venda;
use App\Services\Config;
use App\Services\Cupons\AvaliadorDeCupom;
use Closure;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\Concerns\MundoDeTeste;
use Tests\TestCase;

/**
 * Cupom dentro do pedido e campanhas (porta das partes "cupom no pedido", "campanhas" e "venda desfeita com cupom" de
 * tests/integracao/cupons.test.ts). Cadastro, lista e telas do cupom vêm com a fase 5.
 */
class CuponsNoPedidoTest extends TestCase
{
    use MundoDeTeste, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->criarMundo();
    }

    private function falha(Closure $fn, string $padrao): void
    {
        try {
            $fn();
            $this->fail("devia recusar com: {$padrao}");
        } catch (ErroNegocio $e) {
            $this->assertMatchesRegularExpression($padrao, $e->getMessage());
        }
    }

    /** @param array<string, mixed> $o */
    private function cupom(array $o = []): Cupom
    {
        return Cupom::query()->create(['codigo' => 'T'.Str::upper(Str::random(8)), 'tipo' => 'percentual', 'valor' => 10, 'limitePorCliente' => null, 'inicioEm' => now()->subMinute(), ...$o])->fresh();
    }

    /**
     * Pedido com uma peça por preço (padrão: 100 e 200).
     *
     * @param  list<float>  $precos
     * @return array<string, mixed>
     */
    private function pedidoCom(?string $cupom = null, string $tipo = 'compra', array $precos = [100, 200], ?array $regraFrete = null, string $quem = 'cliente', ?Cliente $cliente = null): array
    {
        $linhas = array_map(fn ($preco) => ['varianteId' => $this->produtoDeTeste(['M' => 5], $preco)['v']['M'], 'quantidade' => 1], $precos);
        $cli = $cliente ?? $this->cliente;

        return $this->pedidos()->criar([
            'tipo' => $tipo, 'origem' => 'loja', 'clienteId' => $cli->id, 'vendedorId' => $cli->vendedorId, 'nomeCliente' => $cli->nome, 'telefoneCliente' => $cli->telefone,
            'cep' => $tipo === 'condicional' ? '89874-000' : null, 'linhas' => $linhas, 'regraFrete' => $regraFrete,
            'cupom' => $cupom ? ['codigo' => $cupom, 'quem' => $quem] : null,
        ]);
    }

    private function editar(string $pedidoId, array $linhas): void
    {
        $this->pedidos()->editar($pedidoId, $linhas, null, $this->vendedora->id);
    }

    // ---------- cupom no pedido ----------

    public function test_aplica_ao_criar_desconto_por_peca_total_historico_e_venda(): void
    {
        $c = $this->cupom();
        $p = $this->pedidoCom(strtolower($c->codigo));
        $this->assertSame(['codigo' => $c->codigo, 'desconto' => 30.0, 'freteGratis' => false], $p['cupom']);
        $ped = $this->pedido($p['id']);
        $this->assertSame([$c->id, 30.0, 270.0], [$ped->cupomId, (float) $ped->descontoCupom, (float) $ped->total]);
        $this->assertSame([10.0, 20.0], $this->itensDe($p['id'])->map(fn ($i) => (float) $i->descontoCupom)->all());
        $criado = PedidoHistorico::query()->where('pedidoId', $p['id'])->where('acao', 'criado')->first();
        $this->assertMatchesRegularExpression("/Cupom {$c->codigo} aplicado \\(−R\\$\\s30,00\\)/u", $criado->mudancas[0]);
        $this->pedidos()->confirmar($p['id'], [], $this->vendedora->id);
        $this->assertSame(270.0, (float) Venda::query()->where('pedidoId', $p['id'])->value('valor'));
    }

    public function test_recusado_nao_grava_o_pedido_e_o_motivo_sobe(): void
    {
        $c = $this->cupom(['minimoCompra' => 1000]);
        $antes = Pedido::query()->count();
        $this->falha(fn () => $this->pedidoCom($c->codigo), '/Faltam R\$\s700,00/u');
        $this->falha(fn () => $this->pedidoCom('NAOEXISTE999'), '/Cupom não encontrado\./');
        $s = $this->cupom(['quemAplica' => 'equipe']);
        $this->falha(fn () => $this->pedidoCom($s->codigo), '/vendedor/');
        $this->assertSame($antes, Pedido::query()->count());
    }

    public function test_limite_total_esgota_e_cancelar_devolve_o_uso(): void
    {
        $c = $this->cupom(['limiteTotal' => 1]);
        $ok = $this->pedidoCom($c->codigo, precos: [100]);
        $this->falha(fn () => $this->pedidoCom($c->codigo, precos: [100]), '/Este cupom esgotou\./');
        $this->pedidos()->cancelar($ok['id'], 'equipe');
        $this->assertSame($c->codigo, $this->pedidoCom($c->codigo, precos: [100])['cupom']['codigo']);
    }

    public function test_limite_por_cliente_vale_entre_fichas_com_o_mesmo_telefone(): void
    {
        $c = $this->cupom(['limitePorCliente' => 1]);
        $this->pedidoCom($c->codigo, precos: [100]);
        $outra = Cliente::query()->create(['nome' => 'Juliana (outra ficha)', 'telefone' => $this->cliente->telefone, 'vendedorId' => $this->cliente->vendedorId]);
        $this->falha(fn () => $this->pedidoCom($c->codigo, precos: [100], cliente: $outra), '/já foi usado/');
    }

    public function test_frete_gratis_zera_com_regra_e_a_combinar_e_condicional_recusa(): void
    {
        $c = $this->cupom(['tipo' => 'freteGratis', 'valor' => null]);
        $comRegra = $this->pedido($this->pedidoCom($c->codigo, precos: [100], regraFrete: ['valor' => 24.9, 'gratisAcima' => 500])['id']);
        $this->assertTrue($comRegra->freteCupom);
        $this->assertSame([0.0, 100.0], [(float) $comRegra->frete, (float) $comRegra->total]);
        $this->assertSame(0.0, (float) $this->pedido($this->pedidoCom($c->codigo, precos: [100])['id'])->frete);
        $this->falha(fn () => $this->pedidoCom($c->codigo, 'condicional'), '/entrega/');
    }

    public function test_edicao_recalcula_soma_com_o_desconto_do_vendedor_e_retira_o_que_deixou_de_valer(): void
    {
        $c = $this->cupom(['minimoCompra' => 250]);
        $p = $this->pedidoCom($c->codigo);
        [$a, $b] = $this->itensDe($p['id'])->all();
        // Vendedora dá R$ 20 na segunda peça: o cupom (10%) passa a valer sobre 280.
        $this->editar($p['id'], [['itemId' => $a->id, 'varianteId' => $a->varianteId, 'quantidade' => 1, 'preco' => 100], ['itemId' => $b->id, 'varianteId' => $b->varianteId, 'quantidade' => 1, 'preco' => 180]]);
        $ped = $this->pedido($p['id']);
        $this->assertSame([28.0, 252.0], [(float) $ped->descontoCupom, (float) $ped->total]);
        // Retira a primeira: 180 fica abaixo do mínimo de 250 e o cupom sai, com o motivo no histórico.
        $this->editar($p['id'], [['itemId' => $b->id, 'varianteId' => $b->varianteId, 'quantidade' => 1, 'preco' => 180]]);
        $ped = $this->pedido($p['id']);
        $this->assertSame([null, null, 0.0, 180.0], [$ped->cupomId, $ped->codigoCupom, (float) $ped->descontoCupom, (float) $ped->total]);
        $h = PedidoHistorico::query()->where('pedidoId', $p['id'])->where('acao', 'editado')->latest('id')->first();
        $this->assertNotEmpty(array_filter($h->mudancas, fn ($m) => str_starts_with($m, "Cupom {$c->codigo} retirado: Faltam")));
    }

    public function test_cupom_que_venceu_depois_continua_na_edicao(): void
    {
        $c = $this->cupom();
        $p = $this->pedidoCom($c->codigo);
        $c->update(['ativo' => false, 'fimEm' => now()->subSecond()]);
        [$a, $b] = $this->itensDe($p['id'])->all();
        $this->editar($p['id'], [['itemId' => $a->id, 'varianteId' => $a->varianteId, 'quantidade' => 2, 'preco' => 100], ['itemId' => $b->id, 'varianteId' => $b->varianteId, 'quantidade' => 1, 'preco' => 200]]);
        $ped = $this->pedido($p['id']);
        $this->assertSame([$c->id, 40.0], [$ped->cupomId, (float) $ped->descontoCupom]);
    }

    public function test_condicional_fechado_em_parte_cupom_sobre_o_que_ficou_e_sai_abaixo_do_minimo(): void
    {
        $c = $this->cupom();
        $p = $this->pedidoCom($c->codigo, 'condicional');
        [$a, $b] = $this->itensDe($p['id'])->all();
        $this->pedidos()->confirmar($p['id'], [$a->id => 0, $b->id => 1], $this->vendedora->id);
        $this->assertSame(180.0, (float) Venda::query()->where('pedidoId', $p['id'])->value('valor'));
        $this->assertSame([['devolvido', 0.0], ['vendido', 20.0]], $this->itensDe($p['id'])->map(fn ($i) => [$i->situacao->value, (float) $i->descontoCupom])->all());

        $m = $this->cupom(['minimoCompra' => 250]);
        $q = $this->pedidoCom($m->codigo, 'condicional');
        [$x, $y] = $this->itensDe($q['id'])->all();
        $this->pedidos()->confirmar($q['id'], [$x->id => 0, $y->id => 1], $this->vendedora->id);
        $this->assertSame(200.0, (float) Venda::query()->where('pedidoId', $q['id'])->value('valor'));
        $this->assertNull($this->pedido($q['id'])->cupomId);
        $h = PedidoHistorico::query()->where('pedidoId', $q['id'])->where('acao', 'confirmado')->first();
        $this->assertNotEmpty(array_filter($h->mudancas, fn ($s) => str_contains($s, 'retirado: Faltam')));
    }

    // ---------- campanhas ----------

    private function ligar(array $proxima = []): void
    {
        app(Config::class)->salvar([
            'cupons' => ['ligados' => true, 'vendedorAplica' => true],
            'proximaCompra' => ['minimoParaGerar' => 150, 'diasParaComecar' => 1, 'diasValidade' => 60, 'geraComCupom' => false, 'acumula' => false, ...$proxima],
        ]);
        Cupom::query()->firstOrCreate(['codigo' => 'MODELO-PROXIMA-COMPRA'], ['tipo' => 'percentual', 'valor' => 10, 'tetoDesconto' => 50, 'origem' => 'proximaCompra', 'modelo' => true, 'ativo' => true, 'inicioEm' => now()->subDay()]);
    }

    private function clienteNova(int $diasDesdeCadastro = 0): Cliente
    {
        static $n = 0;
        $n++;

        return Cliente::query()->create(['nome' => "Cliente Nova {$n}", 'telefone' => sprintf('(49) 97%03d-%04d', 100 + $n, random_int(0, 9999)), 'vendedorId' => $this->vendedora->id, 'criadoEm' => now()->subDays($diasDesdeCadastro)]);
    }

    private function confirmar(string $pedidoId): array
    {
        return $this->pedidos()->confirmar($pedidoId, [], $this->vendedora->id);
    }

    public function test_o_modelo_da_proxima_compra_nunca_e_aplicado(): void
    {
        $this->ligar();
        $this->falha(fn () => $this->pedidoCom('MODELO-PROXIMA-COMPRA', precos: [100], cliente: $this->clienteNova()), '/Cupom não encontrado\./');
    }

    public function test_primeira_compra_so_para_quem_nunca_comprou_dentro_do_prazo(): void
    {
        $this->ligar();
        $primeira = $this->cupom(['origem' => 'primeiraCompra', 'somentePrimeiraCompra' => true, 'limitePorCliente' => 1, 'diasAposCadastro' => 30]);
        $nova = $this->clienteNova();
        $p = $this->pedidoCom($primeira->codigo, precos: [100], cliente: $nova);
        $this->assertSame(10.0, $p['cupom']['desconto']);
        $this->confirmar($p['id']);
        $this->falha(fn () => $this->pedidoCom($primeira->codigo, precos: [100], cliente: $nova), '/(primeira compra|já foi usado)/');
        $gemea = Cliente::query()->create(['nome' => 'Gêmea', 'telefone' => $nova->telefone, 'vendedorId' => $nova->vendedorId]);
        $this->falha(fn () => $this->pedidoCom($primeira->codigo, precos: [100], cliente: $gemea), '/(primeira compra|já foi usado)/');
        $this->falha(fn () => $this->pedidoCom($primeira->codigo, precos: [100], cliente: $this->clienteNova(45)), '/venceu em/');
    }

    public function test_proxima_compra_gera_acima_do_minimo_e_nao_gera_abaixo_com_cupom_nem_acumulando(): void
    {
        $this->ligar();
        $nova = $this->clienteNova();
        $this->assertNull($this->confirmar($this->pedidoCom(precos: [100], cliente: $nova)['id'])['cupomGerado']);

        $grande = $this->pedidoCom(precos: [200], cliente: $nova);
        $gerado = $this->confirmar($grande['id'])['cupomGerado'];
        $this->assertMatchesRegularExpression('/^VOLTA-[A-Z2-9]{6}$/', $gerado['codigo']);
        $this->assertMatchesRegularExpression('/^10% de desconto \(até R\$\s50,00\)/u', $gerado['regra']);
        $c = Cupom::query()->with('clientes')->where('codigo', $gerado['codigo'])->first();
        $this->assertSame(['proximaCompra', false, 1, 1, $grande['id']], [$c->origem->value, $c->modelo, $c->limiteTotal, $c->limitePorCliente, $c->pedidoOrigemId]);
        $this->assertSame([$nova->id], $c->clientes->pluck('clienteId')->all());
        $this->assertTrue($c->inicioEm->isFuture());
        $this->assertEqualsWithDelta(61, $c->inicioEm->diffInSeconds($c->fimEm) / 86400, 0.5);
        $h = PedidoHistorico::query()->where('pedidoId', $grande['id'])->where('acao', 'confirmado')->first();
        $this->assertNotEmpty(array_filter($h->mudancas, fn ($s) => str_starts_with($s, 'Cupom de próxima compra gerado: VOLTA-')));

        // Sem acumular: outra venda grande não gera enquanto o primeiro não foi usado.
        $this->assertNull($this->confirmar($this->pedidoCom(precos: [300], cliente: $nova)['id'])['cupomGerado']);
        // Já valendo: só a dona usa, uma vez; venda com cupom não gera outro (padrão).
        $c->update(['inicioEm' => now()->subSecond()]);
        $this->falha(fn () => $this->pedidoCom($c->codigo, precos: [200], cliente: $this->clienteNova()), '/não está disponível para esta cliente/');
        $comCupom = $this->pedidoCom($c->codigo, precos: [200], cliente: $nova);
        $this->assertSame(20.0, $comCupom['cupom']['desconto']);
        $this->assertNull($this->confirmar($comCupom['id'])['cupomGerado']);
        $this->falha(fn () => $this->pedidoCom($c->codigo, precos: [200], cliente: $nova), '/(esgotou|já foi usado)/');

        // Acumulando e gerando com cupom: gera.
        $this->ligar(['acumula' => true, 'geraComCupom' => true]);
        $this->assertNotNull($this->confirmar($this->pedidoCom(precos: [200], cliente: $nova)['id'])['cupomGerado']);
    }

    public function test_venda_desfeita_libera_o_uso_e_desativa_o_cupom_gerado(): void
    {
        $this->ligar(['minimoParaGerar' => 0, 'diasParaComecar' => 0, 'diasValidade' => 30, 'geraComCupom' => true, 'acumula' => true]);
        $c = $this->cupom(['limiteTotal' => 1]);
        $p = $this->pedidoCom($c->codigo, precos: [100]);
        $gerado = $this->confirmar($p['id'])['cupomGerado'];
        $this->pedidos()->desfazerVenda($p['id'], $this->vendedora->id, 'Venda registrada por engano');
        $this->assertNotNull($gerado);
        $this->assertFalse(Cupom::query()->where('codigo', $gerado['codigo'])->value('ativo'));
        $this->assertSame($c->codigo, $this->pedidoCom($c->codigo, precos: [100])['cupom']['codigo']);
    }

    // ---------- regra pura ----------

    public function test_desconto_distribuido_soma_exatamente_o_total(): void
    {
        $r = AvaliadorDeCupom::avaliar(
            ['codigo' => 'X', 'tipo' => 'valor', 'valor' => 10, 'tetoDesconto' => null, 'minimoCompra' => null, 'inicioEm' => now()->subDay(), 'fimEm' => null, 'limiteTotal' => null, 'limitePorCliente' => null,
                'somentePrimeiraCompra' => false, 'valePromocao' => false, 'quemAplica' => 'ambos', 'ativo' => true, 'categorias' => [], 'marcas' => [], 'produtos' => [], 'clientes' => []],
            array_map(fn ($k) => ['chave' => $k, 'produtoId' => $k, 'categoriaId' => 1, 'marcaId' => 1, 'emPromocao' => false, 'preco' => 33.33, 'quantidade' => 1], [1, 2, 3]),
            ['agora' => now(), 'quem' => 'cliente', 'clienteId' => 'c', 'usosTotal' => 0, 'usosCliente' => 0, 'jaComprou' => false, 'tipoPedido' => 'compra'],
        );
        $this->assertTrue($r['ok']);
        $this->assertSame(1000, (int) round(array_sum(array_column($r['descontos'], 'valor')) * 100));
    }
}
