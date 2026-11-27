<?php

namespace App\Enums;

/** Gerado de prisma/schema.prisma (enum TipoPosVenda). O valor é o que está gravado no banco. */
enum TipoPosVenda: string
{
    case Entrega = 'entrega';
    case Satisfacao = 'satisfacao';
    case Sugestao = 'sugestao';
    case Reativacao = 'reativacao';
}
