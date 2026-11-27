<?php

namespace App\Support;

/** Porta de trechos de src/lib/pedido.ts. */
class Texto
{
    /** "1 peça", "2 peças" (C-04: sem "peça(s)"). */
    public static function plural(int $n, string $um, string $varios): string
    {
        return number_format($n, 0, ',', '.').' '.($n === 1 ? $um : $varios);
    }

    /** Q-05: motivo do cancelamento em palavras, do ponto de vista de quem lê. */
    public static function cancelamento(?string $motivo, bool $paraCliente): ?string
    {
        return match ($motivo) {
            'expirado' => $paraCliente ? 'Expirou sem confirmação' : 'Cancelado por prazo vencido',
            'cliente' => $paraCliente ? 'Cancelado por você' : 'Cancelado pela cliente',
            'equipe' => $paraCliente ? 'Cancelado pela loja' : 'Cancelado pela equipe',
            default => null,
        };
    }
}
