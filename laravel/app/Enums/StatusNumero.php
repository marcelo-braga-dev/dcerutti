<?php

namespace App\Enums;

/** Gerado de prisma/schema.prisma (enum StatusNumero). O valor é o que está gravado no banco. */
enum StatusNumero: string
{
    case Ativo = 'ativo';
    case Pausado = 'pausado';
    case Desativado = 'desativado';
}
