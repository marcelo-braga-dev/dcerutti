<?php

namespace App\Http\Controllers\Publico;

use App\Http\Controllers\Controller;
use App\Services\Config;
use App\Services\InteressePublico;
use App\Support\Dinheiro;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Link da peça (docs/26, D-32, D-36): aberto sem login, para quem recebeu de uma vendedora. A chave assinada autoriza. */
class PecaController extends Controller
{
    public function __construct(private InteressePublico $interesse, private Config $config) {}

    public function show(string $chave): Response
    {
        $p = $this->interesse->peca($chave);
        abort_unless($p, 404);
        $loja = $this->config->nomeDaLoja()['nome'];
        $site = rtrim((string) config('app.url'), '/');
        $foto = $p['imagens'][0] ?? null;

        return Inertia::render('Publico/Peca', ['chave' => $chave, 'p' => $p, 'vitrines' => (bool) $this->config->get('vitrines.ligadas')])->withViewData(['og' => [
            'titulo' => "{$p['nome']} · {$loja}", 'descricao' => Dinheiro::brl($p['preco']),
            'imagem' => $foto ? (str_starts_with($foto, 'http') ? $foto : $site.$foto) : null,
        ]]);
    }

    public function quero(Request $request, string $chave): JsonResponse
    {
        return response()->json($this->interesse->quererPeca($chave, $request->only(['varianteId', 'nome', 'telefone', 'aceite', 'site', 'ofertas']), $request->ip()));
    }
}
