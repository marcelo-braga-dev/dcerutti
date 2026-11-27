<?php

namespace App\Http\Controllers\Painel;

use App\Enums\Papel;
use App\Http\Controllers\Controller;
use App\Models\Atendimento;
use App\Models\Cliente;
use App\Models\Pedido;
use App\Models\Sugestao;
use App\Models\User;
use App\Models\Venda;
use App\Queries\Cupons;
use App\Queries\Navegacao;
use App\Services\Config;
use App\Services\Contas;
use App\Services\Equipe;
use App\Support\Cpf;
use App\Support\Datas;
use App\Support\Dinheiro;
use App\Support\Escopo;
use App\Support\Instagram;
use App\Support\Telefone;
use Carbon\CarbonImmutable;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/** Ficha, cadastro e venda manual da cliente (src/app/(painel)/painel/clientes/[id], novo e src/server/acoes/clientes.ts). */
class FichaClienteController extends Controller
{
    /** @return list<array{id: string, nome: string}> */
    private function vendedoresAtivos(?string $incluir = null): array
    {
        return User::query()->where('papel', 'vendedor')->where(fn ($q) => $q->where('ativo', true)->when($incluir, fn ($x) => $x->orWhere('id', $incluir)))
            ->orderBy('name')->get(['id', 'name'])->map(fn ($v) => ['id' => $v->id, 'nome' => $v->name])->all();
    }

    private function daEquipe(Request $request, string $id): Cliente
    {
        $c = Cliente::query()->find($id);
        abort_unless($c && Escopo::podeAcessar($request->user(), $c->vendedorId), 404);

        return $c;
    }

    public function create(Request $request): Response
    {
        return Inertia::render('Painel/Clientes/Form', ['cliente' => null, 'vendedores' => $request->user()->ehGestor() ? $this->vendedoresAtivos() : null]);
    }

    public function show(Request $request, string $id, Cupons $cupons, Navegacao $navegacao, Config $config): Response
    {
        /** @var User $u */
        $u = $request->user();
        $c = $this->daEquipe($request, $id)->load('user:id,email');
        $pedidos = Pedido::query()->where('clienteId', $c->id)->orderByDesc('criadoEm')->limit(20)->get(['id', 'codigo', 'tipo', 'status', 'total']);
        $vendas = Venda::query()->where('clienteId', $c->id)->orderByDesc('data')->limit(20)->get(['id', 'valor', 'data', 'observacao']);
        $sugestoes = Escopo::vendedor(Sugestao::query(), $u)->where('clienteId', $c->id)->with('itens:id,sugestaoId,escolha')->orderByDesc('criadaEm')->limit(20)->get();
        $atendimentos = $config->get('atendimento.ligado') ? Escopo::atendimento(Atendimento::query(), $u)->where('clienteId', $c->id)->orderByDesc('criadoEm')->limit(10)->get(['id', 'codigo', 'etapa', 'proximoContatoEm']) : collect();
        $vendedor = User::query()->find($c->vendedorId, ['id', 'name']);

        return Inertia::render('Painel/Clientes/Show', [
            'cliente' => [
                'id' => $c->id, 'nome' => $c->nome, 'telefone' => $c->telefone, 'cpf' => $c->cpf, 'email' => $c->email, 'endereco' => $c->endereco, 'cidade' => $c->cidade, 'cep' => $c->cep,
                'preferencias' => $c->preferencias, 'instagram' => $c->instagram, 'vendedorId' => $c->vendedorId, 'temAcesso' => (bool) $c->userId,
                'aceitaOfertasEm' => $c->aceitaOfertasEm?->toIso8601String(), 'descadastradaEm' => $c->descadastradaEm?->toIso8601String(),
            ],
            'vendedor' => $vendedor ? ['id' => $vendedor->id, 'nome' => $vendedor->name] : null,
            'totalComprado' => (float) Venda::query()->where('clienteId', $c->id)->sum('valor'),
            'pedidos' => $pedidos->map(fn ($p) => ['id' => $p->id, 'codigo' => $p->codigo, 'tipo' => $p->tipo->value, 'status' => $p->status->value, 'total' => (float) $p->total])->all(),
            'vendas' => $vendas->map(fn ($v) => ['id' => $v->id, 'valor' => (float) $v->valor, 'data' => $v->data->toIso8601String(), 'observacao' => $v->observacao])->all(),
            'sugestoes' => $sugestoes->map(fn ($s) => [
                'id' => $s->id, 'codigo' => $s->codigo, 'titulo' => $s->titulo, 'status' => $s->status->value, 'validaAte' => $s->validaAte->toIso8601String(),
                'enviadaEm' => $s->enviadaEm?->toIso8601String(), 'criadaEm' => $s->criadaEm->toIso8601String(), 'pecas' => $s->itens->count(), 'quer' => $s->itens->where('escolha.value', 'quero')->count(),
            ])->all(),
            'atendimentos' => $atendimentos->map(fn ($a) => ['id' => $a->id, 'codigo' => $a->codigo, 'etapa' => $a->etapa->value, 'proximoContatoEm' => $a->proximoContatoEm?->toIso8601String()])->all(),
            'cupons' => $cupons->daFicha($c->id),
            'interesse' => $navegacao->interesse($u, $c->id),
            'vendedores' => $u->ehGestor() ? $this->vendedoresAtivos($c->vendedorId) : null,
            'hoje' => Datas::dia(),
        ]);
    }

