<?php

namespace App\Enums;

/** Gerado de prisma/schema.prisma (enum CanalAtendimento). O valor é o que está gravado no banco. */
enum CanalAtendimento: string
{
    case Whatsapp = 'whatsapp';
    case Instagram = 'instagram';
    case Loja = 'loja';
    case LinkPeca = 'link_peca';
    case Vitrine = 'vitrine';
    case Live = 'live';
    case Indicacao = 'indicacao';
    case Outro = 'outro';
}
