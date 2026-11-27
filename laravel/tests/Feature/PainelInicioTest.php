<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia;
use Tests\Concerns\MundoDeTeste;
use Tests\TestCase;

/** Início, busca e tutorial do painel. */
class PainelInicioTest extends TestCase
{
    use MundoDeTeste, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->criarMundo();
    }

    public function test_inicio_da_vendedora_mostra_o_que_responder_e_o_do_gestor_as_metas(): void
    {
        $v = $this->produtoDeTeste(['M' => 5])['v'];
        $this->criarPedido([['varianteId' => $v['M'], 'quantidade' => 1]]);
        $this->actingAs($this->vendedora)->get('/painel')->assertOk()->assertInertia(fn (AssertableInertia $p) => $p->component('Painel/Inicio')
            ->has('aResponder', 1)->where('pendentes', 1)->whereNot('linkConvite', null));
        $this->actingAs($this->gestora)->get('/painel')->assertInertia(fn (AssertableInertia $p) => $p->has('aResponder', 0)->has('ranking', 1)->where('linkConvite', null));
    }

    public function test_busca_respeita_o_escopo_e_o_tutorial_abre(): void
    {
        $this->actingAs($this->vendedora)->get('/painel/busca?q=Juliana')->assertInertia(fn (AssertableInertia $p) => $p->component('Painel/Busca')->where('resultados.totalClientes', 1));
        $outra = User::factory()->vendedor()->create();
        $this->actingAs($outra)->get('/painel/busca?q=Juliana')->assertInertia(fn (AssertableInertia $p) => $p->where('resultados.totalClientes', 0));
        $this->actingAs($this->vendedora)->get('/painel/busca?q=J')->assertInertia(fn (AssertableInertia $p) => $p->where('resultados', null));
        $this->actingAs($this->vendedora)->get('/painel/tutorial')->assertOk()->assertInertia(fn (AssertableInertia $p) => $p->where('gestor', false));
    }
}
