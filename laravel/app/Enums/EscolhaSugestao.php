<?php

namespace App\Enums;

/** Gerado de prisma/schema.prisma (enum EscolhaSugestao). O valor é o que está gravado no banco. */
enum EscolhaSugestao: string
{
    case Pendente = 'pendente';
    case Quero = 'quero';
    case Talvez = 'talvez';
    case Nao = 'nao';
}
