<?php

namespace App\Enums;

/** Gerado de prisma/schema.prisma (enum StatusVitrine). O valor é o que está gravado no banco. */
enum StatusVitrine: string
{
    case Rascunho = 'rascunho';
    case Agendada = 'agendada';
    case NoAr = 'no_ar';
    case Publicada = 'publicada';
    case Encerrada = 'encerrada';
    case Arquivada = 'arquivada';
}
