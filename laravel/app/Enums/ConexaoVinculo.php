<?php

namespace App\Enums;

/** Gerado de prisma/schema.prisma (enum ConexaoVinculo). O valor é o que está gravado no banco. */
enum ConexaoVinculo: string
{
    case Aguardando = 'aguardando';
    case Conectado = 'conectado';
}
