<?php

namespace App\Enums;

/** Gerado de prisma/schema.prisma (enum Papel). O valor é o que está gravado no banco. */
enum Papel: string
{
    case Cliente = 'cliente';
    case Vendedor = 'vendedor';
    case Gestor = 'gestor';
}
