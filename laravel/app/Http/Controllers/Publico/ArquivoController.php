<?php

namespace App\Http\Controllers\Publico;

use App\Http\Controllers\Controller;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Serve os arquivos gravados em armazenamento/ (D-13; src/app/arquivos/[...caminho]/route.ts). Públicos de propósito:
 * as fotos vão nos links do WhatsApp. Os nomes nunca se repetem, então o cache é permanente. Aceita Range (D-29): o
 * Safari do iPhone não toca vídeo sem isso. Em produção o nginx serve a pasta direto (docs/29, seção 7).
 */
class ArquivoController extends Controller
{
    private const TIPOS = [
        'webp' => 'image/webp', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'avif' => 'image/avif',
        'mp4' => 'video/mp4', 'webm' => 'video/webm',
    ];

    public function __invoke(string $caminho): BinaryFileResponse
    {
        $base = realpath((string) config('services.arquivos.dir'));
        $alvo = $base ? realpath($base.DIRECTORY_SEPARATOR.$caminho) : false;
        $tipo = self::TIPOS[strtolower(pathinfo((string) $alvo, PATHINFO_EXTENSION))] ?? null;
        abort_unless($alvo && $tipo && str_starts_with($alvo, $base.DIRECTORY_SEPARATOR) && is_file($alvo), 404, 'Não encontrado');

        return response()->file($alvo, [
            'Content-Type' => $tipo, 'Cache-Control' => 'public, max-age=31536000, immutable', 'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
