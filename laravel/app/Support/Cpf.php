<?php

namespace App\Support;

/** Porta de src/lib/cpf.ts. */
class Cpf
{
    public static function formatar(string $v): string
    {
        $d = substr(Telefone::digitos($v), 0, 11);

        return strlen($d) === 11 ? substr($d, 0, 3).'.'.substr($d, 3, 3).'.'.substr($d, 6, 3).'-'.substr($d, 9) : $d;
    }

    /** 11 dígitos e os dois verificadores certos (recusa sequências como 111.111.111-11). */
    public static function valido(?string $v): bool
    {
        $d = Telefone::digitos($v);
        if (strlen($d) !== 11 || preg_match('/^(\d)\1{10}$/', $d)) {
            return false;
        }
        $dv = function (int $n) use ($d) {
            $soma = 0;
            for ($i = 0; $i < $n; $i++) {
                $soma += (int) $d[$i] * ($n + 1 - $i);
            }
            $r = ($soma * 10) % 11;

            return $r === 10 ? 0 : $r;
        };

        return $dv(9) === (int) $d[9] && $dv(10) === (int) $d[10];
    }
}
