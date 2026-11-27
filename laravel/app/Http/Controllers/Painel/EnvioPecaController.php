<?php

namespace App\Http\Controllers\Painel;

use App\Http\Controllers\Controller;
use App\Services\InteressePublico;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** "Enviar peça" (docs/26): o link assinado de quem envia, o texto pronto e os arquivos; e o registro do envio. */
class EnvioPecaController extends Controller
{
    public function __construct(private InteressePublico $interesse) {}

    public function preparar(Request $request, string $referencia): JsonResponse
    {
        $e = $this->interesse->prepararEnvio($request->user(), $referencia, rtrim((string) config('app.url'), '/'));

        return response()->json($e ? ['ok' => true, ...$e] : ['ok' => false, 'erro' => 'Peça não encontrada no catálogo.']);
    }

    public function enviada(Request $request, string $referencia): JsonResponse
    {
        $this->interesse->avisarEnvio($request->user(), $referencia, $request->input('atendimentoId') ? mb_substr((string) $request->input('atendimentoId'), 0, 40) : null);

        return response()->json(['ok' => true]);
    }
}
