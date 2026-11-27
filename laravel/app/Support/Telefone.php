<?php

namespace App\Support;

/** Porta de src/lib/telefone.ts. */
class Telefone
{
    public static function digitos(?string $v): string
    {
        return (string) preg_replace('/\D/', '', (string) $v);
    }

    /** Máscara progressiva: "49999980637" → "(49) 99998-0637". */
    public static function formatar(string $v): string
    {
        $d = substr(self::digitos($v), 0, 11);
        if (strlen($d) <= 2) {
            return $d;
        }
        $corte = strlen($d) > 10 ? 7 : 6;
        if (strlen($d) <= $corte) {
            return '('.substr($d, 0, 2).') '.substr($d, 2);
        }

        return '('.substr($d, 0, 2).') '.substr($d, 2, $corte - 2).'-'.substr($d, $corte);
    }

    /** RN-02: DDD + 9 dígitos. */
    public static function celularValido(?string $v): bool
    {
        return strlen(self::digitos($v)) === 11;
    }

    public static function formatarCep(string $v): string
    {
        $d = substr(self::digitos($v), 0, 8);

        return strlen($d) > 5 ? substr($d, 0, 5).'-'.substr($d, 5) : $d;
    }
}
