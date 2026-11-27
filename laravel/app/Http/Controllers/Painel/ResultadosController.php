<?php

namespace App\Http\Controllers\Painel;

use App\Http\Controllers\Controller;
use App\Queries\Relatorios;
use App\Services\Config;
use App\Services\Sugestoes;
use App\Support\Datas;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Resultados e lucro do gestor (porta de painel/resultados/page.tsx). */
class ResultadosController extends Controller
{
    public function __invoke(Request $request, Config $config, Sugestoes $sugestoes): Response
    {
        $atual = Datas::mes();
        $tudo = $request->query('periodo') === 'tudo';
        $mes = Datas::mesValido($request->query('mes')) && $request->query('mes') <= $atual ? (string) $request->query('mes') : $atual;
        $periodo = $tudo ? null : Datas::intervaloDoMes($mes);

        return Inertia::render('Painel/Resultados', [
            'mes' => $mes, 'atual' => $atual, 'tudo' => $tudo,
            'r' => Relatorios::resultados($periodo), 'cupons' => Relatorios::cupons($periodo),
            'sugestoes' => $sugestoes->conversao($request->user(), $periodo[0] ?? null, $periodo[1] ?? null),
            'atendimento' => $config->get('atendimento.ligado') ? Relatorios::atendimento($periodo) : null,
        ]);
    }
}
