<?php

namespace App\Http\Controllers\Loja;

use App\Http\Controllers\Controller;
use App\Queries\Loja;
use App\Services\Catalogo;
use App\Services\Config;
use App\Support\FiltroCatalogo as F;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Página da peça (src/app/(loja)/produto/[referencia]/page.tsx). */
class ProdutoController extends Controller
{
    public function __invoke(Request $request, string $referencia, Catalogo $catalogo, Config $config, Loja $loja): Response
    {
        $p = $catalogo->porReferencia(rawurldecode($referencia));
        abort_unless($p, 404);
        $lista = $catalogo->lista();
        $grupo = F::grupoDaCategoria($p['categoria']);
        // Vitrines: peças do grupo complementar do mesmo gênero (para combinar) e mais da mesma categoria. Uma por modelo.
        $pronta = fn ($x) => F::modeloDe($x) !== F::modeloDe($p) && F::emEstoque($x) && count($x['imagens']) > 0;
        $mesmoGenero = fn ($x) => $x['genero'] === $p['genero'] || $x['genero'] === 'unissex' || $p['genero'] === 'unissex';
        $complementar = ['Parte de cima' => 'Parte de baixo', 'Parte de baixo' => 'Parte de cima'][$grupo] ?? null;
        $combina = [];
        if ($complementar) {
            $combina = F::umPorModelo(array_values(array_filter($lista, fn ($x) => $pronta($x) && $mesmoGenero($x) && F::grupoDaCategoria($x['categoria']) === $complementar)));
            usort($combina, fn ($a, $b) => $b['id'] <=> $a['id']);
            $combina = array_slice($combina, 0, 4);
        }
        $idsCombina = array_column($combina, 'id');
        $mais = F::umPorModelo(array_values(array_filter($lista, fn ($x) => $pronta($x) && $x['categoriaSlug'] === $p['categoriaSlug'] && ! in_array($x['id'], $idsCombina, true))));
        usort($mais, fn ($a, $b) => ((int) $mesmoGenero($b) <=> (int) $mesmoGenero($a)) ?: ($b['id'] <=> $a['id']));

        return Inertia::render('Loja/Produto', [
            'produto' => $p,
            'atendimento' => $loja->atendimento($request->user()) ?? ['nome' => 'a loja', 'telefone' => $config->get('whatsappLoja')],
            'grupo' => $grupo,
            'combina' => array_map(Loja::cartao(...), $combina),
            'mais' => array_map(Loja::cartao(...), array_slice($mais, 0, 8)),
        ])->withViewData(['og' => ['titulo' => $p['nome'], 'imagem' => $p['imagens'][0] ?? null]]);
    }
}
