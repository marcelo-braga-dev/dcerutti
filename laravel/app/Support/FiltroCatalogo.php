<?php

namespace App\Support;

use Collator;

/**
 * Filtros, ordem e contagens do catálogo da loja (porta de src/lib/catalogo.ts → lerFiltros, filtrarCatalogo).
 * Trabalha sobre a lista em cache de App\Services\Catalogo. As mesmas regras ficam em resources/js/lib/catalogo.ts,
 * que monta as URLs e os rótulos na tela.
 */
class FiltroCatalogo
{
    public const POR_PAGINA = 24;

    public const GENEROS = ['feminino' => 'Feminino', 'masculino' => 'Masculino', 'unissex' => 'Unissex'];

    public const ESTACOES = ['inverno' => 'Inverno', 'verao' => 'Verão'];

    public const ORDENS = ['relevancia', 'novidades', 'menor-preco', 'maior-preco', 'desconto'];

    /** @var array<string, array{rotulo: string, min: float, max: float}> */
    public const FAIXAS_PRECO = [
        'ate-50' => ['rotulo' => 'Até R$ 50', 'min' => 0, 'max' => 50],
        '50-100' => ['rotulo' => 'R$ 50 a 100', 'min' => 50, 'max' => 100],
        '100-200' => ['rotulo' => 'R$ 100 a 200', 'min' => 100, 'max' => 200],
        'acima-200' => ['rotulo' => 'Acima de R$ 200', 'min' => 200, 'max' => INF],
    ];

    /** Grupos de categoria do filtro, pelo nome sem acento. Categoria nova cai em "Outros". */
    public const GRUPOS_CATEGORIA = [
        'Parte de cima' => ['camisetas', 'camisas', 'camisas polo', 'blusas', 'regatas', 'tops', 'bodies', 'tricos', 'sueteres', 'moletons', 'jaquetas', 'blazers', 'casacos', 'coletes', 'batas'],
        'Parte de baixo' => ['calcas', 'bermudas', 'shorts', 'saias', 'leggings'],
        'Vestidos e macacões' => ['vestidos', 'macacoes'],
        'Íntimas e pijamas' => ['cuecas', 'sutias', 'calcinhas', 'ceroulas', 'roupas intimas', 'pijamas', 'meias'],
        'Acessórios e kits' => ['acessorios', 'cintos', 'gorros', 'lencos', 'necessaires', 'malas', 'bones', 'kits'],
    ];

    public const VAZIOS = [
        'marca' => null, 'genero' => null, 'categoria' => null, 'tamanho' => null, 'preco' => null, 'promo' => false, 'imperdivel' => false,
        'estacao' => null, 'estoque' => 'todos', 'q' => '', 'ordem' => 'relevancia', 'pagina' => 1,
    ];

    /** @param array<string, mixed> $p @return array<string, mixed> */
    public static function ler(array $p): array
    {
        $um = fn (string $k) => is_array($p[$k] ?? null) ? (string) ($p[$k][0] ?? '') : (string) ($p[$k] ?? '');
        $pagina = (int) $um('pagina');
        $tamanho = $um('tamanho');
        $estoque = $um('estoque');

        return [
            'marca' => $um('marca') ?: null,
            'genero' => isset(self::GENEROS[$um('genero')]) ? $um('genero') : null,
            'categoria' => $um('categoria') ?: null,
            'tamanho' => $tamanho !== '' ? mb_substr(Pecas::normalizarTamanho($tamanho), 0, 8) : null,
            'preco' => isset(self::FAIXAS_PRECO[$um('preco')]) ? $um('preco') : null,
            'promo' => $um('promo') === '1',
            'imperdivel' => $um('imperdivel') === '1',
            'estacao' => isset(self::ESTACOES[$um('estacao')]) ? $um('estacao') : null,
            'estoque' => in_array($estoque, ['disponiveis', 'esgotados'], true) ? $estoque : 'todos',
            'q' => mb_substr($um('q'), 0, 80),
            'ordem' => in_array($um('ordem'), self::ORDENS, true) ? $um('ordem') : 'relevancia',
            'pagina' => $pagina > 0 && $pagina < 100 ? $pagina : 1,
        ];
    }

