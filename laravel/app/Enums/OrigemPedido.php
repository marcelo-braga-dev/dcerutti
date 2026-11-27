<?php

namespace App\Enums;

/** Gerado de prisma/schema.prisma (enum OrigemPedido). O valor é o que está gravado no banco. */
enum OrigemPedido: string
{
    case Loja = 'loja';
    case Vendedor = 'vendedor';
    case Balcao = 'balcao';
}
