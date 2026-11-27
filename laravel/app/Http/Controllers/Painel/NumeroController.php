<?php

namespace App\Http\Controllers\Painel;

use App\Enums\Papel;
use App\Enums\TipoNotificacao;
use App\Http\Controllers\Controller;
use App\Models\AtividadeEquipe;
use App\Models\Cliente;
use App\Models\NumeroWhatsApp;
use App\Models\Pedido;
use App\Models\User;
use App\Models\VinculoNumero;
use App\Services\Equipe;
use App\Services\Notificacoes;
use App\Services\Numeros;
use App\Support\Telefone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

use function Illuminate\Support\defer;

/** Números de WhatsApp da loja (D-31; src/app/(painel)/painel/numeros e acoes/numeros.ts). Tudo aqui é só da gestora. */
class NumeroController extends Controller
{
    private const AVISO_DESCONECTAR = 'Agora desconecte o aparelho em Aparelhos conectados, no WhatsApp: tirar daqui não desconecta o aparelho.';

    public function __construct(private Numeros $numeros, private Equipe $equipe, private Notificacoes $notificacoes) {}

    private function avisarPessoa(string $usuarioId, string $titulo, string $texto): void
    {
        defer(fn () => $this->notificacoes->notificar([$usuarioId], TipoNotificacao::NumeroAlterado, $titulo, $texto, '/painel'));
    }

    /** O quadro: números com as pessoas ligadas, a equipe e as pendências de desconectar. */
    public function index(): Response
    {
        $numeros = NumeroWhatsApp::query()->orderByDesc('padrao')->orderBy('apelido')
            ->with(['vinculos' => fn ($q) => $q->whereNull('fimEm')->orderBy('inicioEm')->with('usuario:id,name,papel')])->get();
        $pessoas = User::query()->where('ativo', true)->whereIn('papel', [Papel::Vendedor, Papel::Gestor])->orderByDesc('papel')->orderBy('name')
            ->with('numeroPrincipal:id,status')->get(['id', 'name', 'papel', 'numeroPrincipalId']);
        $clientes = Cliente::query()->where('telefone', '<>', '')->selectRaw('vendedorId, count(*) as n')->groupBy('vendedorId')->pluck('n', 'vendedorId');
        $usos = AtividadeEquipe::query()->whereNotNull('numeroId')->selectRaw('numeroId, usuarioId, max(criadoEm) as ultimo')->groupBy('numeroId', 'usuarioId')->get()
            ->mapWithKeys(fn ($x) => ["{$x->numeroId}:{$x->usuarioId}" => $x->ultimo]);
        $emUso = fn (User $p) => $p->numeroPrincipal?->status->value === 'ativo';
        $pendentes = VinculoNumero::query()->whereNotNull('fimEm')->whereNull('desconectadoEm')->orderBy('fimEm')->with(['usuario:id,name', 'numero:id,apelido,telefone'])->get();

        return Inertia::render('Painel/Numeros/Index', [
            'numeros' => $numeros->map(fn (NumeroWhatsApp $n) => [
                'id' => $n->id, 'telefone' => $n->telefone, 'apelido' => $n->apelido, 'status' => $n->status->value, 'padrao' => $n->padrao,
                // As clientes que falam com este número: as de quem o tem como principal e, no padrão, as de quem está sem número.
                'clientes' => $n->status->value !== 'ativo' ? 0 : $pessoas->filter(fn ($p) => $p->papel === Papel::Vendedor && ($p->numeroPrincipalId === $n->id || ($n->padrao && ! $emUso($p))))->sum(fn ($p) => (int) ($clientes[$p->id] ?? 0)),
                'vinculos' => $n->vinculos->map(fn ($v) => [
                    'id' => $v->id, 'usuarioId' => $v->usuarioId, 'nome' => $v->usuario->name, 'papel' => $v->usuario->papel->value, 'conexao' => $v->conexao->value,
                    'principal' => $pessoas->firstWhere('id', $v->usuarioId)?->numeroPrincipalId === $n->id, 'ultimoUso' => $usos["{$n->id}:{$v->usuarioId}"] ?? null,
                ])->values(),
            ])->values(),
            'equipe' => $pessoas->map(fn (User $p) => ['id' => $p->id, 'nome' => $p->name, 'papel' => $p->papel->value, 'clientes' => (int) ($clientes[$p->id] ?? 0), 'semNumero' => $p->papel === Papel::Vendedor && ! $emUso($p)])->values(),
            'pendencias' => $pendentes->map(fn ($p) => ['id' => $p->id, 'nome' => $p->usuario->name, 'numero' => $p->numero->apelido, 'telefone' => $p->numero->telefone, 'desde' => $p->fimEm->toIso8601String()])->values(),
        ]);
    }

