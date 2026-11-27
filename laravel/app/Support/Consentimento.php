<?php

namespace App\Support;

use App\Models\Cliente;

/** Aceite de ofertas pelo WhatsApp (src/lib/pos-venda.ts → aceitaOfertas, consentimento). */
class Consentimento
{
    public static function aceita(?Cliente $c): bool
    {
        return (bool) $c?->aceitaOfertasEm && ! $c->descadastradaEm;
    }

    /**
     * Datas depois de marcar ou desmarcar a caixa. Marcar de novo renova o aceite e limpa o descadastro; desmarcar sem
     * nunca ter aceitado não muda nada.
     *
     * @return array<string, mixed>
     */
    public static function depois(?Cliente $atual, bool $marcado): array
    {
        if ($marcado) {
            return self::aceita($atual) ? [] : ['aceitaOfertasEm' => now(), 'descadastradaEm' => null];
        }

        return self::aceita($atual) ? ['descadastradaEm' => now()] : [];
    }
}