    public function store(Request $request, Contas $contas, Equipe $equipe): RedirectResponse
    {
        $id = $this->salvar($request, null, $contas, $equipe);

        return redirect("/painel/clientes/{$id}")->with('sucesso', 'Cliente cadastrado.');
    }

    public function update(Request $request, string $id, Contas $contas, Equipe $equipe): RedirectResponse
    {
        $this->salvar($request, $this->daEquipe($request, $id)->load('user'), $contas, $equipe);

        return back()->with('sucesso', 'Cliente salvo.');
    }

    /** Porta de salvarCliente: só o gestor escolhe a vendedora; conta já criada só muda e-mail e senha pelo gestor. */
    private function salvar(Request $request, ?Cliente $atual, Contas $contas, Equipe $equipe): string
    {
        /** @var User $u */
        $u = $request->user();
        $d = $request->validate([
            'nome' => ['required', 'string', 'min:2', 'max:120'], 'telefone' => ['required', 'string'], 'cpf' => ['nullable', 'string'], 'email' => ['nullable', 'email'],
            'senha' => ['nullable', 'string', 'min:8'], 'endereco' => ['nullable', 'string', 'max:200'], 'cidade' => ['nullable', 'string', 'max:200'], 'cep' => ['nullable', 'string'],
            'preferencias' => ['nullable', 'string', 'max:200'], 'instagram' => ['nullable', 'string', 'max:60'], 'vendedorId' => ['nullable', 'string'], 'aceitaOfertas' => ['nullable', 'boolean'],
        ], [
            'nome.required' => 'Informe o nome.', 'nome.min' => 'Informe o nome.', 'telefone.required' => 'Informe o WhatsApp com DDD e 9 dígitos.',
            'email.email' => 'E-mail inválido.', 'senha.min' => 'A senha precisa ter pelo menos 8 caracteres.',
        ]);
        $erro = fn (string $campo, string $msg) => throw ValidationException::withMessages([$campo => $msg]);
        if (! Telefone::celularValido($d['telefone'])) {
            $erro('telefone', 'Informe o WhatsApp com DDD e 9 dígitos.');
        }
        $cpf = null;
        if (Telefone::digitos($d['cpf'] ?? '') !== '') {
            Cpf::valido($d['cpf']) || $erro('cpf', 'CPF inválido. Confira os 11 números.');
            $cpf = Cpf::formatar($d['cpf']);
        }
        $cep = ($d['cep'] ?? '') !== '' ? Telefone::formatarCep($d['cep']) : null;
        if ($cep !== null && strlen($cep) !== 9) {
            $erro('cep', 'CEP inválido.');
        }
        $email = ! empty($d['email']) ? mb_strtolower(trim($d['email'])) : null;

        // Só o gestor escolhe (ou troca) a vendedora; a vendedora cadastra sempre para si (Q-08: sempre uma vendedora ativa).
        $vendedorId = $u->ehGestor() ? (($d['vendedorId'] ?? null) ?: $atual?->vendedorId) : ($atual?->vendedorId ?? $u->id);
        if ($u->ehGestor() && (! $vendedorId || ! User::query()->whereKey($vendedorId)->where('papel', 'vendedor')->where('ativo', true)->exists())) {
            $erro('vendedorId', 'Escolha o vendedor.');
        }
        $temConta = (bool) $atual?->userId;
        if ($temConta && ! $u->ehGestor()) {
            ! empty($d['senha']) && $erro('senha', 'Só o gestor troca a senha de um cliente com acesso à loja.');
            $email !== $atual->user?->email && $erro('email', 'Só o gestor troca o e-mail de um cliente com acesso à loja.');
        }
        if ($temConta && ! $email) {
            $erro('email', 'Cliente com acesso à loja precisa de e-mail.');
        }
        if ($cpf && Cliente::query()->where('cpf', $cpf)->when($atual, fn ($q) => $q->where('id', '<>', $atual->id))->exists()) {
            $erro('cpf', 'Este CPF já está na ficha de outra cliente.');
        }
        if ($email) {
            $dono = User::query()->where('email', $email)->value('id');
            if ($dono && $dono !== $atual?->userId) {
                $erro('email', 'Este e-mail já está em uso.');
            }
        }
        // Consentimento de ofertas (src/lib/pos-venda.ts → consentimento).
        $aceitava = $atual && $atual->aceitaOfertasEm && ! $atual->descadastradaEm;
        $marcado = $request->boolean('aceitaOfertas');
        $consentimento = $marcado
            ? ($aceitava ? [] : ['aceitaOfertasEm' => now(), 'descadastradaEm' => null])
            : ($aceitava ? ['descadastradaEm' => now()] : []);
        $telefone = Telefone::formatar($d['telefone']);
        $dados = [
            'nome' => trim($d['nome']), 'telefone' => $telefone, 'cpf' => $cpf, 'email' => $email, 'endereco' => ($d['endereco'] ?? null) ?: null, 'cidade' => ($d['cidade'] ?? null) ?: null,
            'cep' => $cep, 'preferencias' => ($d['preferencias'] ?? null) ?: null, 'instagram' => Instagram::normalizar($d['instagram'] ?? null), 'vendedorId' => $vendedorId, ...$consentimento,
        ];
        $vendedorAntes = $atual?->vendedorId;
        $id = DB::transaction(function () use ($atual, $dados, $d, $email, $telefone, $contas, $vendedorId, $vendedorAntes) {
            $userId = $atual?->userId;
            if ($userId) {
                User::query()->whereKey($userId)->update(['name' => $dados['nome'], 'telefone' => $telefone, ...($email ? ['email' => $email] : [])]);
                if (! empty($d['senha'])) {
                    $contas->trocarSenha($userId, $d['senha']);
                }
            } elseif ($email && ! empty($d['senha'])) {
                // E-mail + senha criam o acesso à loja. Só e-mail: fica registrado como contato, sem login.
                $userId = $contas->criar($dados['nome'], $email, $d['senha'], Papel::Cliente, $telefone)->id;
            }
            $c = $atual ? tap($atual)->update([...$dados, 'userId' => $userId]) : Cliente::query()->create([...$dados, 'userId' => $userId]);
            // B-09: trocou a vendedora? Os pedidos em aberto e os atendimentos abertos passam para a nova.
            if ($atual && $vendedorAntes !== $vendedorId) {
                Pedido::query()->where('clienteId', $atual->id)->where('status', 'pendente')->update(['vendedorId' => $vendedorId]);
                Atendimento::query()->where('clienteId', $atual->id)->whereNull('fechadoEm')->update(['responsavelId' => $vendedorId]);
            }

            return $c->id;
        });
        $equipe->registrar($u->id, $atual ? 'cliente_editado' : 'cliente_cadastrado', ['clienteId' => $id, 'descricao' => $dados['nome']]);

        return $id;
    }

