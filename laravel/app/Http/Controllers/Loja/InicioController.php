<?php

namespace App\Http\Controllers\Loja;

use App\Exceptions\ErroNegocio;
use App\Http\Controllers\Controller;
use App\Services\Arquivos;
use App\Services\Config;
use App\Services\Loja\PaginaInicial;
use App\Support\ConteudoInicio;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Inertia\Inertia;
use Inertia\Response;

/** Página inicial da loja e o editor visual dela (src/app/(loja)/page.tsx, (editor)/editar/inicio, acoes/inicio.ts). */
class InicioController extends Controller
{
    /** O limite do editor (a foto é reduzida no navegador antes de enviar). */
    private const LIMITE_FOTO = 1.9 * 1024 * 1024;

    public function index(PaginaInicial $pagina, Config $config): Response
    {
        return Inertia::render('Loja/Inicio', ['dados' => $pagina->dados(), 'conteudo' => $config->get('inicio')]);
    }

    public function editar(PaginaInicial $pagina, Config $config): Response
    {
        return Inertia::render('Loja/EditarInicio', ['dados' => $pagina->dados(), 'conteudo' => $config->get('inicio'), 'destinos' => $pagina->destinos()]);
    }

    /** Grava o conteúdo (só o gestor) e apaga as fotos da página inicial que deixaram de ser usadas. */
    public function salvar(Request $request, Config $config): RedirectResponse
    {
        $c = $request->validate(['textos' => ['present', 'array'], 'imagens' => ['present', 'array'], 'links' => ['nullable', 'array'], 'ocultas' => ['present', 'array']], ['*' => 'Conteúdo inválido.']);
        $imagens = [];
        foreach (ConteudoInicio::IMAGENS as $campo) {
            $url = $c['imagens'][$campo] ?? null;
            if (! $url) {
                continue;
            }
            if (! is_string($url) || ! preg_match(ConteudoInicio::URL_FOTO, $url)) {
                return back()->withErrors(['erro' => 'Foto inválida.']);
            }
            $imagens[$campo] = $url;
        }
        foreach ((array) ($c['links'] ?? []) as $v) {
            if (! ConteudoInicio::linkValido($v)) {
                return back()->withErrors(['erro' => 'Link inválido.']);
            }
        }
        $textos = array_filter((array) $c['textos'], 'is_string');
        $conteudo = ConteudoInicio::normalizar(['textos' => $textos, 'imagens' => $imagens, 'links' => $c['links'] ?? [], 'ocultas' => array_filter($c['ocultas'], 'is_string')]);
        $config->salvar(['inicio' => $conteudo]);
        $this->limparFotos(array_values($conteudo['imagens']));

        return back()->with('sucesso', 'Página inicial salva.');
    }

    /** Envia uma foto para a página inicial. Ela só passa a valer quando o gestor salva a página. */
    public function enviarImagem(Request $request, Arquivos $arquivos): JsonResponse
    {
        $arquivo = $request->file('arquivo');
        if (! $arquivo || ! $arquivo->getSize()) {
            return response()->json(['ok' => false, 'erro' => 'Escolha uma foto.']);
        }
        if ($arquivo->getSize() > self::LIMITE_FOTO) {
            return response()->json(['ok' => false, 'erro' => 'A foto passa de 2 MB. Use uma foto menor.']);
        }
        try {
            return response()->json(['ok' => true, 'url' => $arquivos->salvarImagemPagina('inicio', (string) file_get_contents($arquivo->getRealPath()))]);
        } catch (ErroNegocio $e) {
            return response()->json(['ok' => false, 'erro' => $e->getMessage()]);
        }
    }

    /** Fotos da página inicial fora de uso e com mais de um dia (enviadas e não salvas, ou trocadas). @param list<string> $emUso */
    private function limparFotos(array $emUso): void
    {
        $pasta = rtrim((string) config('services.arquivos.dir'), '/').'/paginas';
        if (! is_dir($pasta)) {
            return;
        }
        foreach (File::files($pasta) as $f) {
            $nome = $f->getFilename();
            if (str_starts_with($nome, 'inicio-') && ! in_array("/arquivos/paginas/{$nome}", $emUso, true) && $f->getMTime() < time() - 86400) {
                @unlink($f->getPathname());
            }
        }
    }
}
