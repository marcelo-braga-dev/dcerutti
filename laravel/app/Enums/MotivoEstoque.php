<?php

namespace App\Enums;

/** Gerado de prisma/schema.prisma (enum MotivoEstoque). O valor é o que está gravado no banco. */
enum MotivoEstoque: string
{
    case Entrada = 'entrada';
    case Ajuste = 'ajuste';
    case Venda = 'venda';
    case Estorno = 'estorno';
}
