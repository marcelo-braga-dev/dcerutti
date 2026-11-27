<?php

namespace App\Enums;

/** Gerado de prisma/schema.prisma (enum EtapaAtendimento). O valor é o que está gravado no banco. */
enum EtapaAtendimento: string
{
    case Novo = 'novo';
    case EmConversa = 'em_conversa';
    case Proposta = 'proposta';
    case AguardandoPagamento = 'aguardando_pagamento';
    case Ganho = 'ganho';
    case Perdido = 'perdido';
}
