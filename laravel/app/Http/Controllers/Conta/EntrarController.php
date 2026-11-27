<?php

namespace App\Http\Controllers\Conta;

use App\Http\Controllers\Controller;
use App\Http\Requests\Conta\EntrarRequest;
use App\Services\Config;
use App\Services\Equipe;
use App\Services\Loja\Navegacao;
use App\Support\Url;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

class EntrarController extends Controller
{
    public function show(Request $request, Config $config): Response
    {
        return Inertia::render('Conta/Entrar', [
            'volta' => Url::caminhoInterno($request->query('volta')),
            'redefinida' => $request->boolean('redefinida'),
            'whatsappLoja' => $config->get('whatsappLoja'),
        ]);
    }

    public function store(EntrarRequest $request): RedirectResponse
    {
        $request->autenticar();
        $request->session()->regenerate();
        $u = $request->user();
        $u->forceFill(['ultimoLoginEm' => now()])->saveQuietly();
        app(Equipe::class)->registrarLogin($u, $request->userAgent());
        if (! $u->ehEquipe()) {
            rescue(fn () => app(Navegacao::class)->registrarLogin($u->id, $request->userAgent()));
        }

        return redirect(Url::caminhoInterno($request->input('volta')) ?? ($u->ehEquipe() ? '/painel' : '/'));
    }

    public function destroy(Request $request): RedirectResponse
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect('/');
    }
}
