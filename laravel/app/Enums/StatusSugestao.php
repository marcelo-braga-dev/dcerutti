<?php

namespace App\Enums;

/** Gerado de prisma/schema.prisma (enum StatusSugestao). O valor é o que está gravado no banco. */
enum StatusSugestao: string
{
    case Enviada = 'enviada';
    case Vista = 'vista';
    case Respondida = 'respondida';
    case Convertida = 'convertida';
    case Cancelada = 'cancelada';
}
