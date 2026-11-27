<?php

namespace App\Enums;

/** Gerado de prisma/schema.prisma (enum QuemAplica). O valor é o que está gravado no banco. */
enum QuemAplica: string
{
    case Cliente = 'cliente';
    case Equipe = 'equipe';
    case Ambos = 'ambos';
}
