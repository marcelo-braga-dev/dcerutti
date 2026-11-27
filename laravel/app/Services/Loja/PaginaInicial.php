<?php

namespace App\Services\Loja;

use App\Queries\Loja;
use App\Services\Catalogo;
use App\Support\FiltroCatalogo as F;

/**
 * Dados da página inicial (src/components/loja/pagina-inicial.tsx): vitrines, categorias, marcas, faixas de preço e
 * fotos automáticas. Textos, fotos salvas, links e seções ocultas vêm do conteúdo editável e são montados na tela.
 */
class PaginaInicial
{
    public function __construct(private Catalogo $catalogo) {}

    /** @return array<string, mixed> */
    public function dados(): array
    {
        $lista = $this->catalogo->lista();
        $prontas = array_values(array_filter($lista, fn ($p) => F::emEstoque($p) && count($p['imagens']) > 0));
        $novos = $prontas;
        usort($novos, fn ($a, $b) => $b['id'] <=> $a['id']);
        $novidades = array_slice(F::intercalar(F::umPorModelo($novos), fn ($p) => $p['categoriaSlug']), 0, 8);
        $naVitrine = array_flip(array_map(F::modeloDe(...), $novidades));
        $todasImperdiveis = F::umPorModelo(array_values(array_filter($novos, fn ($p) => $p['imperdivel'])));
        $todasPromocoes = F::umPorModelo(array_values(array_filter($novos, F::emPromocao(...))));
        $foraDaVitrine = fn (array $l) => array_slice(array_values(array_filter($l, fn ($p) => ! isset($naVitrine[F::modeloDe($p)]))), 0, 8);
        $maiorDesconto = fn (array $l) => max(0, ...array_map(fn ($p) => $p['precoCheio'] > $p['preco'] ? (int) round((1 - $p['preco'] / $p['precoCheio']) * 100) : 0, $l ?: [['preco' => 0, 'precoCheio' => 0]]));
        $fotoDe = function (callable $filtro) use ($prontas): ?string {
            $p = null;
            foreach ($prontas as $x) {
                if ($filtro($x) && count($x['imagens']) > 1) {
                    $p = $x;
                    break;
                }
            }
            if (! $p) {
                foreach ($prontas as $x) {
                    if ($filtro($x)) {
                        $p = $x;
                        break;
                    }
                }
            }

            return $p ? ($p['imagens'][1] ?? $p['imagens'][0]) : null;
        };

        $porCategoria = [];
        foreach ($prontas as $p) {
            $porCategoria[$p['categoriaSlug']] ??= ['nome' => $p['categoria'], 'slug' => $p['categoriaSlug'], 'n' => 0];
            $porCategoria[$p['categoriaSlug']]['n']++;
        }
        $categorias = array_values($porCategoria);
        usort($categorias, fn ($a, $b) => $b['n'] <=> $a['n']);
        $categorias = array_map(fn ($c) => [...$c, 'foto' => $fotoDe(fn ($p) => $p['categoriaSlug'] === $c['slug'])], array_slice($categorias, 0, 10));

        $marcas = [];
        foreach ($lista as $p) {
            $marcas[$p['marcaSlug']] ??= $p['marca'];
        }
        $marcas = array_values(array_filter(array_map(fn ($slug, $nome) => [
            'slug' => $slug, 'nome' => $nome, 'n' => count(F::umPorModelo(array_values(array_filter($prontas, fn ($p) => $p['marcaSlug'] === $slug)))), 'foto' => $fotoDe(fn ($p) => $p['marcaSlug'] === $slug),
        ], array_keys($marcas), $marcas), fn ($m) => $m['n'] > 0));
        usort($marcas, fn ($a, $b) => $b['n'] <=> $a['n']);

        $modelos = F::umPorModelo($prontas);
        $faixas = [];
        foreach (F::FAIXAS_PRECO as $valor => $f) {
            $n = count(array_filter($modelos, fn ($p) => $p['preco'] >= $f['min'] && $p['preco'] < $f['max']));
            if ($n > 0) {
                $faixas[] = ['valor' => $valor, 'rotulo' => $f['rotulo'], 'n' => $n];
            }
        }
        $cartoes = fn (array $l) => array_map(Loja::cartao(...), $l);

        return [
            'novidades' => $cartoes($novidades),
            'imperdiveis' => $cartoes($foraDaVitrine($todasImperdiveis)),
            'promocoes' => $cartoes($foraDaVitrine($todasPromocoes)),
            'ofertas' => [
                'imperdivel' => ['n' => count($todasImperdiveis), 'desconto' => $maiorDesconto($todasImperdiveis), 'fotos' => array_map(fn ($p) => $p['imagens'][0], array_slice($todasImperdiveis, 0, 2))],
                'promocoes' => ['n' => count($todasPromocoes), 'desconto' => $maiorDesconto($todasPromocoes), 'fotos' => array_map(fn ($p) => $p['imagens'][0], array_slice($todasPromocoes, 0, 2))],
                'maiorDesconto' => $maiorDesconto([...$todasImperdiveis, ...$todasPromocoes]),
            ],
            'modelos' => count($modelos),
            'categorias' => $categorias,
            'marcas' => $marcas,
            'faixas' => $faixas,
            'fotos' => [
                'banner.feminino' => $fotoDe(fn ($p) => $p['genero'] === 'feminino'),
                'banner.masculino' => $fotoDe(fn ($p) => $p['genero'] === 'masculino'),
                'banner.novidades' => $novidades[0]['imagens'][0] ?? null,
            ],
        ];
    }

