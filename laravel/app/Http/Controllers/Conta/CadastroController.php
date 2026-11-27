<?php

namespace App\Http\Controllers\Conta;

use App\Enums\Papel;
use App\Enums\TipoNotificacao;
use App\Http\Controllers\Controller;
use App\Http\Controllers\Loja\MinhaContaController;
use App\Models\Cliente;
use App\Models\User;
use App\Services\Config;
use App\Services\Contas;
use App\Services\Notificacoes;
use App\Support\Consentimento;
use App\Support\Telefone;
use App\Support\Url;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

use function Illuminate\Support\defer;

/** A cliente cria a conta pela loja (src/app/(conta)/cadastro, acoes/conta.ts → cadastrarCliente). */
class CadastroController extends Controller
{
    /** Cadastros concluídos por conexão (CADASTRO_POR_IP): 5 por hora. */
    private const POR_IP = 5;

    public function show(Request $request): Response
    {
        $vendedores = User::query()->where('papel', Papel::Vendedor)->where('ativo', true)->orderBy('name')->get(['id', 'name']);
        $convite = $vendedores->firstWhere('id', $request->query('v'));

        return Inertia::render('Conta/Cadastro', [
            'convite' => $convite ? ['id' => $convite->id, 'nome' => $convite->name] : null,
            'vendedores' => $convite ? [] : $vendedores->map(fn ($v) => ['id' => $v->id, 'nome' => $v->name])->values(),
            'volta' => Url::caminhoInterno($request->query('volta')),
        ]);
    }

    public function store(Request $request, Contas $contas, Config $config, Notificacoes $notificacoes): RedirectResponse
    {
        $chave = 'cadastro:ip:'.$request->ip();
        if (RateLimiter::tooManyAttempts($chave, self::POR_IP)) {
            throw ValidationException::withMessages(['erro' => 'Muitos cadastros a partir desta conexão. Tente de novo em '.max(1, (int) ceil(RateLimiter::availableIn($chave) / 60)).' min.']);
        }
        $d = $request->validate([
            'nome' => ['required', 'string', 'min:3', 'max:120'], 'telefone' => ['required', 'string'], 'cpf' => ['nullable', 'string'],
            'endereco' => ['nullable', 'string', 'max:200'], 'cidade' => ['nullable', 'string', 'max:80'], 'email' => ['required', 'email'],
            'senha' => ['required', 'string', 'min:8'], 'vendedorId' => ['nullable', 'string'], 'aceitaOfertas' => ['nullable', 'boolean'], 'aceite' => ['accepted'],
        ], [
            'nome.*' => 'Informe seu nome completo.', 'telefone.required' => 'Informe o WhatsApp com DDD, ex.: (49) 99999-9999.', 'email.*' => 'Informe um e-mail válido.',
            'senha.*' => 'A senha precisa ter pelo menos 8 caracteres.', 'aceite.accepted' => 'Para criar a conta, aceite a política de privacidade.',
        ]);
        $pessoa = MinhaContaController::validarPessoa($d);
        $email = mb_strtolower(trim($d['email']));
        if (User::query()->where('email', $email)->exists()) {
            throw ValidationException::withMessages(['email' => 'Este e-mail já tem conta. Use "Entrar".']);
        }
        if ($pessoa['cpf'] && Cliente::query()->where('cpf', $pessoa['cpf'])->exists()) {
            throw ValidationException::withMessages(['cpf' => 'Este CPF já está cadastrado. Fale com a loja.']);
        }
        $vendedor = $this->vendedorParaNovoCliente($d['vendedorId'] ?? null, (string) $config->get('vendedorPadraoId'));
        if (! $vendedor) {
            throw ValidationException::withMessages(['erro' => 'A loja ainda não tem vendedores cadastrados. Tente novamente mais tarde.']);
        }
        RateLimiter::hit($chave, 3600); // conta cada cadastro concluído
        $cliente = DB::transaction(function () use ($d, $pessoa, $email, $contas, $vendedor) {
            $user = $contas->criar($d['nome'], $email, $d['senha'], Papel::Cliente, $pessoa['telefone'], now());
            // C-03: nunca liga a conta nova a uma ficha existente pelo telefone; só herda a vendedora dela.
            $existente = Cliente::query()->whereNull('userId')->whereIn('telefone', [$pessoa['telefone'], Telefone::digitos($d['telefone'])])->value('vendedorId');

            return Cliente::query()->create([
                'nome' => $d['nome'], 'telefone' => $pessoa['telefone'], 'cpf' => $pessoa['cpf'], 'email' => $email,
                'endereco' => ($d['endereco'] ?? '') ?: null, 'cidade' => ($d['cidade'] ?? '') ?: null, 'userId' => $user->id, 'vendedorId' => $existente ?? $vendedor,
                ...Consentimento::depois(null, (bool) ($d['aceitaOfertas'] ?? false)),
            ]);
        });
        // D-28: quem atende fica sabendo da cliente nova.
        defer(fn () => $notificacoes->notificar(Notificacoes::responsaveis($cliente->vendedorId), TipoNotificacao::ClienteNova, "Cliente nova: {$cliente->nome}", "Criou a conta pela loja · {$cliente->telefone}", "/painel/clientes/{$cliente->id}"));
        Auth::loginUsingId($cliente->userId);
        $request->session()->regenerate();

        return redirect(Url::caminhoInterno($request->input('volta')) ?? '/');
    }

    /** Vendedora ativa para a cliente nova: convite → escolha → padrão da loja → a primeira ativa. */
    private function vendedorParaNovoCliente(?string $escolhido, string $padrao): ?string
    {
        $ativa = fn (?string $id) => $id ? User::query()->whereKey($id)->where('papel', Papel::Vendedor)->where('ativo', true)->value('id') : null;

        return $ativa($escolhido) ?? $ativa($padrao ?: null)
            ?? User::query()->where('papel', Papel::Vendedor)->where('ativo', true)->orderBy('createdAt')->value('id');
    }
}
