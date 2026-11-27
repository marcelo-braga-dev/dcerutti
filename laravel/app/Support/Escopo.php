<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/** Escopo do vendedor (src/lib/escopo.ts): a vendedora vê o que é dela; o gestor vê tudo (docs/06). */
class Escopo
{
    public static function vendedor(Builder $q, User $u, string $coluna = 'vendedorId'): Builder
    {
        return $u->ehGestor() ? $q : $q->where($coluna, $u->id);
    }

    public static function podeAcessar(User $u, ?string $vendedorId): bool
    {
        return $u->ehGestor() || $vendedorId === $u->id;
    }

    public static function atendimento(Builder $q, User $u): Builder
    {
        return $u->ehGestor() ? $q : $q->where('responsavelId', $u->id);
    }
}
