<?php

namespace App\Http\Requests\Conta;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

/**
 * Entrar com e-mail e senha (src/server/acoes/conta.ts → entrar). C-01: até 5 tentativas erradas por e-mail e 20 por
 * IP a cada 15 minutos. Conta desativada não entra.
 */
class EntrarRequest extends FormRequest
{
    private const JANELA = 15 * 60;

    /** @return array<string, array<int, string>> */
    public function rules(): array
    {
        return ['email' => ['required', 'string'], 'senha' => ['required', 'string'], 'volta' => ['nullable', 'string']];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return ['email.required' => 'Informe e-mail e senha.', 'senha.required' => 'Informe e-mail e senha.'];
    }

    public function autenticar(): void
    {
        $email = mb_strtolower(trim((string) $this->input('email')));
        $chaves = ["login:email:{$email}" => 5, 'login:ip:'.$this->ip() => 20];
        foreach ($chaves as $chave => $max) {
            if (RateLimiter::tooManyAttempts($chave, $max)) {
                $minutos = (int) ceil(RateLimiter::availableIn($chave) / 60);
                throw ValidationException::withMessages(['email' => "Muitas tentativas. Tente de novo em {$minutos} min."]);
            }
        }
        $ok = Auth::attempt(['email' => $email, 'password' => (string) $this->input('senha'), fn ($q) => $q->where('ativo', true)], true);
        if (! $ok) {
            foreach (array_keys($chaves) as $chave) {
                RateLimiter::hit($chave, self::JANELA);
            }
            throw ValidationException::withMessages(['email' => 'E-mail ou senha incorretos.']);
        }
        RateLimiter::clear("login:email:{$email}");
    }
}
