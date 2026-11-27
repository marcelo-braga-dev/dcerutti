<?php

namespace App\Enums;

/** Gerado de prisma/schema.prisma (enum StatusPedido). O valor é o que está gravado no banco. */
enum StatusPedido: string
{
    case Pendente = 'pendente';
    case Confirmado = 'confirmado';
    case Cancelado = 'cancelado';
}
