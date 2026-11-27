<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\ProcessarAvisoPagamento;
use App\Queries\Pagamentos;
use App\Services\Pagamentos\Assinatura;
use App\Services\Pagamentos\Cobrancas;
use App\Support\Links;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;

use function Illuminate\Support\defer;

/** Endpoints do pagamento online (docs/27): o aviso do Mercado Pago e a situação para a página do Pix. */
class PagamentoController extends Controller
{
    public function __construct(private Cobrancas $cobrancas) {}

    /**
     * Aviso (webhook), tópico "order":
     *  1. confere `x-signature` com MP_WEBHOOK_SECRET (401 se não conferir: o MP tenta de novo; 503 sem segredo);
     *  2. grava o aviso com o `x-request-id` único (repetido = 200 sem fazer nada); outro ambiente = registrado e ignorado;
     *  3. responde 200 na hora e a fila consulta a order na API e aplica (o corpo do aviso nunca vale sozinho).
     */
    public function aviso(Request $request): JsonResponse
    {
        if (strlen($request->getContent()) > 64_000) {
            return response()->json(null, 413);
        }
        $corpo = json_decode($request->getContent(), true);
        $corpo = is_array($corpo) ? $corpo : [];
        $tipo = $request->query('type') ?? $request->query('topic') ?? ($corpo['type'] ?? '');
        $dataId = $request->query('data_id') ?? $request->query('data.id') ?? $request->query('id') ?? (isset($corpo['data']['id']) ? (string) $corpo['data']['id'] : null);
        $requestId = $request->header('x-request-id');
        $ok = Assinatura::validar([config('services.pagamento.segredo'), config('services.pagamento.segredo_anterior')], $request->header('x-signature'), $requestId, $dataId);
        if ($ok !== true) {
            Log::warning('Pagamento: aviso do Mercado Pago recusado', ['motivo' => $ok, 'tipo' => $tipo, 'id' => $dataId]);

            return response()->json(['ok' => false], $ok === 'sem_segredo' ? 503 : 401);
        }
        if ($tipo !== 'order' || ! $dataId || ! preg_match('/^[A-Za-z0-9_-]{1,64}$/', $dataId)) {
            return response()->json(['ok' => true, 'ignorado' => true]);
        }
        $evento = $this->cobrancas->registrarAviso($dataId, $requestId, $corpo['action'] ?? null, is_bool($corpo['live_mode'] ?? null) ? $corpo['live_mode'] : null);
        if ($evento === 'repetido') {
            return response()->json(['ok' => true, 'repetido' => true]);
        }
        if ($evento === 'ambiente_errado') {
            return response()->json(['ok' => true, 'ignorado' => true]);
        }
        ProcessarAvisoPagamento::dispatch($evento);

        return response()->json(['ok' => true]);
    }

    /** Situação para a página /pagar (o Pix pergunta a cada 5 s). Aberta: consulta o MP no máximo a cada 15 s. */
    public function situacao(Request $request): JsonResponse
    {
        $sem = ['Cache-Control' => 'no-store'];
        $codigo = Links::codigoDaChavePagamento($request->query('chave'));
        if (! $codigo) {
            return response()->json(['ok' => false], 404, $sem);
        }
        $k = 'situacao-pgto:'.$request->ip();
        if (RateLimiter::tooManyAttempts($k, 400)) {
            return response()->json(['ok' => false], 429, $sem);
        }
        RateLimiter::hit($k, 15 * 60);
        $s = Pagamentos::situacao($codigo);
        if (! $s) {
            return response()->json(['ok' => false], 404, $sem);
        }
        if ($s['ativa']['temOrder'] ?? false) {
            try {
                if ($this->cobrancas->sincronizar($s['ativa']['id'], 'consulta', 15)) {
                    $s = Pagamentos::situacao($codigo);
                }
            } catch (\Throwable) {
                // Mercado Pago fora do ar: responde o que se sabe.
            }
        }
        defer(fn () => $this->cobrancas->conciliarDoPedido($codigo));

        return response()->json(['ok' => true, 'pago' => $s['pago'], 'aberta' => (bool) $s['ativa'], 'situacao' => $s['ativa']['status'] ?? $s['ultima'], 'expiraEm' => $s['ativa']['expiraEm'] ?? null], 200, $sem);
    }
}
