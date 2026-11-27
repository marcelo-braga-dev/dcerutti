<?php

namespace Database\Factories;

use App\Enums\Papel;
use App\Models\Account;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;

/**
 * Usuário com a senha em `account` (provider "credential"), como o sistema guarda.
 *
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    protected $model = User::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'emailVerified' => true,
            'papel' => Papel::Cliente,
            'ativo' => true,
        ];
    }

    public function gestor(): static
    {
        return $this->state(['papel' => Papel::Gestor]);
    }

    public function vendedor(): static
    {
        return $this->state(['papel' => Papel::Vendedor]);
    }

    public function inativo(): static
    {
        return $this->state(['ativo' => false]);
    }

    /** Senha gravada direto (ex.: um hash scrypt do Better Auth). */
    public function comHash(string $hash): static
    {
        return $this->afterCreating(fn (User $u) => Account::query()->where('userId', $u->id)->update(['password' => $hash]));
    }

    public function configure(): static
    {
        return $this->afterCreating(function (User $u) {
            Account::query()->create(['userId' => $u->id, 'accountId' => $u->id, 'providerId' => 'credential', 'password' => Hash::make('senha-de-teste')]);
        });
    }
}
