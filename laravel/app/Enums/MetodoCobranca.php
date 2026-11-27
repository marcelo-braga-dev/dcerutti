<?php

namespace App\Enums;

/** Gerado de prisma/schema.prisma (enum MetodoCobranca). O valor é o que está gravado no banco. */
enum MetodoCobranca: string
{
    case Pix = 'pix';
    case Checkout = 'checkout';
}
