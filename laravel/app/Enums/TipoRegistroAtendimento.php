<?php

namespace App\Enums;

/** Gerado de prisma/schema.prisma (enum TipoRegistroAtendimento). O valor é o que está gravado no banco. */
enum TipoRegistroAtendimento: string
{
    case Nota = 'nota';
    case ContatoWhatsapp = 'contato_whatsapp';
    case ContatoDirect = 'contato_direct';
    case Etapa = 'etapa';
    case Transferencia = 'transferencia';
    case Pedido = 'pedido';
    case EnvioPeca = 'envio_peca';
}
