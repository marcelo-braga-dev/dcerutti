<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Rota só para alguns papéis: `papel:gestor` ou `papel:vendedor,gestor` (docs/06). Cliente no painel volta para a loja. */
class ExigirPapel
{
    public function handle(Request $request, Closure $next, string ...$papeis): Response
    {
        $u = $request->user();
        if (! $u || ! in_array($u->papel->value, $papeis, true)) {
            return $u?->papel->value === 'cliente' ? redirect('/') : abort(403);
        }

        return $next($request);
    }
}
