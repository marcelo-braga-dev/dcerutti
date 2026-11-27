<?php

namespace App\Support;

use Normalizer;

/** Tamanhos, nomes e cores das peças (porta de trechos de src/lib/catalogo.ts e src/lib/cores.ts). */
class Pecas
{
    public const ORDEM_TAMANHOS = ['XP', 'PP', 'P', 'M', 'G', 'XG', 'GG', 'XXG', 'EXG', 'XGG', 'G1', 'G2', 'G3', 'UNI', 'U',
        '1', '2', '4', '6', '8', '10', '12', '14', '16', '34', '36', '38', '40', '42', '44', '46', '48', '50', '52', '54'];

    private const SUFIXO = '/\s+-\s+([^-]+)$/u';

    public static function posicaoTamanho(string $t): int
    {
        $i = array_search(mb_strtoupper($t), self::ORDEM_TAMANHOS, true);

        return $i === false ? 999 : $i;
    }

    public static function normalizarTamanho(string $t): string
    {
        $u = mb_strtoupper(trim($t));

        return in_array($u, ['UN', 'U', 'UNICO', 'ÚNICO'], true) ? 'UNI' : $u;
    }

    /** Sem acento, minúsculas, sem espaços nas pontas. */
    public static function normalizar(string $t): string
    {
        return trim(mb_strtolower((string) preg_replace('/\p{Mn}/u', '', (string) Normalizer::normalize($t, Normalizer::FORM_D))));
    }

    /** Nome sem a cor: "Bermuda Básica Chino". */
    public static function nomeDoModelo(string $nome): string
    {
        return trim((string) preg_replace(self::SUFIXO, '', $nome));
    }

    /** "Off White", "Jeans Medio"… do sufixo do nome ou do campo cor; null se não houver. */
    public static function nomeDaCor(string $nome, ?string $cor = null): ?string
    {
        $bruto = preg_match(self::SUFIXO, $nome, $m) ? trim($m[1]) : '';
        $bruto = $bruto !== '' ? $bruto : trim((string) $cor);
        if ($bruto === '') {
            return null;
        }
        $t = (string) preg_replace_callback('/(^|\s)\p{L}/u', fn ($x) => mb_strtoupper($x[0]), mb_strtolower($bruto));

        return (string) preg_replace('/\s+\d+$/', '', $t);
    }

    /** Peças com o mesmo nome-base, marca, categoria e gênero são cores do mesmo modelo. */
    public static function chaveDoModelo(string $nome, string $referencia, string $marcaSlug, string $categoriaSlug, string $genero): string
    {
        return preg_match(self::SUFIXO, $nome) ? "{$marcaSlug}|{$categoriaSlug}|{$genero}|".self::normalizar(self::nomeDoModelo($nome)) : "ref|{$referencia}";
    }
}
