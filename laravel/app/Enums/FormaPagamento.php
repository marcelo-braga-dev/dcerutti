<?php

namespace App\Enums;

/** Gerado de prisma/schema.prisma (enum FormaPagamento). O valor é o que está gravado no banco. */
enum FormaPagamento: string
{
    case Pix = 'pix';
    case Debito = 'debito';
    case Credito = 'credito';
    case Dinheiro = 'dinheiro';
    case MercadoPago = 'mercado_pago';
}
