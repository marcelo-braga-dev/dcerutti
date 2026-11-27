<?php

namespace App\Enums;

/** Gerado de prisma/schema.prisma (enum SituacaoItem). O valor é o que está gravado no banco. */
enum SituacaoItem: string
{
    case Pendente = 'pendente';
    case Vendido = 'vendido';
    case Devolvido = 'devolvido';
}
