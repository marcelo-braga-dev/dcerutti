<?php

namespace App\Support;

use Carbon\CarbonImmutable;
use DateTimeInterface;

/**
 * Datas do negócio no fuso America/Sao_Paulo (RN-12; src/lib/datas.ts). No banco tudo é UTC.
 */
class Datas
{
    public const FUSO = 'America/Sao_Paulo';

    /** "2026-09-27" no fuso de São Paulo. */
    public static function dia(?DateTimeInterface $d = null): string
    {
        return CarbonImmutable::instance($d ?? now())->setTimezone(self::FUSO)->format('Y-m-d');
    }

    /** "2026-09" no fuso de São Paulo. */
    public static function mes(?DateTimeInterface $d = null): string
    {
        return CarbonImmutable::instance($d ?? now())->setTimezone(self::FUSO)->format('Y-m');
    }

    public static function inicioDoDia(string $dia): CarbonImmutable
    {
        return CarbonImmutable::parse("{$dia} 00:00:00.000", self::FUSO)->utc();
    }

    public static function fimDoDia(string $dia): CarbonImmutable
    {
        return CarbonImmutable::parse("{$dia} 23:59:59.999", self::FUSO)->utc();
    }

    /** "14/10/2026". */
    public static function formatar(DateTimeInterface $d): string
    {
        return CarbonImmutable::instance($d)->setTimezone(self::FUSO)->format('d/m/Y');
    }

    public static function mesValido(mixed $ym): bool
    {
        return is_string($ym) && preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $ym) === 1;
    }

    public static function somarMeses(string $ym, int $n): string
    {
        [$a, $m] = array_map('intval', explode('-', $ym));
        $t = $a * 12 + ($m - 1) + $n;

        return intdiv($t, 12).'-'.str_pad((string) ($t % 12 + 1), 2, '0', STR_PAD_LEFT);
    }

    /** [início, fim) do mês em UTC, para consultas. @return array{0: CarbonImmutable, 1: CarbonImmutable} */
    public static function intervaloDoMes(string $ym): array
    {
        return [self::inicioDoDia("{$ym}-01"), self::inicioDoDia(self::somarMeses($ym, 1).'-01')];
    }

    /** "2026-09-28": o dia de hoje em São Paulo somado de `n` dias. */
    public static function somarDiaIso(int $n): string
    {
        return CarbonImmutable::now(self::FUSO)->addDays($n)->format('Y-m-d');
    }
}
