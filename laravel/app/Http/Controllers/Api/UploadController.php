<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ErroNegocio;
use App\Http\Controllers\Controller;
use App\Models\Produto;
use App\Models\User;
use App\Services\Arquivos;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Upload de fotos e vídeos de produto (src/app/api/upload). Gestor; vendedora só em peça que existe (docs/26). */
class UploadController extends Controller
{
    private function pode(?User $u, string $referencia): bool
    {
        if ($u?->ehGestor()) {
            return true;
        }

        return $u?->papel->value === 'vendedor' && Produto::query()->where('referencia', $referencia)->exists();
    }

    public function foto(Request $request, Arquivos $arquivos): JsonResponse
    {
        $referencia = trim((string) $request->input('referencia'));
        if (! $this->pode($request->user(), $referencia)) {
            return response()->json(['erro' => 'Sem permissão.'], 403);
        }
        $arquivo = $request->file('arquivo');
        if (! $arquivo) {
            return response()->json(['erro' => 'Escolha uma foto.'], 400);
        }
        if ($arquivo->getSize() > Arquivos::TAMANHO_MAXIMO) {
            return response()->json(['erro' => 'Foto acima de 8 MB.'], 413);
        }
        try {
            return response()->json(['publica' => $arquivos->salvarFotoProduto($referencia, (string) file_get_contents($arquivo->getRealPath()))]);
        } catch (ErroNegocio $e) {
            return response()->json(['erro' => $e->getMessage()], 400);
        }
    }

    /** Corpo = o próprio arquivo (não multipart), lido em partes direto para o disco: POST /api/upload/video?referencia=<REF>. */
    public function video(Request $request, Arquivos $arquivos): JsonResponse
    {
        $referencia = trim((string) $request->query('referencia'));
        if (! $this->pode($request->user(), $referencia)) {
            return response()->json(['erro' => 'Sem permissão.'], 403);
        }
        if ((int) $request->header('Content-Length') > Arquivos::TAMANHO_MAXIMO_VIDEO) {
            return response()->json(['erro' => 'Vídeo acima de 100 MB.'], 413);
        }
        $entrada = $request->getContent(true); // fluxo do corpo (php://input), sem carregar tudo na memória
        try {
            return response()->json(['publica' => $arquivos->salvarVideoProduto($referencia, $entrada)]);
        } catch (ErroNegocio $e) {
            return response()->json(['erro' => $e->getMessage()], str_contains($e->getMessage(), '100 MB') ? 413 : 400);
        } finally {
            if (is_resource($entrada)) {
                fclose($entrada);
            }
        }
    }
}
