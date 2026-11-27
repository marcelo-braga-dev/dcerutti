<?php

namespace App\Http\Middleware;

use App\Enums\StatusPedido;
use App\Http\Controllers\Painel\AtendimentoController;
use App\Models\Notificacao;
use App\Models\Pedido;
use App\Models\User;
use App\Services\Config;
use Illuminate\Http\Request;
use Inertia\Middleware;

/** Props que toda página recebe (resources/js/types/inertia.d.ts). */
class HandleInertiaRequests extends Middleware
{
    protected $rootView = 'app';

    /** @return array<string, mixed> */
    public function share(Request $request): array
    {
        $config = app(Config::class);
        /** @var User|null $u */
        $u = $request->user();
        $loja = $config->nomeDaLoja();
        $identidade = $config->get('identidade');

        return [
            ...parent::share($request),
            'usuario' => $u ? ['id' => $u->id, 'nome' => $u->name, 'email' => $u->email, 'papel' => $u->papel->value] : null,
            'identidade' => [
                'nome' => $loja['nome'],
                'slogan' => $loja['slogan'],
                'cores' => (object) ($identidade['cores'] ?? []),
                'logo' => $identidade['logo'] ?? ['url' => '/logo-dcerutti.png', 'largura' => 620, 'altura' => 285],
                'logoClara' => $identidade['logoClara'] ?? ['url' => '/logo-dcerutti-claro.png', 'largura' => 620, 'altura' => 285],
            ],
            'flash' => ['sucesso' => $request->session()->get('sucesso'), 'erro' => $request->session()->get('erro'), 'avisarCliente' => (bool) $request->session()->get('avisarCliente')],
            // Menu do painel (D-35): só para a equipe e só nas telas do painel.
            'painel' => fn () => $u && $u->ehEquipe() && $request->is('painel', 'painel/*') ? [
                'pendentes' => Pedido::query()->where('status', StatusPedido::Pendente)->when(! $u->ehGestor(), fn ($q) => $q->where('vendedorId', $u->id))->count(),
                'notificacoes' => Notificacao::query()->where('usuarioId', $u->id)->whereNull('lidaEm')->count(),
                'atendimento' => (bool) $config->get('atendimento.ligado'),
                'fila' => $config->get('atendimento.ligado') ? AtendimentoController::contarFila($u) : 0,
                'vitrines' => (bool) $config->get('vitrines.ligadas'),
                'pagamentos' => (bool) $config->get('pagamentoOnline.ligado'),
            ] : null,
        ];
    }
}
