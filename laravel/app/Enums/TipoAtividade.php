<?php

namespace App\Enums;

/** Gerado de prisma/schema.prisma (enum TipoAtividade). O valor é o que está gravado no banco. */
enum TipoAtividade: string
{
    case Login = 'login';
    case Acesso = 'acesso';
    case Pagina = 'pagina';
    case Produto = 'produto';
    case Busca = 'busca';
    case Filtro = 'filtro';
    case Tamanho = 'tamanho';
    case Sacola = 'sacola';
    case Cupom = 'cupom';
    case Whatsapp = 'whatsapp';
}
