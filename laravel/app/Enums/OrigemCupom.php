<?php

namespace App\Enums;

/** Gerado de prisma/schema.prisma (enum OrigemCupom). O valor é o que está gravado no banco. */
enum OrigemCupom: string
{
    case Manual = 'manual';
    case PrimeiraCompra = 'primeiraCompra';
    case ProximaCompra = 'proximaCompra';
}
