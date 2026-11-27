<?php

namespace App\Http\Controllers\Painel;

use App\Enums\Papel;
use App\Http\Controllers\Controller;
use App\Models\Atendimento;
use App\Models\Cliente;
use App\Models\Meta;
use App\Models\Pedido;
use App\Models\User;
use App\Queries\Equipe as ConsultasEquipe;
use App\Services\Contas;
use App\Services\Numeros;
use App\Support\Datas;
use App\Support\Dinheiro;
use App\Support\Telefone;
use App\Support\Texto;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/** Vendedores do gestor (src/app/(painel)/painel/vendedores e src/server/acoes/gestao.ts). */
class VendedorController extends Controller
{
    public function index(ConsultasEquipe $equipe): Response
    {
        $mes = Datas::mes();
        $lista = User::query()->where('papel', 'vendedor')->with('numeroPrincipal:id,apelido,telefone,status')->withCount('clientes')->orderByDesc('ativo')->orderBy('name')->get();
        $metas = $equipe->metasDoMes($lista->pluck('id')->all(), $mes);
        $vendido = $equipe->vendidoPorVendedor($mes);

        return Inertia::render('Painel/Vendedores/Index', ['vendedores' => $lista->map(fn (User $v) => [
            'id' => $v->id, 'nome' => $v->name, 'email' => $v->email, 'ativo' => $v->ativo, 'clientes' => $v->clientes_count,
            'online' => ConsultasEquipe::online($v->ultimoAcessoEm), 'ultimoAcessoEm' => $v->ultimoAcessoEm?->toIso8601String(), 'ultimoLoginEm' => $v->ultimoLoginEm?->toIso8601String(),
            'numero' => $v->numeroPrincipal && $v->numeroPrincipal->status->value === 'ativo' ? ['apelido' => $v->numeroPrincipal->apelido, 'telefone' => $v->numeroPrincipal->telefone] : null,
            'meta' => $metas[$v->id] ?? 0, 'vendido' => $vendido[$v->id]['valor'] ?? 0,
        ])->all()]);
    }

    public function create(): Response
    {
        return Inertia::render('Painel/Vendedores/Novo');
    }

    public function show(string $id, ConsultasEquipe $equipe): Response
    {
        $v = User::query()->where('papel', 'vendedor')->withCount(['clientes', 'pedidos as pendentes' => fn ($q) => $q->where('status', 'pendente')])->findOrFail($id);
        $mes = Datas::mes();

        return Inertia::render('Painel/Vendedores/Show', [
            'vendedor' => [
                'id' => $v->id, 'nome' => $v->name, 'email' => $v->email, 'telefone' => $v->telefone, 'ativo' => $v->ativo, 'clientes' => $v->clientes_count, 'pendentes' => $v->pendentes,
                'online' => ConsultasEquipe::online($v->ultimoAcessoEm), 'ultimoAcessoEm' => $v->ultimoAcessoEm?->toIso8601String(), 'ultimoLoginEm' => $v->ultimoLoginEm?->toIso8601String(),
                'metas' => Meta::query()->where('vendedorId', $v->id)->orderByDesc('mes')->limit(12)->get(['id', 'mes', 'valor'])->map(fn ($m) => ['id' => $m->id, 'mes' => $m->mes, 'valor' => (float) $m->valor])->all(),
            ],
            'meta' => $equipe->metasDoMes([$v->id], $mes)[$v->id] ?? null,
            'mes' => $mes, 'proximoMes' => Datas::somarMeses($mes, 1),
            'perfil' => $equipe->perfil($v->id, $mes), 'acoes' => $equipe->ultimasAcoes($v->id),
            'outros' => array_values(array_filter(ConsultasEquipe::vendedoresAtivos(), fn ($o) => $o['id'] !== $v->id)),
        ]);
    }

    public function store(Request $request, Contas $contas): RedirectResponse
    {
        $id = $this->salvar($request, null, $contas);

        return redirect("/painel/vendedores/{$id}")->with('sucesso', 'Vendedor cadastrado.');
    }

    public function update(Request $request, string $id, Contas $contas): RedirectResponse
    {
        User::query()->where('papel', 'vendedor')->findOrFail($id);
        $this->salvar($request, $id, $contas);

        return back()->with('sucesso', 'Vendedor salvo.');
    }

