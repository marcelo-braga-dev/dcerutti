<?php

namespace App\Enums;

/** Gerado de prisma/schema.prisma (enum TipoVitrine). O valor é o que está gravado no banco. */
enum TipoVitrine: string
{
    case Live = 'live';
    case Post = 'post';
    case Reels = 'reels';
    case Story = 'story';
}
