<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Queries\Loja;
use App\Services\Loja\Navegacao;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;

/**
 * Histórico da cliente (docs/21): recebe os eventos da loja em lote (sendBeacon, JSON em text/plain). Só a cliente
 * logada; quem ela é vem da sessão, nunca do corpo. Responde 204 mesmo quando não grava nada.
 */
class AtividadeController extends Controller
{
    public function __invoke(Request $request, Navegacao $navegacao): Response
    {
        $origem = $request->headers->get('origin');
        if ($origem && parse_url($origem, PHP_URL_HOST).(parse_url($origem, PHP_URL_PORT) ? ':'.parse_url($origem, PHP_URL_PORT) : '') !== $request->getHttpHost()) {
            return response()->noContent(403);
        }
        $u = $request->user();
        if (! Loja::ehCliente($u)) {
            return response()->noContent();
        }
        $chave = "atividade:{$u->id}";
        if (RateLimiter::tooManyAttempts($chave, 60)) {
            return response()->noContent(429);
        }
        RateLimiter::hit($chave, 60);
        $texto = $request->getContent();
        if (strlen($texto) > 32000) {
            return response()->noContent(413);
        }
        $eventos = self::validar(json_decode($texto, true)['eventos'] ?? null);
        if ($eventos === null) {
            return response()->noContent(400);
        }
        try {
            $navegacao->registrarEventos($u->id, $eventos, $request->userAgent());
        } catch (\Throwable $e) {
            Log::error('Falha ao registrar a navegação', ['erro' => $e->getMessage()]);
        }

        return response()->noContent();
    }

    /**
     * Confere o lote (src/server/navegacao.ts → esquemaEventos). Qualquer evento torto recusa o lote todo.
     *
     * @return ?list<array<string, mixed>>
     */
    public static function validar(mixed $eventos): ?array
    {
        if (! is_array($eventos) || ! array_is_list($eventos) || count($eventos) > 40) {
            return null;
        }
        $ref = fn ($v) => is_string($v) && preg_match('/^[A-Za-z0-9_-]{6,16}$/', $v);
        $id = fn ($v) => is_int($v) && $v > 0;
        $inteiro = fn ($v, int $min, int $max) => is_int($v) && $v >= $min && $v <= $max;
        foreach ($eventos as $e) {
            $ok = is_array($e) && match ($e['tipo'] ?? null) {
                'pagina' => $ref($e['ref'] ?? null) && Navegacao::caminhoValido($e['caminho'] ?? null),
                'duracao' => $ref($e['ref'] ?? null) && $inteiro($e['seg'] ?? null, 1, 3600),
                'tamanho' => $id($e['varianteId'] ?? null),
                'sacola' => $id($e['varianteId'] ?? null) && $inteiro($e['delta'] ?? null, -20, 20) && $e['delta'] !== 0,
                'whatsapp' => Navegacao::caminhoValido($e['caminho'] ?? null),
                'carrinho' => is_array($e['itens'] ?? null) && count($e['itens']) <= 60
                    && collect($e['itens'])->every(fn ($i) => is_array($i) && $id($i['varianteId'] ?? null) && $inteiro($i['quantidade'] ?? null, 1, 20)),
                default => false,
            };
            if (! $ok) {
                return null;
            }
        }

        return $eventos;
    }
}
