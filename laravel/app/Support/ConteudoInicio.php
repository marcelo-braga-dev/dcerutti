<?php

namespace App\Support;

/**
 * Conteúdo editável da página inicial (src/lib/conteudo-inicio.ts; constantes geradas de lá). Só o que o gestor mudou fica
 * gravado (chave `inicio` da configuração); o resto segue o padrão.
 */
class ConteudoInicio
{
    public const TEXTOS = [
        'banner.selo' => 'Estoque pronto em {cidade} (SC)',
        'banner.titulo' => 'O básico',
        'banner.destaque' => 'aconchego',
        'banner.texto' => 'Peças Hering e John John para o dia a dia. Monte sua sacola, envie pelo WhatsApp e, em {cidade}, prove em casa antes de pagar.',
        'banner.botao1' => 'Ver novidades',
        'banner.botao2' => 'Promoções',
        'banner.feminino' => 'Feminino',
        'banner.masculino' => 'Masculino',
        'banner.novidades' => 'Novidades',
        'confianca.1.titulo' => 'Prove em casa',
        'confianca.1.texto' => 'Condicional em {cidade}: pague só o que ficar.',
        'confianca.2.titulo' => 'Atendimento humano',
        'confianca.2.texto' => 'Uma pessoa da loja cuida do seu pedido no WhatsApp.',
        'confianca.3.titulo' => 'Peças originais',
        'confianca.3.texto' => 'Hering, Hering Sports, Intimates e John John.',
        'confianca.4.titulo' => 'Pronta-entrega',
        'confianca.4.texto' => '{frete}',
        'categorias.sobre' => 'Comece por aqui',
        'categorias.titulo' => 'Compre por categoria',
        'novidades.sobre' => 'Acabou de chegar',
        'novidades.titulo' => 'Novidades',
        'ofertas.imperdivel.sobre' => 'Preço de ocasião',
        'ofertas.imperdivel.titulo' => 'Imperdível',
        'ofertas.imperdivel.texto' => 'Peças selecionadas com o menor preço da loja. Quando acabam, não voltam.',
        'ofertas.promocoes.sobre' => 'Por tempo limitado',
        'ofertas.promocoes.titulo' => 'Promoções',
        'ofertas.promocoes.texto' => 'Modelos com desconto, com o estoque pronto para você.',
        'ofertas.botao' => 'Aproveitar',
        'imperdivel.sobre' => 'Preço de ocasião',
        'imperdivel.titulo' => 'Imperdível',
        'condicional.sobre' => 'Condicional em {cidade}',
        'condicional.titulo' => 'Prove em casa,',
        'condicional.destaque' => 'pague só o que ficar',
        'condicional.texto' => 'Escolha as peças, receba em casa e devolva o que não servir. Sem pressa e sem custo para provar.',
        'condicional.botao' => 'Montar minha sacola',
        'condicional.1.titulo' => 'Monte sua sacola',
        'condicional.1.texto' => 'Escolha as peças e os tamanhos no catálogo.',
        'condicional.2.titulo' => 'Envie pelo WhatsApp',
        'condicional.2.texto' => 'A mensagem vai pronta para quem te atende.',
        'condicional.3.titulo' => 'Receba e prove',
        'condicional.3.texto' => 'Experimente com calma, no seu tempo.',
        'condicional.4.titulo' => 'Pague só o que ficar',
        'condicional.4.texto' => 'O resto volta para a loja, sem custo.',
        'promocoes.sobre' => 'Por tempo limitado',
        'promocoes.titulo' => 'Promoções',
        'precos.sobre' => 'Cabe no bolso',
        'precos.titulo' => 'Compre por preço',
        'marcas.sobre' => 'Originais',
        'marcas.titulo' => 'Marcas da loja',
    ];

    public const IMAGENS = [
        0 => 'banner.feminino',
        1 => 'banner.masculino',
        2 => 'banner.novidades',
    ];