    /** @param array<string, mixed> $p */
    public static function emEstoque(array $p): bool
    {
        foreach ($p['variantes'] as $v) {
            if ($v['disponivel'] > 0) {
                return true;
            }
        }

        return false;
    }

    /** Promoção comum (o "Imperdível" tem destaque próprio). @param array<string, mixed> $p */
    public static function emPromocao(array $p): bool
    {
        return ! $p['imperdivel'] && $p['precoCheio'] > 0 && $p['preco'] < $p['precoCheio'];
    }

    public static function grupoDaCategoria(string $nome): string
    {
        $n = Pecas::normalizar($nome);
        foreach (self::GRUPOS_CATEGORIA as $rotulo => $nomes) {
            if (in_array($n, $nomes, true)) {
                return $rotulo;
            }
        }

        return 'Outros';
    }

    /** @return list<string> */
    public static function termos(string $q): array
    {
        return array_values(array_filter(preg_split('/\s+/u', Pecas::normalizar($q)) ?: [], fn ($t) => $t !== ''));
    }

    /** @param array<string, mixed> $p @param list<string> $termos */
    public static function casaBusca(array $p, array $termos): bool
    {
        if (! $termos) {
            return true;
        }
        $alvo = Pecas::normalizar("{$p['nome']} {$p['referencia']} {$p['categoria']} ".($p['cor'] ?? ''));
        foreach ($termos as $t) {
            if (! str_contains($alvo, $t)) {
                return false;
            }
        }

        return true;
    }

    /** @param array<string, mixed> $p */
    public static function modeloDe(array $p): string
    {
        return $p['modelo'] ?? "ref|{$p['referencia']}";
    }

    /**
     * Fica a primeira cor de cada modelo, na ordem já definida.
     *
     * @param  list<array<string, mixed>>  $lista
     * @return list<array<string, mixed>>
     */
    public static function umPorModelo(array $lista): array
    {
        $vistos = [];
        $r = [];
        foreach ($lista as $p) {
            $k = self::modeloDe($p);
            if (! isset($vistos[$k])) {
                $vistos[$k] = true;
                $r[] = $p;
            }
        }

        return $r;
    }

    /**
     * Alterna as categorias (uma de cada por vez, na ordem em que aparecem), para a vitrine não repetir a mesma em fila.
     *
     * @template T
     *
     * @param  list<T>  $itens
     * @param  callable(T): string  $chave
     * @return list<T>
     */
    public static function intercalar(array $itens, callable $chave): array
    {
        $filas = [];
        foreach ($itens as $x) {
            $filas[$chave($x)][] = $x;
        }
        $r = [];
        for ($i = 0; count($r) < count($itens); $i++) {
            foreach ($filas as $l) {
                if ($i < count($l)) {
                    $r[] = $l[$i];
                }
            }
        }

        return $r;
    }

    /** @param list<array<string, mixed>> $l */
    private static function contarModelos(array $l): int
    {
        return count(array_unique(array_map(self::modeloDe(...), $l)));
    }

    private static function naFaixa(float $preco, string $faixa): bool
    {
        $f = self::FAIXAS_PRECO[$faixa];

        return $preco >= $f['min'] && $preco < $f['max'];
    }

    /** @param array<string, mixed> $p */
    private static function desconto(array $p): float
    {
        return $p['precoCheio'] > $p['preco'] ? 1 - $p['preco'] / $p['precoCheio'] : 0;
    }

