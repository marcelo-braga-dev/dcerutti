<?php

namespace Tests\Feature;

use App\Exceptions\ErroPagamento;
use App\Models\Cliente;
use App\Models\Cobranca;
use App\Models\EventoPagamento;
use App\Models\Notificacao;
use App\Models\Pedido;
use App\Models\PedidoHistorico;
use App\Models\User;
use App\Models\Variante;
use App\Models\Venda;
use App\Queries\Pagamentos;
use App\Services\Config;
use App\Services\Pagamentos\Assinatura;
use App\Services\Pagamentos\Cobrancas;
use App\Services\Pagamentos\GatewayFalso;
use App\Services\Pagamentos\Modo;
use App\Support\Links;
use App\Support\Pagamento;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia;
use Tests\Concerns\MundoDeTeste;
use Tests\TestCase;

/** Pagamento online (porta de tests/integracao/pagamentos.test.ts) com o Mercado Pago simulado. */
class PagamentosTest extends TestCase
{
    use MundoDeTeste, RefreshDatabase;

    private const SITE = 'https://teste.dcerutti.local';

    private const PADRAO = ['ligado' => true, 'pix' => true, 'cartao' => true, 'pagarNaSacola' => false, 'confirmarAoPagar' => true, 'minutosPix' => 30, 'minutosCheckout' => 60, 'parcelasMax' => 6, 'parcelasSemJuros' => 1, 'quemEstorna' => 'gestor'];

