<?php

namespace App\Http\Controllers\Conta;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Verification;
use App\Services\Config;
use App\Services\Contas;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * B-03: esqueci a senha e senha nova pelo link do e-mail (acoes/conta.ts → pedirRedefinicao, redefinirSenha). O link fica
 * na tabela `verification` como o Better Auth gravava (identifier "reset-password:<token>", value = id do usuário), vale
 * uma hora e é de uso único.
 */
class SenhaController extends Controller
{
    public const MENSAGEM = 'Se este e-mail tiver conta, enviamos um link para criar uma senha nova. Confira também a caixa de spam.';

    private const VALIDADE_MIN = 60;

    public function esqueci(): Response
    {
        return Inertia::render('Conta/EsqueciSenha');
    }

    /** A resposta é sempre a mesma, exista ou não a conta (não revela quem é cliente). */
    public function pedir(Request $request, Config $config): RedirectResponse
    {
        $request->validate(['email' => ['required', 'email']], ['email.*' => 'Informe um e-mail válido.']);
        $email = mb_strtolower(trim($request->input('email')));
        $chaveEmail = "redefinir:email:{$email}";
        $chaveIp = 'redefinir:ip:'.$request->ip();
        if (RateLimiter::tooManyAttempts($chaveEmail, 3) || RateLimiter::tooManyAttempts($chaveIp, 10)) {
            return back()->with('sucesso', self::MENSAGEM);
        }
        RateLimiter::hit($chaveEmail, 3600);
        RateLimiter::hit($chaveIp, 3600);
        $u = User::query()->where('email', $email)->where('ativo', true)->first(['id', 'name', 'email']);
        if ($u) {
            $token = Str::random(32);
            Verification::query()->create(['identifier' => "reset-password:{$token}", 'value' => $u->id, 'expiresAt' => now()->addMinutes(self::VALIDADE_MIN)]);
            $link = rtrim((string) config('app.url'), '/').'/redefinir-senha?token='.$token;
            $loja = $config->nomeDaLoja()['nome'];
            try {
                Mail::raw("Olá, {$u->name}!\n\nPara criar uma senha nova na {$loja}, abra o link abaixo (vale por 1 hora):\n\n{$link}\n\nSe não foi você que pediu, ignore este e-mail.", fn ($m) => $m->to($u->email)->subject("Senha nova · {$loja}"));
            } catch (\Throwable $e) {
                Log::error('Falha ao enviar o link de senha nova', ['erro' => $e->getMessage()]);
            }
        }

        return back()->with('sucesso', self::MENSAGEM);
    }

    public function redefinir(Request $request): Response
    {
        return Inertia::render('Conta/RedefinirSenha', ['token' => (string) $request->query('token', '')]);
    }

    /** Define a senha nova; o link é de uso único e todas as sessões abertas são encerradas. */
    public function salvar(Request $request, Contas $contas): RedirectResponse
    {
        $d = $request->validate(['token' => ['required', 'string', 'min:10'], 'senha' => ['required', 'string', 'min:8'], 'confirmacao' => ['required', 'same:senha']], [
            'token.*' => 'Link inválido.', 'senha.*' => 'A senha precisa ter pelo menos 8 caracteres.', 'confirmacao.*' => 'As duas senhas não são iguais.',
        ]);
        $v = Verification::query()->where('identifier', "reset-password:{$d['token']}")->first();
        if (! $v || $v->expiresAt->isPast() || ! User::query()->whereKey($v->value)->exists()) {
            throw ValidationException::withMessages(['erro' => 'Este link é inválido ou já expirou. Peça um novo em "Esqueci a senha".']);
        }
        $contas->trocarSenha($v->value, $d['senha']);
        $v->delete();

        return redirect('/entrar?redefinida=1');
    }
}
