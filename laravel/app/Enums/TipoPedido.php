<?php

namespace App\Enums;

/** Gerado de prisma/schema.prisma (enum TipoPedido). O valor é o que está gravado no banco. */
enum TipoPedido: string
{
    case Compra = 'compra';
    case Condicional = 'condicional';
}
