<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Equipe;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Validator;

/**
 * Acompanhamento da equipe (D-26; src/app/api/equipe/route.ts): o painel e o caixa mandam um sinal por minuto com o
 * tempo visível, e os envios pelo WhatsApp. Quem é vem da sessão, nunca do corpo. Sem CSRF (o navegador manda por
 * sendBeacon, sem cabeçalhos): a origem é conferida. Responde 204 mesmo quando não grava nada.
 */
class SinalEquipeController extends Controller
{
    public function __invoke(Request $request, Equipe $equipe): Response
    {
        $origem = $request->headers->get('origin');
        if ($origem && parse_url($origem, PHP_URL_HOST) !== $request->getHost()) {
            return response()->noContent(403);
        }
        $u = $request->user();
        if (! $u || ! $u->ehEquipe()) {
            return response()->noContent();
        }
        $chave = "equipe:{$u->id}";
        if (RateLimiter::tooManyAttempts($chave, 60)) {
            return response()->noContent(429);
        }
        RateLimiter::hit($chave, 60);
        $texto = (string) $request->getContent();
        if (strlen($texto) > 8000) {
            return response()->noContent(413);
        }
        $corpo = json_decode($texto, true);
        $v = Validator::make(is_array($corpo) ? $corpo : [], [
            'seg' => ['nullable', 'integer', 'min:0', 'max:600'], 'envios' => ['nullable', 'array', 'max:10'],
            'envios.*.acao' => ['required', 'in:oferta,cupom,convite,pedido,comprovante,fechamento,contato'],
            'envios.*.telefone' => ['nullable', 'regex:/^\d{8,13}$/'], 'envios.*.pedidoId' => ['nullable', 'string', 'max:40'], 'envios.*.caminho' => ['nullable', 'string', 'max:300'],
        ]);
        if (! is_array($corpo) || $v->fails()) {
            return response()->noContent(400);
        }
        try {
            if (isset($corpo['seg'])) {
                $equipe->registrarPresenca($u->id, (int) $corpo['seg'], $request->userAgent());
            }
            foreach ($corpo['envios'] ?? [] as $e) {
                $equipe->registrarEnvio($u, $e, $request->userAgent());
            }
        } catch (\Throwable $e) {
            Log::error('Falha ao registrar o sinal da equipe', ['erro' => $e->getMessage()]);
        }

        return response()->noContent();
    }
}
