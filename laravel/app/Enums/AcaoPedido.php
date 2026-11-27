<?php

namespace App\Enums;

/** Gerado de prisma/schema.prisma (enum AcaoPedido). O valor é o que está gravado no banco. */
enum AcaoPedido: string
{
    case Criado = 'criado';
    case Editado = 'editado';
    case Confirmado = 'confirmado';
    case Cancelado = 'cancelado';
}
