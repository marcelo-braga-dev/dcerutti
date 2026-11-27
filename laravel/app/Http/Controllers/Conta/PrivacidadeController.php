<?php

namespace App\Http\Controllers\Conta;

use App\Http\Controllers\Controller;
use App\Queries\Loja;
use App\Services\Config;
use App\Support\Telefone;
use App\Support\Url;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Política de privacidade, pública; a cliente que ainda não aceitou vê o botão de aceite (LGPD). */
class PrivacidadeController extends Controller
{
    public function show(Request $request, Config $config): Response
    {
        $u = $request->user();

        return Inertia::render('Conta/Privacidade', [
            'pendente' => Loja::ehCliente($u) && ! $u->aceitouPrivacidadeEm,
            'whatsapp' => Telefone::formatar((string) $config->get('whatsappLoja')),
            'volta' => Url::caminhoInterno($request->query('volta')),
        ]);
    }

    public function aceitar(Request $request): RedirectResponse
    {
        $u = $request->user();
        abort_unless(Loja::ehCliente($u), 403);
        $u->update(['aceitouPrivacidadeEm' => now()]);

        return redirect(Url::caminhoInterno($request->input('volta')) ?? '/');
    }
}
