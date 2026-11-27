<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    {{-- Prévia de link (WhatsApp, Instagram) nas páginas públicas: o controller passa `og` para a view (docs/29, 3.6). --}}
    @isset($og)
        <meta property="og:title" content="{{ $og['titulo'] }}">
        @isset($og['descricao'])<meta property="og:description" content="{{ $og['descricao'] }}">@endisset
        @isset($og['imagem'])<meta property="og:image" content="{{ $og['imagem'] }}">@endisset
        <meta property="og:type" content="website">
    @endisset
    @viteReactRefresh
    @vite('resources/js/app.tsx')
    <x-inertia::head>
        <title>{{ config('app.name') }}</title>
    </x-inertia::head>
</head>
<body>
    <x-inertia::app />
</body>
</html>