    public const LINKS = [
        'banner.botao1' => '/catalogo?ordem=novidades',
        'banner.botao2' => '/catalogo?promo=1',
        'banner.feminino' => '/catalogo?genero=feminino',
        'banner.masculino' => '/catalogo?genero=masculino',
        'banner.novidades' => '/catalogo?ordem=novidades',
        'confianca.1' => '',
        'confianca.2' => '',
        'confianca.3' => '',
        'confianca.4' => '',
        'categorias.link' => '/catalogo',
        'novidades.link' => '/catalogo?ordem=novidades',
        'ofertas.imperdivel' => '/catalogo?imperdivel=1',
        'ofertas.promocoes' => '/catalogo?promo=1&ordem=desconto',
        'imperdivel.link' => '/catalogo?imperdivel=1',
        'condicional.botao' => '/catalogo',
        'promocoes.link' => '/catalogo?promo=1&ordem=desconto',
    ];

    public const SECOES = [
        0 => 'confianca',
        1 => 'categorias',
        2 => 'novidades',
        3 => 'ofertas',
        4 => 'imperdivel',
        5 => 'condicional',
        6 => 'promocoes',
        7 => 'precos',
        8 => 'marcas',
    ];

    public const LIMITE_TEXTO = 300;

    public const LIMITE_LINK = 500;

    /** Foto enviada pelo editor da página inicial. */
    public const URL_FOTO = '#^/arquivos/paginas/inicio-[\w.-]+\.webp$#';

    /** Destino padrão de um botão ou card; null se o campo não existe. Cards de categoria, preço e marca trazem o filtro. */
    public static function linkPadrao(string $campo): ?string
    {
        if (array_key_exists($campo, self::LINKS)) {
            return self::LINKS[$campo];
        }

        return preg_match('/^(categoria|preco|marca)\.([\w-]{1,80})$/', $campo, $m) ? "/catalogo?{$m[1]}={$m[2]}" : null;
    }

    /** Aceita caminho da loja, http(s), mailto e tel. Barra invertida e `//` poderiam levar a outro site. */
    public static function linkValido(mixed $v): bool
    {
        if (! is_string($v) || $v === '' || strlen($v) > self::LIMITE_LINK || preg_match('/[\s\\\\\p{Cc}]/u', $v)) {
            return false;
        }
        if (str_starts_with($v, '/')) {
            return ! str_starts_with($v, '//');
        }
        if (preg_match('/^(mailto|tel):./i', $v)) {
            return true;
        }

        return (bool) preg_match('#^https?://#i', $v) && filter_var($v, FILTER_VALIDATE_URL) !== false;
    }

    /**
     * Junta o que veio do editor com o padrão e guarda só o que é diferente dele (texto vazio volta ao padrão).
     *
     * @param  array{textos?: mixed, imagens?: mixed, links?: mixed, ocultas?: mixed}  $c
     * @return array{textos: array<string, string>, imagens: array<string, string>, links: array<string, string>, ocultas: list<string>}
     */
    public static function normalizar(array $c): array
    {
        $textos = [];
        foreach (self::TEXTOS as $campo => $padrao) {
            $v = $c['textos'][$campo] ?? null;
            $v = is_string($v) ? trim((string) preg_replace('/\s+/u', ' ', $v)) : '';
            if ($v !== '' && $v !== $padrao) {
                $textos[$campo] = mb_substr($v, 0, self::LIMITE_TEXTO);
            }
        }
        $imagens = [];
        foreach (self::IMAGENS as $campo) {
            if (! empty($c['imagens'][$campo]) && is_string($c['imagens'][$campo])) {
                $imagens[$campo] = $c['imagens'][$campo];
            }
        }
        $links = [];
        foreach ((array) ($c['links'] ?? []) as $campo => $v) {
            $padrao = self::linkPadrao((string) $campo);
            if ($padrao !== null && self::linkValido($v) && $v !== $padrao) {
                $links[$campo] = $v;
            }
        }
        $ocultas = array_values(array_filter(self::SECOES, fn ($s) => in_array($s, (array) ($c['ocultas'] ?? []), true)));

        return ['textos' => $textos, 'imagens' => $imagens, 'links' => $links, 'ocultas' => $ocultas];
    }
}
