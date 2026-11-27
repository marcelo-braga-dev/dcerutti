<?php

namespace App\Enums;

/** Gerado de prisma/schema.prisma (enum StatusCobranca). O valor é o que está gravado no banco. */
enum StatusCobranca: string
{
    case Criada = 'criada';
    case Pendente = 'pendente';
    case Aprovada = 'aprovada';
    case Recusada = 'recusada';
    case Expirada = 'expirada';
    case Cancelada = 'cancelada';
    case Estornada = 'estornada';
    case EstornadaParcial = 'estornada_parcial';
    case Contestada = 'contestada';
}