    public function show(int $id): Response
    {
        $n = NumeroWhatsApp::query()->findOrFail($id);
        $vinculos = VinculoNumero::query()->where('numeroId', $id)->latest('inicioEm')->take(200)->with('usuario:id,name')->get();
        $nomes = User::query()->whereIn('id', $vinculos->flatMap(fn ($v) => [$v->vinculadoPorId, $v->encerradoPorId])->filter()->unique())->pluck('name', 'id');
        $atendendo = Cliente::query()->where('telefone', '<>', '')->whereHas('vendedor', fn ($q) => $n->padrao
            ? $q->where(fn ($w) => $w->where('numeroPrincipalId', $id)->orWhereNull('numeroPrincipalId')->orWhereHas('numeroPrincipal', fn ($x) => $x->where('status', '<>', 'ativo')))
            : $q->where('numeroPrincipalId', $id))->count();

        return Inertia::render('Painel/Numeros/Show', [
            'numero' => ['id' => $n->id, 'telefone' => $n->telefone, 'apelido' => $n->apelido, 'observacao' => $n->observacao, 'status' => $n->status->value, 'padrao' => $n->padrao],
            'pedidos' => Pedido::query()->where('numeroId', $id)->count(), 'atendendo' => $atendendo,
            'vinculos' => $vinculos->map(fn ($v) => [
                'id' => $v->id, 'nome' => $v->usuario->name, 'conexao' => $v->conexao->value, 'inicioEm' => $v->inicioEm->toIso8601String(), 'fimEm' => $v->fimEm?->toIso8601String(),
                'conectadoEm' => $v->conectadoEm?->toIso8601String(), 'desconectadoEm' => $v->desconectadoEm?->toIso8601String(), 'motivoFim' => $v->motivoFim,
                'vinculadoPor' => $nomes[$v->vinculadoPorId] ?? null, 'encerradoPor' => $nomes[$v->encerradoPorId] ?? null,
            ])->values(),
            'usos' => AtividadeEquipe::query()->where('numeroId', $id)->latest('criadoEm')->take(30)->with('usuario:id,name')->get()
                ->map(fn ($a) => ['id' => (string) $a->id, 'quem' => $a->usuario?->name, 'tipo' => $a->tipo->value, 'descricao' => $a->descricao, 'criadoEm' => $a->criadoEm->toIso8601String()])->values(),
        ]);
    }

    /** Cadastra ou edita o número. */
    public function salvar(Request $request, ?int $id = null): RedirectResponse
    {
        $d = $request->validate(['telefone' => ['required', 'string'], 'apelido' => ['required', 'string', 'min:2', 'max:60'], 'observacao' => ['nullable', 'string', 'max:300']], [
            'telefone.required' => 'Informe o WhatsApp com DDD e 9 dígitos.', 'apelido.*' => 'Dê um nome para a equipe reconhecer o número.', 'observacao.max' => 'No máximo 300 caracteres.',
        ]);
        if (! Telefone::celularValido($d['telefone'])) {
            throw ValidationException::withMessages(['telefone' => 'Informe o WhatsApp com DDD e 9 dígitos.']);
        }
        $n = $this->tentar(fn () => $this->numeros->salvar(['id' => $id, 'telefone' => Telefone::digitos($d['telefone']), 'apelido' => trim($d['apelido']), 'observacao' => trim((string) ($d['observacao'] ?? '')) ?: null], $request->user()->id));
        if (! $id) {
            $this->equipe->registrar($request->user()->id, 'numero_cadastrado', ['numeroId' => $n->id, 'descricao' => "{$n->apelido} · ".Telefone::formatar($n->telefone)]);
        }

        return back()->with('sucesso', 'Número salvo.');
    }