    /** RN-11: venda manual (loja física), sem itens e sem custo. */
    public function vendaManual(Request $request, string $id, Equipe $equipe): RedirectResponse
    {
        $c = $this->daEquipe($request, $id);
        $valor = Dinheiro::lerValor((string) $request->input('valor'));
        if (! ($valor > 0 && $valor < 1_000_000)) {
            throw ValidationException::withMessages(['valor' => 'Informe o valor.']);
        }
        $dia = (string) $request->input('data');
        if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $dia)) {
            throw ValidationException::withMessages(['data' => 'Informe a data.']);
        }
        if ($dia > Datas::dia()) {
            throw ValidationException::withMessages(['data' => 'A data não pode ser no futuro.']);
        }
        $obs = mb_substr(trim((string) $request->input('observacao')), 0, 120);
        $u = $request->user();
        $venda = Venda::query()->create([
            'vendedorId' => $u->ehGestor() ? $c->vendedorId : $u->id, 'clienteId' => $c->id, 'valor' => number_format($valor, 2, '.', ''),
            'data' => CarbonImmutable::parse("{$dia} 12:00:00", Datas::FUSO)->utc(), 'observacao' => $obs ?: 'Venda na loja',
        ]);
        $equipe->registrar($u->id, 'venda_manual', ['clienteId' => $c->id, 'valor' => $venda->valor, 'descricao' => $c->nome.($obs ? " · {$obs}" : '')]);

        return back()->with('sucesso', 'Venda registrada.');
    }

    public function historico(Request $request, string $id, Navegacao $navegacao): Response
    {
        $filtro = array_key_exists((string) $request->query('filtro'), Navegacao::FILTROS_LINHA) ? $request->query('filtro') : null;
        $paginas = min(10, max(1, (int) $request->query('mais', 1)));
        $dados = $navegacao->linhaDoTempo($request->user(), $id, 200 * $paginas, $filtro);
        abort_unless($dados, 404);

        return Inertia::render('Painel/Clientes/Historico', [...$dados, 'filtro' => $filtro, 'paginas' => $paginas, 'filtros' => collect(Navegacao::FILTROS_LINHA)->map(fn ($f) => $f['rotulo'])]);
    }
}