    /**
     * Aplica os filtros, ordena e conta as opções de cada filtro (com todos os outros aplicados, menos o do próprio grupo).
     *
     * @param  list<array<string, mixed>>  $lista
     * @param  array<string, mixed>  $f
     * @return array{produtos: list<array<string, mixed>>, total: int, temMais: bool, contagens: array<string, mixed>}
     */
    public static function filtrar(array $lista, array $f): array
    {
        $f = [...self::VAZIOS, ...$f];
        $termos = self::termos($f['q']);
        $temTamanho = function (array $p, string $t): bool {
            foreach ($p['variantes'] as $v) {
                if ($v['disponivel'] > 0 && Pecas::normalizarTamanho($v['tamanho']) === $t) {
                    return true;
                }
            }

            return false;
        };
        $regras = [
            'marca' => fn ($p) => ! $f['marca'] || $p['marcaSlug'] === $f['marca'],
            'genero' => fn ($p) => ! $f['genero'] || $p['genero'] === $f['genero'],
            'categoria' => fn ($p) => ! $f['categoria'] || $p['categoriaSlug'] === $f['categoria'],
            'tamanho' => fn ($p) => ! $f['tamanho'] || $temTamanho($p, $f['tamanho']),
            'preco' => fn ($p) => ! $f['preco'] || self::naFaixa($p['preco'], $f['preco']),
            'promo' => fn ($p) => ! $f['promo'] || self::emPromocao($p),
            'imperdivel' => fn ($p) => ! $f['imperdivel'] || $p['imperdivel'],
            'estacao' => fn ($p) => ! $f['estacao'] || $p['estacao'] === $f['estacao'],
            'estoque' => fn ($p) => $f['estoque'] === 'todos' || ($f['estoque'] === 'disponiveis' ? self::emEstoque($p) : ! self::emEstoque($p)),
        ];
        $daBusca = $termos ? array_values(array_filter($lista, fn ($p) => self::casaBusca($p, $termos))) : $lista;
        /** Peças que passam em todos os filtros, menos os indicados. */
        $sem = function (string ...$fora) use ($daBusca, $regras): array {
            return array_values(array_filter($daBusca, function ($p) use ($fora, $regras) {
                foreach ($regras as $k => $regra) {
                    if (! in_array($k, $fora, true) && ! $regra($p)) {
                        return false;
                    }
                }

                return true;
            }));
        };

        $resultado = $sem();
        $comFoto = fn ($p) => count($p['imagens']) > 0;
        if ($f['ordem'] === 'menor-preco') {
            usort($resultado, fn ($a, $b) => $a['preco'] <=> $b['preco']);
        } elseif ($f['ordem'] === 'maior-preco') {
            usort($resultado, fn ($a, $b) => $b['preco'] <=> $a['preco']);
        } elseif ($f['ordem'] === 'desconto') {
            usort($resultado, fn ($a, $b) => (self::desconto($b) <=> self::desconto($a)) ?: ($a['preco'] <=> $b['preco']));
        } else {
            $novos = $resultado;
            usort($novos, fn ($a, $b) => $b['id'] <=> $a['id']);
            if ($f['ordem'] === 'novidades') {
                $resultado = $novos;
            } else {
                // Peça pronta (estoque e foto) primeiro; entre elas, mais tamanhos e mais fotos antes. Empate: a mais nova.
                $nota = fn ($p) => min(count(array_filter($p['variantes'], fn ($v) => $v['disponivel'] > 0)), 5) * 2 + min(count($p['imagens']), 3);
                $pronta = fn ($p) => self::emEstoque($p) && $comFoto($p);
                $prontas = array_values(array_filter($novos, $pronta));
                usort($prontas, fn ($a, $b) => $nota($b) <=> $nota($a));
                $resto = array_values(array_filter($novos, fn ($p) => ! $pronta($p)));
                usort($resto, fn ($a, $b) => (int) self::emEstoque($b) <=> (int) self::emEstoque($a));
                $resultado = [...($termos || $f['categoria'] ? $prontas : self::intercalar($prontas, fn ($p) => $p['categoriaSlug'])), ...$resto];
            }
        }
        // Em qualquer ordem, peça sem foto vai para o fim (a planilha de estoque cria produtos sem foto).
        if ($f['ordem'] !== 'relevancia') {
            $resultado = [...array_filter($resultado, $comFoto), ...array_filter($resultado, fn ($p) => ! $comFoto($p))];
        }
        $resultado = self::umPorModelo(array_values($resultado));

        $contar = function (array $itens, callable $chave, callable $rotulo): array {
            $m = [];
            foreach ($itens as $x) {
                foreach ((array) $chave($x) as $k) {
                    $m[$k] ??= ['valor' => (string) $k, 'rotulo' => $rotulo((string) $k, $x), 'modelos' => []];
                    $m[$k]['modelos'][self::modeloDe($x)] = true;
                }
            }

            return array_values(array_map(fn ($c) => ['valor' => $c['valor'], 'rotulo' => $c['rotulo'], 'n' => count($c['modelos'])], $m));
        };
        $comEscolhida = fn (array $cs, ?string $escolhida, callable $rotulo) => $escolhida !== null && ! in_array($escolhida, array_column($cs, 'valor'), true)
            ? [...$cs, ['valor' => $escolhida, 'rotulo' => $rotulo($escolhida), 'n' => 0]] : $cs;
        $porN = fn (array $cs) => self::ordenar($cs, fn ($a, $b) => $b['n'] <=> $a['n']);
        $col = new Collator('pt_BR');

        $semEstoque = $sem('estoque');
        $limite = $f['pagina'] * self::POR_PAGINA;
        $categorias = array_map(fn ($c) => [...$c, 'grupo' => self::grupoDaCategoria($c['rotulo'])],
            $comEscolhida($contar($sem('categoria'), fn ($p) => $p['categoriaSlug'], fn ($k, $p) => $p['categoria']), $f['categoria'], fn ($k) => $k));
        $categorias = self::ordenar($categorias, fn ($a, $b) => ($b['n'] <=> $a['n']) ?: $col->compare($a['rotulo'], $b['rotulo']));
        $tamanhos = $comEscolhida($contar($sem('tamanho'), fn ($p) => array_values(array_unique(array_map(fn ($v) => Pecas::normalizarTamanho($v['tamanho']), array_filter($p['variantes'], fn ($v) => $v['disponivel'] > 0)))), fn ($k) => $k), $f['tamanho'], fn ($k) => $k);
        $tamanhos = self::ordenar($tamanhos, fn ($a, $b) => (Pecas::posicaoTamanho($a['valor']) <=> Pecas::posicaoTamanho($b['valor'])) ?: strnatcmp($a['valor'], $b['valor']));
        $precos = [];
        foreach (self::FAIXAS_PRECO as $valor => $x) {
            $n = self::contarModelos(array_filter($sem('preco'), fn ($p) => self::naFaixa($p['preco'], $valor)));
            if ($n > 0 || $valor === $f['preco']) {
                $precos[] = ['valor' => $valor, 'rotulo' => $x['rotulo'], 'n' => $n];
            }
        }
        $estacoes = [];
        foreach (self::ESTACOES as $valor => $rotulo) {
            $n = self::contarModelos(array_filter($sem('estacao'), fn ($p) => $p['estacao'] === $valor));
            if ($n > 0 || $valor === $f['estacao']) {
                $estacoes[] = ['valor' => $valor, 'rotulo' => $rotulo, 'n' => $n];
            }
        }

        return [
            'produtos' => array_slice($resultado, 0, $limite),
            'total' => count($resultado),
            'temMais' => count($resultado) > $limite,
            'contagens' => [
                'marcas' => $porN($comEscolhida($contar($sem('marca'), fn ($p) => $p['marcaSlug'], fn ($k, $p) => $p['marca']), $f['marca'], fn ($k) => $k)),
                'generos' => $porN($comEscolhida($contar($sem('genero'), fn ($p) => $p['genero'], fn ($k) => self::GENEROS[$k] ?? $k), $f['genero'], fn ($k) => $k)),
                'categorias' => $categorias,
                'tamanhos' => $tamanhos,
                'precos' => $precos,
                'estacoes' => $estacoes,
                'promo' => self::contarModelos(array_filter($sem('promo'), self::emPromocao(...))),
                'imperdivel' => self::contarModelos(array_filter($sem('imperdivel'), fn ($p) => $p['imperdivel'])),
                'disponiveis' => self::contarModelos(array_filter($semEstoque, self::emEstoque(...))),
                'esgotados' => self::contarModelos(array_filter($semEstoque, fn ($p) => ! self::emEstoque($p))),
            ],
        ];
    }

    /** @template T @param list<T> $l @return list<T> */
    private static function ordenar(array $l, callable $cmp): array
    {
        usort($l, $cmp);

        return $l;
    }
}