    /**
     * Páginas da loja oferecidas na janela de link do editor.
     *
     * @return list<array{grupo: string, itens: list<array{rotulo: string, href: string}>}>
     */
    public function destinos(): array
    {
        $lista = $this->catalogo->lista();
        $unicos = function (string $slug, string $nome) use ($lista): array {
            $m = [];
            foreach ($lista as $p) {
                $m[$p[$slug]] = $p[$nome];
            }
            $col = new \Collator('pt_BR');
            uasort($m, fn ($a, $b) => $col->compare($a, $b));

            return $m;
        };

        return [
            ['grupo' => 'Catálogo', 'itens' => [
                ['rotulo' => 'Todas as peças', 'href' => '/catalogo'], ['rotulo' => 'Novidades', 'href' => '/catalogo?ordem=novidades'],
                ['rotulo' => 'Promoções', 'href' => '/catalogo?promo=1'], ['rotulo' => 'Maiores descontos', 'href' => '/catalogo?promo=1&ordem=desconto'],
                ['rotulo' => 'Imperdível', 'href' => '/catalogo?imperdivel=1'], ['rotulo' => 'Feminino', 'href' => '/catalogo?genero=feminino'],
                ['rotulo' => 'Masculino', 'href' => '/catalogo?genero=masculino'],
            ]],
            ['grupo' => 'Categorias', 'itens' => array_map(fn ($s, $r) => ['rotulo' => $r, 'href' => "/catalogo?categoria={$s}"], array_keys($c = $unicos('categoriaSlug', 'categoria')), $c)],
            ['grupo' => 'Marcas', 'itens' => array_map(fn ($s, $r) => ['rotulo' => $r, 'href' => "/catalogo?marca={$s}"], array_keys($m = $unicos('marcaSlug', 'marca')), $m)],
            ['grupo' => 'Preço', 'itens' => array_map(fn ($v, $f) => ['rotulo' => $f['rotulo'], 'href' => "/catalogo?preco={$v}"], array_keys(F::FAIXAS_PRECO), F::FAIXAS_PRECO)],
            ['grupo' => 'Conta do cliente', 'itens' => [
                ['rotulo' => 'Sacola', 'href' => '/sacola'], ['rotulo' => 'Minha conta', 'href' => '/minha-conta'], ['rotulo' => 'Favoritos', 'href' => '/minha-conta/favoritos'],
            ]],
        ];
    }
}
