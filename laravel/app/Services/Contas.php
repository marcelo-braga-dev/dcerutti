<?php

namespace App\Services;

use App\Enums\Papel;
use App\Models\Account;
use App\Models\User;
use DateTimeInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/** Contas de acesso (src/server/contas.ts): o usuário e a senha em `account` (provider "credential"). */
class Contas
{
    public function criar(string $nome, string $email, string $senha, Papel $papel, ?string $telefone = null, ?DateTimeInterface $aceitouPrivacidadeEm = null): User
    {
        $u = User::query()->create([
            'name' => $nome, 'email' => mb_strtolower(trim($email)), 'papel' => $papel, 'telefone' => $telefone, 'emailVerified' => false,
            'aceitouPrivacidadeEm' => $aceitouPrivacidadeEm, 'ativo' => true,
        ]);
        Account::query()->create(['userId' => $u->id, 'accountId' => $u->id, 'providerId' => 'credential', 'password' => Hash::make($senha)]);

        return $u;
    }

    /** Troca a senha e encerra as sessões abertas do usuário (quem tinha a senha antiga sai). */
    public function trocarSenha(string $userId, string $senha): void
    {
        Account::query()->where('userId', $userId)->where('providerId', 'credential')->update(['password' => Hash::make($senha)]);
        DB::table('sessions')->where('user_id', $userId)->delete();
        User::query()->whereKey($userId)->update(['remember_token' => null]);
    }
}
