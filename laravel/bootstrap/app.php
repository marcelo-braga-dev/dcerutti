<?php

use App\Http\Middleware\AcessoLoja;
use App\Http\Middleware\ContaAtiva;
use App\Http\Middleware\ExigirPapel;
use App\Http\Middleware\HandleInertiaRequests;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->web(append: [ContaAtiva::class, HandleInertiaRequests::class]);
        $middleware->alias(['loja' => AcessoLoja::class, 'papel' => ExigirPapel::class]);
        // sendBeacon não manda cabeçalhos: a rota confere a origem (SinalEquipeController).
        $middleware->validateCsrfTokens(except: ['api/equipe', 'api/atividade', 'api/pagamentos/mercadopago']);
        // src/proxy.ts: quem não entrou vai para /entrar e volta para onde estava.
        $middleware->redirectGuestsTo(fn (Request $request) => '/entrar?volta='.urlencode($request->getRequestUri()));
        $middleware->redirectUsersTo(fn (Request $request) => $request->user()?->ehEquipe() ? '/painel' : '/');
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