    private function salvar(Request $request, ?string $id, Contas $contas): string
    {
        $d = $request->validate(['nome' => ['required', 'string', 'min:3', 'max:120'], 'email' => ['required', 'email'], 'telefone' => ['nullable', 'string'], 'senha' => ['nullable', 'string'], 'meta' => ['nullable', 'string']], [
            'nome.*' => 'Informe o nome.', 'email.*' => 'Informe um e-mail válido.',
        ]);
        $erro = fn (string $c, string $m) => throw ValidationException::withMessages([$c => $m]);
        $telefone = trim((string) ($d['telefone'] ?? '')) !== '' ? (Telefone::celularValido($d['telefone']) ? Telefone::formatar($d['telefone']) : $erro('telefone', 'Informe o telefone com DDD e 9 dígitos, ex.: (49) 99998-0637.')) : null;
        $meta = trim((string) ($d['meta'] ?? '')) !== '' ? Dinheiro::lerValor($d['meta']) : 0.0;
        if (! ($meta >= 0)) {
            $erro('meta', 'Informe a meta em reais, ou deixe em branco para sem meta.');
        }
        $senha = (string) ($d['senha'] ?? '');
        if (! $id && strlen($senha) < 8) {
            $erro('senha', 'Defina uma senha com pelo menos 8 caracteres.');
        }
        if ($id && $senha !== '' && strlen($senha) < 8) {
            $erro('senha', 'A nova senha precisa ter pelo menos 8 caracteres.');
        }
        $email = mb_strtolower(trim($d['email']));
        $dono = User::query()->where('email', $email)->value('id');
        if ($dono && $dono !== $id) {
            $erro('email', 'Este e-mail já está em uso.');
        }
        $mes = Datas::mes();

        return DB::transaction(function () use ($id, $d, $email, $telefone, $senha, $meta, $mes, $contas) {
            if ($id) {
                User::query()->whereKey($id)->update(['name' => trim($d['nome']), 'email' => $email, 'telefone' => $telefone]);
                if ($senha !== '') {
                    $contas->trocarSenha($id, $senha);
                }
            } else {
                $id = $contas->criar(trim($d['nome']), $email, $senha, Papel::Vendedor, $telefone)->id;
            }
            Meta::query()->updateOrCreate(['vendedorId' => $id, 'mes' => $mes], ['valor' => number_format($meta, 2, '.', '')]);

            return $id;
        });
    }

    /** RN-01: desativar exige transferir os clientes e os pedidos em aberto; as sessões abertas são encerradas. */
    public function desativar(Request $request, string $id, Numeros $numeros): RedirectResponse
    {
        $u = $request->user();
        if ($id === $u->id || ! User::query()->whereKey($id)->where('papel', 'vendedor')->exists()) {
            $this->falhar('Vendedor não encontrado.');
        }
        $destino = (string) $request->input('transferirPara');
        $n = DB::transaction(function () use ($id, $destino, $numeros, $u) {
            $n = Cliente::query()->where('vendedorId', $id)->count();
            $pendentes = Pedido::query()->where('vendedorId', $id)->where('status', 'pendente')->count();
            $temCarteira = $n > 0 || $pendentes > 0;
            if ($temCarteira && ! User::query()->whereKey($destino)->where('papel', 'vendedor')->where('ativo', true)->where('id', '<>', $id)->exists()) {
                throw ValidationException::withMessages(['transferirPara' => 'Escolha para quem transferir os clientes e os pedidos em aberto.']);
            }
            if ($temCarteira) {
                $numeros->transferirCarteira($id, $destino);
            }
            $numeros->encerrarVinculosDoUsuario($id, $u->id, 'Vendedor desativado');
            Atendimento::query()->where('responsavelId', $id)->whereNull('fechadoEm')->update(['responsavelId' => $temCarteira ? $destino : null]);
            User::query()->whereKey($id)->update(['ativo' => false]);
            DB::table('sessions')->where('user_id', $id)->delete();

            return $n;
        });

        return back()->with('sucesso', $n ? 'Vendedor desativado. '.Texto::plural($n, 'cliente transferido', 'clientes transferidos').'.' : 'Vendedor desativado.');
    }

    public function reativar(string $id): RedirectResponse
    {
        if (! User::query()->whereKey($id)->where('papel', 'vendedor')->update(['ativo' => true])) {
            $this->falhar('Vendedor não encontrado.');
        }

        return back()->with('sucesso', 'Acesso reativado.');
    }

    public function meta(Request $request, string $id): RedirectResponse
    {
        $mes = (string) $request->input('mes');
        $valor = Dinheiro::lerValor((string) $request->input('valor'));
        if (! preg_match('/^\d{4}-\d{2}$/', $mes)) {
            throw ValidationException::withMessages(['mes' => 'Escolha o mês.']);
        }
        if (! ($valor >= 0)) {
            throw ValidationException::withMessages(['valor' => 'Informe a meta em reais.']);
        }
        abort_unless(User::query()->whereKey($id)->where('papel', 'vendedor')->exists(), 404);
        Meta::query()->updateOrCreate(['vendedorId' => $id, 'mes' => $mes], ['valor' => number_format($valor, 2, '.', '')]);

        return back()->with('sucesso', 'Meta salva.');
    }
}
