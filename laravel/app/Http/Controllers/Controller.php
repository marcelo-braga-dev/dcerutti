<?php

namespace App\Http\Controllers;

use App\Exceptions\ErroNegocio;
use Closure;
use Illuminate\Validation\ValidationException;

abstract class Controller
{
    /**
     * Roda a regra e transforma erro de negócio em erro de formulário (`errors.erro` no Inertia), como as Server
     * Actions devolviam `{ ok: false, erro }`.
     */
    protected function tentar(Closure $fn): mixed
    {
        try {
            return $fn();
        } catch (ErroNegocio $e) {
            throw ValidationException::withMessages(['erro' => $e->getMessage()]);
        }
    }

    protected function falhar(string $mensagem): never
    {
        throw ValidationException::withMessages(['erro' => $mensagem]);
    }
}
