<?php

namespace App\Enums;

/** Gerado de prisma/schema.prisma (enum SituacaoEntrega). O valor é o que está gravado no banco. */
enum SituacaoEntrega: string
{
    case ACombinar = 'a_combinar';
    case Separando = 'separando';
    case Enviado = 'enviado';
    case Entregue = 'entregue';
}
