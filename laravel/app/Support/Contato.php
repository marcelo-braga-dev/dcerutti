<?php

namespace App\Support;

use App\Models\User;

/** Para onde a cliente fala (D-31; src/lib/numeros.ts → contatoDe). */
class Contato
{
    /** Relação para carregar junto da vendedora antes de chamar `de`. */
    public const COM = 'numeroPrincipal:id,telefone,status';

    /**
     * O número principal da vendedora, se ela estiver ativa e o número em uso (`nome` é a vendedora); senão, o número
     * padrão da loja (`nome` null).
     *
     * @return array{telefone: string, nome: ?string}
     */
    public static function de(?User $vendedor, string $padrao): array
    {
        if ($vendedor && $vendedor->ativo !== false && $vendedor->numeroPrincipal?->status->value === 'ativo') {
            return ['telefone' => $vendedor->numeroPrincipal->telefone, 'nome' => $vendedor->name];
        }

        return ['telefone' => $padrao, 'nome' => null];
    }

    public static function primeiroNome(?string $nome, string $padrao = 'a loja'): string
    {
        $n = trim((string) $nome);

        return $n === '' ? $padrao : (preg_split('/\s+/u', $n)[0] ?? $n);
    }
}
