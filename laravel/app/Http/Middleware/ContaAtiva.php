<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/** Conta desativada pelo gestor perde o acesso na próxima requisição, mesmo com a sessão aberta. */
class ContaAtiva
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user() && ! $request->user()->ativo) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return redirect('/entrar')->with('erro', 'Esta conta foi desativada. Fale com a loja.');
        }

        return $next($request);
    }
}
