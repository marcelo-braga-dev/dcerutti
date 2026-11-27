<?php

namespace App\Auth;

use App\Models\Account;
use Illuminate\Auth\EloquentUserProvider;
use Illuminate\Contracts\Auth\Authenticatable;

/**
 * A senha mora em `account` (provider "credential"), como o Better Auth deixou, e não no `user`. Este provedor confere
 * por ela e, quando o hash é antigo (scrypt), regrava em bcrypt no próprio login.
 */
class ProvedorDeUsuarios extends EloquentUserProvider
{
    /** @param array<string, mixed> $credentials */
    public function rehashPasswordIfRequired(Authenticatable $user, array $credentials, bool $force = false): void
    {
        $atual = $user->getAuthPassword();
        if (! $force && ! $this->hasher->needsRehash($atual)) {
            return;
        }
        Account::query()
            ->where('userId', $user->getAuthIdentifier())
            ->where('providerId', 'credential')
            ->update(['password' => $this->hasher->make($credentials['password'])]);
    }
}
