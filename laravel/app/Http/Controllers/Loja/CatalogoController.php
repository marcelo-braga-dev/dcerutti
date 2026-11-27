<?php

namespace App\Http\Controllers\Loja;

use App\Http\Controllers\Controller;
use App\Queries\Loja;
use App\Services\Catalogo;
use App\Support\FiltroCatalogo;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Catálogo com filtros, ordem e contagens (src/app/(loja)/catalogo/page.tsx). */
class CatalogoController extends Controller
{
    public function __invoke(Request $request, Catalogo $catalogo): Response
    {
        $f = FiltroCatalogo::ler($request->query());
        $lista = $catalogo->lista();
        $r = FiltroCatalogo::filtrar($lista, $f);
        // Nenhuma peça: sugere as categorias do mesmo gênero.
        $sugestoes = $r['total'] === 0
            ? array_slice(FiltroCatalogo::filtrar($lista, [...FiltroCatalogo::VAZIOS, 'genero' => $f['genero']])['contagens']['categorias'], 0, 8)
            : [];

        return Inertia::render('Loja/Catalogo', [
            'filtros' => $f,
            'produtos' => array_map(Loja::cartao(...), $r['produtos']),
            'total' => $r['total'],
            'temMais' => $r['temMais'],
            'contagens' => $r['contagens'],
            'sugestoes' => $sugestoes,
        ]);
    }
}
