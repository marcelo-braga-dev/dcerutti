<?php

namespace App\Enums;

/** Gerado de prisma/schema.prisma (enum TipoCupom). O valor é o que está gravado no banco. */
enum TipoCupom: string
{
    case Percentual = 'percentual';
    case Valor = 'valor';
    case FreteGratis = 'freteGratis';
}