    public function ligar(Request $request, int $id): RedirectResponse
    {
        $usuarioId = (string) $request->input('usuarioId');
        $n = $this->tentar(fn () => $this->numeros->vincular($id, $usuarioId, $request->user()->id));
        $this->equipe->registrar($request->user()->id, 'numero_vinculado', ['numeroId' => $id, 'descricao' => $n->apelido]);
        $this->avisarPessoa($usuarioId, "Você agora atende pelo número {$n->apelido}", Telefone::formatar($n->telefone));

        return back();
    }

    public function tirar(Request $request, int $id): RedirectResponse
    {
        $usuarioId = (string) $request->input('usuarioId');
        $r = $this->tentar(fn () => $this->numeros->desvincular($id, $usuarioId, $request->user()->id, trim((string) $request->input('motivo')) ?: null, $request->input('transferirPara') ?: null));
        $this->equipe->registrar($request->user()->id, 'numero_desvinculado', ['numeroId' => $id, 'descricao' => $r['numero']->apelido]);
        $this->avisarPessoa($usuarioId, "Você não atende mais pelo número {$r['numero']->apelido}", 'Fale com a gestora se tiver dúvidas.');

        return back()->with('sucesso', $r['pendenteDesconectar'] ? self::AVISO_DESCONECTAR : null);
    }

    public function mover(Request $request, int $id): RedirectResponse
    {
        $usuarioId = (string) $request->input('usuarioId');
        $destinoId = (int) $request->input('destinoId');
        $r = $this->tentar(fn () => $this->numeros->mover($id, $destinoId, $usuarioId, $request->user()->id));
        $this->equipe->registrar($request->user()->id, 'numero_desvinculado', ['numeroId' => $id, 'descricao' => "Mudou para {$r['destino']->apelido}"]);
        $this->equipe->registrar($request->user()->id, 'numero_vinculado', ['numeroId' => $destinoId, 'descricao' => $r['destino']->apelido]);
        $this->avisarPessoa($usuarioId, "Você agora atende pelo número {$r['destino']->apelido}", Telefone::formatar($r['destino']->telefone));

        return back()->with('sucesso', $r['pendenteDesconectar'] ? self::AVISO_DESCONECTAR : null);
    }

    public function principal(Request $request, int $id): RedirectResponse
    {
        $this->tentar(fn () => $this->numeros->definirPrincipal($id, (string) $request->input('usuarioId')));

        return back();
    }

    public function conexao(Request $request, int $vinculoId): RedirectResponse
    {
        $this->tentar(fn () => $request->input('estado') === 'desconectado' ? $this->numeros->confirmarDesconexao($vinculoId) : $this->numeros->confirmarConexao($vinculoId));

        return back();
    }

    public function status(Request $request, int $id): RedirectResponse
    {
        $status = $request->input('status');
        abort_unless(in_array($status, ['ativo', 'pausado', 'desativado'], true), 422);
        $this->tentar(fn () => $this->numeros->mudarStatus($id, $status, $request->user()->id));

        return back();
    }

    public function padrao(int $id): RedirectResponse
    {
        $this->tentar(fn () => $this->numeros->definirPadrao($id));

        return back();
    }

    /** O que muda ao tirar a pessoa do número: a tela mostra antes de confirmar. */
    public function impacto(Request $request, int $id): JsonResponse
    {
        $usuarioId = (string) $request->query('usuarioId');
        $pessoa = User::query()->find($usuarioId, ['id', 'papel', 'numeroPrincipalId']);
        $clientes = Cliente::query()->where('vendedorId', $usuarioId)->where('telefone', '<>', '')->count();
        $pendentes = Pedido::query()->where('vendedorId', $usuarioId)->where('status', 'pendente')->count();
        $outros = VinculoNumero::query()->where('usuarioId', $usuarioId)->whereNull('fimEm')->where('numeroId', '<>', $id)->whereHas('numero', fn ($q) => $q->where('status', 'ativo'))->count();
        $vendedora = $pessoa?->papel === Papel::Vendedor;

        return response()->json([
            'clientes' => $clientes, 'pendentes' => $pendentes, 'principal' => $pessoa?->numeroPrincipalId === $id,
            'ficaSemNumero' => $vendedora && $pessoa->numeroPrincipalId === $id && $outros === 0, 'podeTransferir' => $vendedora && $clientes + $pendentes > 0,
            'vendedoras' => User::query()->where('papel', Papel::Vendedor)->where('ativo', true)->where('id', '<>', $usuarioId)->orderBy('name')->get(['id', 'name']),
        ]);
    }
}
