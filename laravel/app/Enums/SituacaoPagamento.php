<?php

namespace App\Enums;

/** Gerado de prisma/schema.prisma (enum SituacaoPagamento). O valor é o que está gravado no banco. */
enum SituacaoPagamento: string
{
    case ACombinar = 'a_combinar';
    case Aguardando = 'aguardando';
    case Pago = 'pago';
    case Estornado = 'estornado';
}
