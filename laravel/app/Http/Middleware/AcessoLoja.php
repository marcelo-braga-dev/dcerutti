<?php

namespace App\Http\Middleware;

use App\Queries\Loja;
use App\Services\Catalogo;
use App\Services\Config;
use Closure;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\Response;

/**
 * Loja (src/app/(loja)/layout.tsx). D-09: com `catalogoPublico` desligado, toda a loja exige login. LGPD: cliente sem
 * aceite registrado aceita a política antes de usar a loja (Minha conta fica liberada para poder excluir a conta).
 * Compartilha o que o topo, o rodapé e a sacola precisam.
 */
class AcessoLoja
{
    public function __construct(private Config $config, private Catalogo $catalogo, private Loja $loja) {}

    public function handle(Request $request, Closure $next): Response
    {
        $u = $request->user();
        $caminho = '/'.ltrim($request->getRequestUri(), '/');
        $volta = $caminho === '/' ? '' : '?volta='.rawurlencode($caminho);
        if (! $u && ! $this->config->get('catalogoPublico')) {
            return redirect('/entrar'.$volta);
        }
        if (Loja::ehCliente($u) && ! $u->aceitouPrivacidadeEm && ! $request->is('minha-conta', 'minha-conta/*')) {
            return redirect('/privacidade'.$volta);
        }
        $cfg = $this->config;
        Inertia::share('loja', fn () => [
            'atalhos' => Loja::atalhos($this->catalogo->lista()),
            'favoritos' => $this->loja->favoritos($u),
            'cliente' => Loja::ehCliente($u),
            // Histórico da cliente (docs/21): só a navegação de clientes é registrada.
            'rastrear' => Loja::ehCliente($u) && (bool) $cfg->get('historico.ligado'),
            'whatsapp' => $cfg->get('whatsappLoja'),
            'instagram' => $cfg->get('instagramLoja'),
            'cidadeCondicional' => $cfg->get('cidadeCondicional'),
            'parcelas' => (int) $cfg->get('parcelas'),
            'frete' => $cfg->get('frete'),
        ]);

        return $next($request);
    }
}
