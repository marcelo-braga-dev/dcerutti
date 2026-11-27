<?php

namespace App\Support;

use NumberFormatter;

/**
 * Dinheiro em centavos inteiros por dentro (src/lib/dinheiro.ts e src/lib/cupom.ts): a soma das partes bate com o
 * total. As colunas DECIMAL(10,2) chegam como texto ("89.90") e voltam como texto com duas casas.
 */
class Dinheiro
{
    public static function centavos(string|int|float|null $valor): int
    {
        return $valor === null ? 0 : (int) round(((float) $valor) * 100);
    }

    public static function decimal(int $centavos): string
    {
        return number_format($centavos / 100, 2, '.', '');
    }

    public static function numero(string|int|float|null $valor): ?float
    {
        return $valor === null ? null : round((float) $valor, 2);
    }

    /** 1259.7 → "R$ 1.259,70" (com espaço não separável, como o Intl do navegador). */
    public static function brl(string|int|float|null $valor): string
    {
        static $fmt = null;
        $fmt ??= new NumberFormatter('pt_BR', NumberFormatter::CURRENCY);

        return (string) $fmt->formatCurrency((float) ($valor ?? 0), 'BRL');
    }

    /**
     * Texto digitado ("1.259,70", "289,9", "289.90", "1.500") em número; NAN se inválido (src/lib/dinheiro.ts → lerValor).
     * Sem vírgula, ponto seguido de grupos de 3 dígitos é separador de milhar ("15.000" = 15000).
     */
    public static function lerValor(?string $texto): float
    {
        $t = (string) preg_replace('/[R$\s]/u', '', trim((string) $texto));
        if ($t === '') {
            return NAN;
        }
        $normal = str_contains($t, ',') || preg_match('/^-?\d{1,3}(\.\d{3})+$/', $t) ? str_replace(',', '.', str_replace('.', '', $t)) : $t;

        return preg_match('/^-?\d+(\.\d+)?$/', $normal) ? (float) $normal : NAN;
    }
}