    private int $seq = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->criarMundo();
        $this->withoutDefer();
        $this->cfg();
        $this->falso()->limpar();
        $this->falso()->falharProxima = null;
    }

    private function cfg(array $mudar = []): void
    {
        app(Config::class)->salvar(['pagamentoOnline' => [...self::PADRAO, ...$mudar]]);
    }

    private function falso(): GatewayFalso
    {
        return app(GatewayFalso::class);
    }

    private function servico(): Cobrancas
    {
        return app(Cobrancas::class);
    }

    /** Compra pendente com frete definido (padrão R$ 10) de 1 peça de R$ 100. @return array{p: Pedido, v: int, c: Cliente} */
    private function compra(array $o = []): array
    {
        $email = array_key_exists('email', $o) ? $o['email'] : 'pg'.(++$this->seq).'@exemplo.com';
        $c = Cliente::query()->create(['nome' => 'Cliente Pagamento '.(++$this->seq), 'telefone' => '(49) 99'.str_pad((string) $this->seq, 3, '0', STR_PAD_LEFT).'-1234', 'email' => $email, 'vendedorId' => $this->vendedora->id]);
        $t = $this->produtoDeTeste(['M' => $o['estoque'] ?? 3], 100);
        $tipo = $o['tipo'] ?? 'compra';
        $frete = array_key_exists('frete', $o) ? $o['frete'] : 10;
        $r = $this->pedidos()->criar([
            'tipo' => $tipo, 'origem' => 'loja', 'clienteId' => $c->id, 'vendedorId' => $c->vendedorId, 'nomeCliente' => $c->nome, 'telefoneCliente' => $c->telefone,
            'cep' => $tipo === 'condicional' ? '89874-000' : null, 'linhas' => [['varianteId' => $t['v']['M'], 'quantidade' => $o['quantidade'] ?? 1]],
            'regraFrete' => $frete === null || $tipo === 'condicional' ? null : ['valor' => $frete, 'gratisAcima' => 0],
        ]);

        return ['p' => Pedido::query()->find($r['id']), 'v' => $t['v']['M'], 'c' => $c];
    }

    private function criar(Pedido $p, string $metodo = 'pix', ?string $email = null): array
    {
        return $this->servico()->criar($p->id, $metodo, null, $email, self::SITE);
    }

    private function cobrancas(Pedido $p)
    {
        return Cobranca::query()->where('pedidoId', $p->id)->orderBy('criadaEm')->orderBy('id')->get();
    }

    /** Aviso como o Mercado Pago manda: query data.id e type, cabeçalhos assinados. */
    private function avisar(string $orderId, ?string $requestId = null, string $segredo = 'segredo-de-teste'): TestResponse
    {
        $requestId ??= 'req-'.(++$this->seq);

        return $this->call('POST', "/api/pagamentos/mercadopago?data.id={$orderId}&type=order", [], [], [], [
            'CONTENT_TYPE' => 'application/json', 'HTTP_X_REQUEST_ID' => $requestId, 'HTTP_X_SIGNATURE' => Assinatura::assinar($segredo, $orderId, $requestId),
        ], json_encode(['action' => 'order.processed', 'type' => 'order', 'data' => ['id' => $orderId]]));
    }

    private function estornar(User $u, Cobranca $c, string $motivo, ?string $valor = null): TestResponse
    {
        return $this->actingAs($u)->post("/painel/cobrancas/{$c->id}/estornar", ['motivo' => $motivo, 'valor' => $valor]);
    }

    public function test_pix_valor_do_banco_reserva_e_pedido_aguardando(): void
    {
        ['p' => $p, 'v' => $v] = $this->compra(['frete' => 15]);
        $c = $this->criar($p);
        $this->assertSame(['pix', 'pendente', 115.0, false], [$c['metodo'], $c['status'], $c['valor'], $c['reaproveitada']]);
        $this->assertNotEmpty($c['pixCopiaECola']);
        $salva = $this->cobrancas($p)->first();
        $this->assertTrue($salva->reservou);
        $this->assertStringStartsWith('ORD', $salva->mpOrderId);
        $this->assertSame(1, $this->variante($v)->reservado);
        $this->assertSame('aguardando', $p->refresh()->pagamentoSituacao->value);
        $order = $this->falso()->consultar($salva->mpOrderId);
        $this->assertSame([$salva->id, 115.0], [$order->referencia, $order->valorTotal]);
    }

    public function test_reaproveita_o_pix_e_trocar_de_meio_cancela_o_anterior_sem_soltar_a_reserva(): void
    {
        ['p' => $p, 'v' => $v] = $this->compra();
        $a = $this->criar($p);
        $b = $this->criar($p);
        $this->assertSame([$a['id'], true], [$b['id'], $b['reaproveitada']]);
        $cartao = $this->criar($p, 'checkout');
        $this->assertStringContainsString('checkout', $cartao['checkoutUrl']);
        $lista = $this->cobrancas($p);
        $this->assertSame([['pix', 'cancelada', false], ['checkout', 'pendente', true]], $lista->map(fn ($x) => [$x->metodo->value, $x->status->value, $x->reservou])->all());
        $this->assertSame(1, $this->variante($v)->reservado);
        $this->assertSame('canceled', $this->falso()->consultar($lista[0]->mpOrderId)->status);
    }

    public function test_frete_a_combinar_bloqueia_e_a_equipe_libera(): void
    {
        ['p' => $p] = $this->compra(['frete' => null]);
        try {
            $this->criar($p);
            $this->fail('devia recusar');
        } catch (ErroPagamento $e) {
            $this->assertStringContainsString('frete', $e->getMessage());
        }
        $this->actingAs($this->vendedora)->postJson("/painel/pedidos/{$p->id}/pagamento/link")->assertJson(['ok' => false, 'precisaFrete' => true]);
        $this->post("/painel/pedidos/{$p->id}/frete", ['frete' => 'abc'])->assertSessionHasErrors('erro');
        $this->post("/painel/pedidos/{$p->id}/frete", ['frete' => '0'])->assertSessionHasNoErrors();
        $r = $this->postJson("/painel/pedidos/{$p->id}/pagamento/link")->json();
        $this->assertTrue($r['ok']);
        $this->assertSame(rtrim(config('app.url'), '/').'/pagar/'.Links::chaveDoPagamento($p->codigo), $r['link']);
        $this->assertEquals(100, $r['valor']);
        $this->assertTrue(PedidoHistorico::query()->where('pedidoId', $p->id)->where('acao', 'editado')->get()->contains(fn ($h) => str_contains(json_encode($h->mudancas, JSON_UNESCAPED_UNICODE), 'Frete de a combinar')));
    }

    public function test_peca_esgotada_falha_no_mp_sem_email_e_desligado(): void
    {
        ['p' => $p, 'v' => $v] = $this->compra(['estoque' => 1]);
        Variante::query()->whereKey($v)->update(['estoque' => 0]);
        $this->assertErro(fn () => $this->criar($p), 'acabou');
        $this->assertCount(0, $this->cobrancas($p));

        ['p' => $p2, 'v' => $v2] = $this->compra();
        $this->falso()->falharProxima = 'Mercado Pago fora do ar';
        $this->assertErro(fn () => $this->criar($p2), 'Não foi possível gerar');
        $this->assertSame([['cancelada', false]], $this->cobrancas($p2)->map(fn ($c) => [$c->status->value, $c->reservou])->all());
        $this->assertSame(0, $this->variante($v2)->reservado);
        $this->assertSame(1, EventoPagamento::query()->where('tipo', 'falha_criar')->whereIn('cobrancaId', $this->cobrancas($p2)->pluck('id'))->count());

        ['p' => $p3, 'v' => $v3] = $this->compra(['email' => null]);
        $this->assertErro(fn () => $this->criar($p3), 'e-mail');
        $this->assertSame(0, $this->variante($v3)->reservado);
        $this->assertSame('pendente', $this->criar($p3, 'pix', 'informado@exemplo.com')['status']);

        $this->cfg(['ligado' => false]);
        ['p' => $p4] = $this->compra();
        $this->assertErro(fn () => $this->criar($p4), 'desligado');
    }

    private function assertErro(\Closure $fn, string $trecho): void
    {
        try {
            $fn();
            $this->fail("devia recusar ({$trecho})");
        } catch (ErroPagamento $e) {
            $this->assertStringContainsString($trecho, $e->getMessage());
        }
    }

    public function test_aprovado_pelo_aviso_confirma_baixa_com_a_reserva_e_avisa(): void
    {
        ['p' => $p, 'v' => $v] = $this->compra();
        $c = $this->criar($p);
        $salva = $this->cobrancas($p)->first();
        $this->falso()->simularPagamento($salva->mpOrderId, ['meio' => 'pix', 'tipoMeio' => 'bank_transfer', 'taxa' => 1.09]);
        $this->avisar($salva->mpOrderId, 'req-aprovado-1')->assertOk();
        $depois = Cobranca::query()->find($c['id']);
        $this->assertSame(['aprovada', false, 'pix'], [$depois->status->value, $depois->reservou, $depois->meio]);
        $this->assertEquals(1.09, (float) $depois->taxa);
        $p->refresh()->load('venda', 'pagamentos');
        $this->assertSame(['confirmado', 'pago'], [$p->status->value, $p->pagamentoSituacao->value]);
        $this->assertEquals(100, (float) $p->venda->valor);
        $this->assertEquals([['pix', 110.0, $c['id']]], $p->pagamentos->map(fn ($g) => [$g->forma->value, (float) $g->valor, $g->cobrancaId])->all());
        $vv = $this->variante($v);
        $this->assertSame([2, 0], [$vv->estoque, $vv->reservado]);
        $this->assertSame(1, Notificacao::query()->where('usuarioId', $this->vendedora->id)->where('tipo', 'pagamento_aprovado')->where('chave', "pago:{$c['id']}")->count());

        $this->avisar($salva->mpOrderId, 'req-aprovado-1')->assertJson(['repetido' => true]);
        $this->avisar($salva->mpOrderId)->assertOk();
        $this->assertSame(1, \App\Models\Pagamento::query()->where('cobrancaId', $c['id'])->count());
        $this->assertSame(1, Venda::query()->where('pedidoId', $p->id)->count());
    }

    public function test_assinatura_errada_401_e_sem_segredo_503(): void
    {
        ['p' => $p] = $this->compra();
        $this->criar($p);
        $salva = $this->cobrancas($p)->first();
        $this->falso()->simularPagamento($salva->mpOrderId);
        $this->avisar($salva->mpOrderId, 'req-falso', 'outro-segredo')->assertStatus(401);
        $this->postJson("/api/pagamentos/mercadopago?data.id={$salva->mpOrderId}&type=order", [])->assertStatus(401);
        $this->assertSame('pendente', $salva->refresh()->status->value);
        $this->assertSame(0, EventoPagamento::query()->where('requestId', 'req-falso')->count());
        config(['services.pagamento.segredo' => null]);
        $this->avisar($salva->mpOrderId, 'req-sem', 'x')->assertStatus(503);
    }

    public function test_cartao_parcelado_e_confirmar_ao_pagar_desligado(): void
    {
        ['p' => $p] = $this->compra();
        $this->criar($p, 'checkout');
        $salva = $this->cobrancas($p)->first();
        $this->falso()->simularPagamento($salva->mpOrderId, ['meio' => 'master', 'tipoMeio' => 'credit_card', 'parcelas' => 3]);
        $this->avisar($salva->mpOrderId);
        $this->assertSame([['credito', 3]], $p->pagamentos()->get()->map(fn ($g) => [$g->forma->value, $g->parcelas])->all());

        $this->cfg(['confirmarAoPagar' => false]);
        ['p' => $q, 'v' => $v] = $this->compra();
        $this->criar($q);
        $c = $this->cobrancas($q)->first();
        $this->falso()->simularPagamento($c->mpOrderId);
        $this->avisar($c->mpOrderId);
        $q->refresh();
        $this->assertSame(['pendente', 'pago'], [$q->status->value, $q->pagamentoSituacao->value]);
        $this->assertSame(1, $this->variante($v)->reservado);
        $this->pedidos()->confirmar($q->id, [], $this->vendedora->id);
        $vv = $this->variante($v);
        $this->assertSame([2, 0], [$vv->estoque, $vv->reservado]);
        $this->assertFalse($c->refresh()->reservou);
    }

    public function test_valor_ou_referencia_divergente_nao_muda_e_avisa_o_gestor(): void
    {
        ['p' => $p] = $this->compra();
        $this->criar($p);
        $salva = $this->cobrancas($p)->first();
        $this->falso()->simularPagamento($salva->mpOrderId, ['total' => 1]);
        $this->avisar($salva->mpOrderId);
        $this->assertSame('pendente', $salva->refresh()->status->value);
        $this->assertSame(['pendente', 'aguardando'], [$p->refresh()->status->value, $p->pagamentoSituacao->value]);
        $this->assertGreaterThan(0, Notificacao::query()->where('usuarioId', $this->gestora->id)->where('tipo', 'pagamento_problema')->where('link', "/painel/pedidos/{$p->id}")->count());
        $s = $this->falso()->consultar($salva->mpOrderId);
        $s->valorTotal = 110;
        $s->referencia = 'outra-cobranca';
        $this->servico()->aplicarSituacao($salva->id, $s, 'teste');
        $this->assertSame('pendente', $salva->refresh()->status->value);
        $this->assertSame(2, EventoPagamento::query()->where('cobrancaId', $salva->id)->where('tipo', 'like', 'divergencia%')->count());
    }

    public function test_pago_depois_de_vencer_reserva_de_novo_ou_fica_sem_estoque(): void
    {
        ['p' => $a, 'v' => $va] = $this->compra(['estoque' => 1]);
        $this->criar($a);
        $ca = $this->cobrancas($a)->first();
        $this->falso()->simularSituacao($ca->mpOrderId, 'failed', 'expired');
        $this->avisar($ca->mpOrderId);
        $this->assertSame('expirada', $ca->refresh()->status->value);
        $this->assertSame(0, $this->variante($va)->reservado);
        $this->falso()->simularPagamento($ca->mpOrderId);
        $this->avisar($ca->mpOrderId);
        $this->assertSame(['confirmado', 'pago'], [$a->refresh()->status->value, $a->pagamentoSituacao->value]);

        ['p' => $b, 'v' => $vb] = $this->compra(['estoque' => 1]);
        $this->criar($b);
        $cb = $this->cobrancas($b)->first();
        $this->falso()->simularSituacao($cb->mpOrderId, 'failed', 'expired');
        $this->avisar($cb->mpOrderId);
        Variante::query()->whereKey($vb)->update(['estoque' => 0]);
        $this->falso()->simularPagamento($cb->mpOrderId);
        $this->avisar($cb->mpOrderId);
        $cb->refresh();
        $this->assertSame(['aprovada', true, false], [$cb->status->value, $cb->semEstoque, $cb->reservou]);
        $this->assertSame(['pendente', 'pago'], [$b->refresh()->status->value, $b->pagamentoSituacao->value]);
        $this->assertGreaterThan(0, Notificacao::query()->where('usuarioId', $this->gestora->id)->where('tipo', 'pagamento_problema')->where('titulo', 'like', "%{$b->codigo}%")->count());
        Variante::query()->whereKey($vb)->update(['estoque' => 1]);
        $this->estornar($this->gestora, $cb, 'Peça acabou')->assertSessionHasNoErrors();
        $this->pedidos()->cancelar($b->id, 'Peça acabou', $this->gestora->id);
        $this->assertSame('cancelado', $b->refresh()->status->value);
    }

    public function test_pago_duas_vezes_nao_confirma_e_avisa(): void
    {
        ['p' => $p] = $this->compra();
        $this->criar($p);
        $pix = $this->cobrancas($p)->first();
        $this->criar($p, 'checkout');
        $cartao = $this->cobrancas($p)->last();
        $this->falso()->simularPagamento($cartao->mpOrderId);
        $this->falso()->simularPagamento($pix->mpOrderId);
        $this->avisar($cartao->mpOrderId);
        $this->avisar($pix->mpOrderId);
        $this->assertSame(['aprovada', 'aprovada'], $this->cobrancas($p)->map(fn ($c) => $c->status->value)->all());
        $this->assertGreaterThan(0, Notificacao::query()->where('tipo', 'pagamento_problema')->where('titulo', 'like', "%{$p->codigo} foi pago duas vezes%")->count());
        $this->estornar($this->gestora, $pix, 'Pagou duas vezes')->assertSessionHasNoErrors();
    }

    public function test_conciliacao_vencido_pago_sem_aviso_order_sumida_e_travada(): void
    {
        ['p' => $a, 'v' => $va] = $this->compra();
        $this->criar($a);
        $ca = $this->cobrancas($a)->first();
        $ca->update(['expiraEm' => now()->subMinutes(10), 'consultadaEm' => null]);

        ['p' => $b] = $this->compra();
        $this->criar($b);
        $cb = $this->cobrancas($b)->first();
        $this->falso()->simularPagamento($cb->mpOrderId);
        $cb->update(['consultadaEm' => null]);

        ['p' => $c, 'v' => $vc] = $this->compra();
        $this->criar($c);
        $cc = $this->cobrancas($c)->first();
        $cc->update(['mpOrderId' => 'ORDINEXISTENTE', 'consultadaEm' => null]);

        ['p' => $d, 'v' => $vd] = $this->compra();
        $this->criar($d);
        $cd = $this->cobrancas($d)->first();
        $cd->update(['status' => 'criada', 'mpOrderId' => null]);
        Cobranca::query()->whereKey($cd->id)->update(['criadaEm' => now()->subMinutes(20)]);

        $r = $this->servico()->conciliar();
        $this->assertGreaterThanOrEqual(1, $r['vencidas']);
        $this->assertContains($ca->refresh()->status->value, ['cancelada', 'expirada']);
        $this->assertSame([false, 0, 'canceled'], [$ca->reservou, $this->variante($va)->reservado, $this->falso()->consultar($ca->mpOrderId)->status]);
        $this->assertSame(['confirmado', 'pago'], [$b->refresh()->status->value, $b->pagamentoSituacao->value]);
        $this->assertSame(['cancelada', false, 0], [$cc->refresh()->status->value, $cc->reservou, $this->variante($vc)->reservado]);
        $this->assertSame(['cancelada', false, 0], [$cd->refresh()->status->value, $cd->reservou, $this->variante($vd)->reservado]);
    }

    public function test_travas_no_pedido_cancelar_cobranca_e_estornos(): void
    {
        ['p' => $p, 'v' => $v] = $this->compra();
        $this->criar($p);
        $item = $this->itensDe($p->id)->first();
        $this->actingAs($this->vendedora)->post("/painel/pedidos/{$p->id}/itens", ['linhas' => [['itemId' => $item->id, 'varianteId' => $item->varianteId, 'quantidade' => 1, 'preco' => 90]]])
            ->assertSessionHasErrors(['erro']);
        $this->assertStringContainsString('link de pagamento aberto', session('errors')->first('erro'));
        $this->post("/painel/pedidos/{$p->id}/cancelar", ['motivo' => 'Desistiu'])->assertSessionHasNoErrors();
        $c = $this->cobrancas($p)->first();
        $this->assertSame(['cancelada', false, 0, 'canceled'], [$c->status->value, $c->reservou, $this->variante($v)->reservado, $this->falso()->consultar($c->mpOrderId)->status]);

        ['p' => $q, 'v' => $vq] = $this->compra();
        $this->criar($q);
        $cq = $this->cobrancas($q)->first();
        $this->post("/painel/cobrancas/{$cq->id}/cancelar")->assertSessionHasNoErrors();
        $this->assertSame(0, $this->variante($vq)->reservado);
        $this->post("/painel/cobrancas/{$cq->id}/cancelar")->assertSessionHasErrors('erro');

        $carlos = User::factory()->vendedor()->create();
        ['p' => $r] = $this->compra();
        $this->criar($r);
        $cr = $this->cobrancas($r)->first();
        $this->actingAs($carlos)->postJson("/painel/pedidos/{$r->id}/pagamento/link")->assertJson(['ok' => false, 'erro' => 'Pedido não encontrado.']);
        $this->actingAs($carlos)->post("/painel/cobrancas/{$cr->id}/conferir")->assertSessionHasErrors(['erro' => 'Cobrança não encontrada.']);
        $this->actingAs($carlos)->post("/painel/cobrancas/{$cr->id}/cancelar")->assertSessionHasErrors('erro');
    }

    public function test_pago_estorno_parcial_e_total_so_gestor_e_depois_cancela(): void
    {
        $this->cfg(['confirmarAoPagar' => false]);
        ['p' => $p, 'v' => $v] = $this->compra();
        $this->criar($p, 'checkout');
        $c = $this->cobrancas($p)->first();
        $this->falso()->simularPagamento($c->mpOrderId);
        $this->avisar($c->mpOrderId);
        $this->actingAs($this->vendedora)->post("/painel/pedidos/{$p->id}/cancelar", ['motivo' => 'Teste'])->assertSessionHasErrors('erro');
        $this->assertStringContainsString('Estorne', session('errors')->first('erro'));
        $this->estornar($this->vendedora, $c, 'Teste')->assertSessionHasErrors(['erro' => 'Só o gestor pode estornar pagamentos.']);
        $this->estornar($this->gestora, $c, 'De')->assertSessionHasErrors('motivo');
        $this->estornar($this->gestora, $c, 'Cliente desistiu', '30')->assertSessionHasNoErrors();
        $c->refresh()->load('pagamento');
        $this->assertSame('estornada_parcial', $c->status->value);
        $this->assertEquals(80, (float) $c->pagamento->valor);
        $this->estornar($this->gestora, $c, 'Resto', '999')->assertSessionHasErrors('erro');
        $this->estornar($this->gestora, $c, 'Resto')->assertSessionHasNoErrors();
        $c->refresh()->load('pagamento');
        $this->assertSame(['estornada', false, null], [$c->status->value, $c->reservou, $c->pagamento]);
        $this->assertEquals(110, (float) $c->valorEstornado);
        $this->assertSame('estornado', $p->refresh()->pagamentoSituacao->value);
        $this->assertSame(0, $this->variante($v)->reservado);
        $this->post("/painel/pedidos/{$p->id}/cancelar", ['motivo' => 'Estornado'])->assertSessionHasNoErrors();

        $this->cfg(['quemEstorna' => 'equipe']);
        ['p' => $q] = $this->compra();
        $this->criar($q);
        $cq = $this->cobrancas($q)->first();
        $this->falso()->simularPagamento($cq->mpOrderId);
        $this->avisar($cq->mpOrderId);
        $this->estornar($this->vendedora, $cq, 'Devolveu')->assertSessionHasNoErrors();
    }

    public function test_condicional_cobra_so_o_que_ficou_sem_reservar(): void
    {
        ['p' => $p, 'v' => $v] = $this->compra(['tipo' => 'condicional', 'quantidade' => 2]);
        $this->assertErro(fn () => $this->criar($p), 'feche o condicional');
        $item = $this->itensDe($p->id)->first();
        $this->pedidos()->confirmar($p->id, [$item->id => 1], $this->vendedora->id);
        $c = $this->criar($p);
        $this->assertEquals(100, $c['valor']);
        $this->assertFalse($this->cobrancas($p)->first()->reservou);
        $vv = $this->variante($v);
        $this->assertSame([2, 0], [$vv->estoque, $vv->reservado]);
        $this->falso()->simularPagamento($this->cobrancas($p)->first()->mpOrderId);
        $this->avisar($this->cobrancas($p)->first()->mpOrderId);
        $this->assertSame('pago', $p->refresh()->pagamentoSituacao->value);
    }

    public function test_pagina_publica_pagar_simular_e_limite(): void
    {
        $this->postJson('/pagar/PED-000001.aaaaaaaaaaaaaaaa', ['metodo' => 'pix'])->assertJson(['ok' => false, 'erro' => 'Link de pagamento inválido.']);
        ['p' => $p, 'c' => $cliente] = $this->compra(['email' => null]);
        $chave = Links::chaveDoPagamento($p->codigo);
        $this->postJson("/pagar/{$chave}/simular")->assertJson(['ok' => false]);
        $this->postJson("/pagar/{$chave}", ['metodo' => 'pix'])->assertJson(['ok' => false, 'pedirEmail' => true]);
        $this->postJson("/pagar/{$chave}", ['metodo' => 'pix', 'email' => 'cliente@exemplo.com'])->assertJson(['ok' => true, 'metodo' => 'pix', 'valor' => 110]);
        $this->get("/pagar/{$chave}")->assertOk()->assertInertia(fn (AssertableInertia $x) => $x->component('Publico/Pagar')->where('p.ligado', true)->where('p.valor.valor', 110)->where('p.primeiroNome', 'Cliente')->where('simulado', true));
        $tela = app(Pagamentos::class)->paraPagar($p->codigo);
        $this->assertNotEmpty($tela['pixAtivo']['pixCopiaECola']);
        $this->assertStringNotContainsString($cliente->telefone, json_encode($tela));
        $this->getJson('/api/pagamentos/situacao?chave='.rawurlencode($chave))->assertJson(['ok' => true, 'pago' => false, 'aberta' => true]);
        $this->postJson("/pagar/{$chave}", ['metodo' => 'checkout'])->assertJson(['ok' => true, 'metodo' => 'checkout']);
        $this->postJson("/pagar/{$chave}/simular")->assertJson(['ok' => true]);
        $this->assertSame(['confirmado', 'pago'], [$p->refresh()->status->value, $p->pagamentoSituacao->value]);
        $this->getJson('/api/pagamentos/situacao?chave='.rawurlencode($chave))->assertJson(['pago' => true]);
        config(['services.pagamento.gateway' => 'mercadopago']);
        $this->postJson("/pagar/{$chave}/simular")->assertJson(['ok' => false, 'erro' => 'Disponível só no ambiente de teste.']);
        config(['services.pagamento.gateway' => 'falso']);

        ['p' => $q] = $this->compra();
        $cq = Links::chaveDoPagamento($q->codigo);
        $ultima = null;
        for ($i = 0; $i < 10; $i++) {
            $ultima = $this->withServerVariables(['REMOTE_ADDR' => "10.8.{$i}.1"])->postJson("/pagar/{$cq}", ['metodo' => $i % 2 ? 'pix' : 'checkout'])->json();
        }
        $this->assertFalse($ultima['ok']);
        $this->assertStringContainsString('Muitas tentativas', $ultima['erro']);

        $this->cfg(['ligado' => false]);
        $this->assertFalse(app(Pagamentos::class)->paraPagar($q->codigo)['ligado']);
    }

    public function test_painel_quadro_pagina_pagamentos_e_configuracao(): void
    {
        ['p' => $p] = $this->compra();
        $this->criar($p);
        $c = $this->cobrancas($p)->first();
        $this->falso()->simularPagamento($c->mpOrderId, ['meio' => 'pix', 'tipoMeio' => 'bank_transfer', 'taxa' => 1.09]);
        $this->avisar($c->mpOrderId);
        $this->actingAs($this->vendedora)->get("/painel/pedidos/{$p->id}")->assertInertia(fn (AssertableInertia $x) => $x->where('pagamento.paga.status', 'aprovada')->where('pagamento.paga.valor', 110)->where('pagamento.podeEstornar', false));
        $this->get('/painel/pagamentos')->assertForbidden();
        $this->actingAs($this->gestora)->get('/painel/pagamentos?status=pagas')->assertInertia(fn (AssertableInertia $x) => $x->component('Painel/Pagamentos/Index')->where('lista.0.id', $c->id)
            ->where('resumo.bruto', 110)->where('resumo.taxas', 1.09)->where('resumo.liquido', 108.91));

        $this->get('/painel/configuracoes/pagamento')->assertInertia(fn (AssertableInertia $x) => $x->component('Painel/Configuracoes/Pagamento')->where('saude.modo', 'simulado')->where('pronto', true));
        $base = ['ligado' => '1', 'pix' => '1', 'cartao' => '1', 'confirmarAoPagar' => '1', 'minutosPix' => 30, 'minutosCheckout' => 60, 'parcelasMax' => 6, 'parcelasSemJuros' => 1, 'quemEstorna' => 'gestor'];
        $this->put('/painel/configuracoes/pagamento', [...$base, 'minutosPix' => 5])->assertSessionHasErrors('minutosPix');
        $this->put('/painel/configuracoes/pagamento', [...$base, 'pix' => '0', 'cartao' => '0'])->assertSessionHasErrors('pix');
        $this->put('/painel/configuracoes/pagamento', [...$base, 'parcelasSemJuros' => 8])->assertSessionHasErrors('parcelasSemJuros');
        $this->put('/painel/configuracoes/pagamento', [...$base, 'minutosPix' => 45])->assertSessionHasNoErrors();
        $this->assertSame(45, app(Config::class)->get('pagamentoOnline.minutosPix'));
        $this->postJson('/painel/configuracoes/pagamento/testar')->assertJson(['ok' => true]);
        $this->actingAs($this->vendedora)->put('/painel/configuracoes/pagamento', $base)->assertForbidden();
        $this->assertSame(45, app(Config::class)->get('pagamentoOnline.minutosPix'));
    }

    public function test_simulado_bloqueado_na_producao_e_regras_puras(): void
    {
        config(['services.pagamento.producao' => true]);
        $this->assertSame('bloqueado', Modo::atual());
        $this->assertFalse(Modo::configurado());
        ['p' => $p] = $this->compra();
        $this->assertErro(fn () => $this->criar($p), 'credenciais');
        config(['services.pagamento.producao' => false]);

        $this->assertSame('DCERUTTI', Pagamento::nomeNaFatura("D'Cerutti"));
        $this->assertSame('LOJA DA MARIA', Pagamento::nomeNaFatura('Loja da María Ltda'));
        $this->assertSame(['estornada_parcial', 'contestada', 'aprovada', 'expirada', 'pendente'], [
            Pagamento::traduzirStatusMp('processed', 'partially_refunded'), Pagamento::traduzirStatusMp('charged_back', ''), Pagamento::traduzirStatusMp('charged_back', 'reimbursed'),
            Pagamento::traduzirStatusMp('canceled', 'expired'), Pagamento::traduzirStatusMp('???', ''),
        ]);
        $this->assertTrue(Pagamento::podeMudar('expirada', 'aprovada'));
        $this->assertFalse(Pagamento::podeMudar('estornada', 'aprovada'));
        $ts = (string) time();
        $this->assertTrue(Assinatura::validar(['s'], Assinatura::assinar('s', 'ABC', 'r1', $ts), 'r1', 'ABC'));
        $this->assertTrue(Assinatura::validar(['velho', 's'], Assinatura::assinar('s', 'abc', 'r1', $ts), 'r1', 'ABC'));
        $this->assertSame('fora_do_prazo', Assinatura::validar(['s'], Assinatura::assinar('s', 'ABC', 'r1', (string) (time() - 3600)), 'r1', 'ABC'));
        $this->assertSame('malformado', Assinatura::validar(['s'], 'ts=1,v1=xyz', 'r1', 'ABC'));
    }

    public function test_aviso_do_ambiente_errado_e_reprocessamento(): void
    {
        config(['services.pagamento.ambiente' => 'producao']);
        ['p' => $p] = $this->compra();
        $this->criar($p);
        $c = $this->cobrancas($p)->first();
        $this->falso()->simularPagamento($c->mpOrderId);
        $id = 'req-amb';
        $this->call('POST', "/api/pagamentos/mercadopago?data.id={$c->mpOrderId}&type=order", [], [], [], [
            'CONTENT_TYPE' => 'application/json', 'HTTP_X_REQUEST_ID' => $id, 'HTTP_X_SIGNATURE' => Assinatura::assinar('segredo-de-teste', $c->mpOrderId, $id),
        ], json_encode(['action' => 'order.processed', 'type' => 'order', 'live_mode' => false, 'data' => ['id' => $c->mpOrderId]]))->assertJson(['ignorado' => true]);
        $this->assertSame('pendente', $c->refresh()->status->value);
        $this->assertSame(1, EventoPagamento::query()->where('tipo', 'aviso_ambiente_errado')->count());
        $this->assertGreaterThan(0, Notificacao::query()->where('usuarioId', $this->gestora->id)->where('titulo', 'Aviso do Mercado Pago do ambiente errado')->count());

        config(['services.pagamento.ambiente' => null]);
        $ev = EventoPagamento::query()->create(['origem' => 'webhook', 'tipo' => 'aviso_order', 'mpOrderId' => $c->mpOrderId, 'requestId' => 'req-perdido']);
        EventoPagamento::query()->whereKey($ev->id)->update(['criadoEm' => now()->subMinutes(5)]);
        $r = $this->servico()->conciliar();
        $this->assertGreaterThanOrEqual(1, $r['avisos']);
        $this->assertNotNull($ev->refresh()->processadoEm);
        $this->assertSame('aprovada', $c->refresh()->status->value);
    }
}
