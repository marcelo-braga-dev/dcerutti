<?php

namespace App\Http\Controllers\Painel;

use App\Enums\AcaoEquipe;
use App\Http\Controllers\Controller;
use App\Models\AtividadeEquipe;
use App\Models\Cliente;
use App\Models\SessaoEquipe;
use App\Models\User;
use App\Models\Venda;
use App\Queries\Equipe;
use App\Support\Datas;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Acompanhamento da equipe (D-26; porta de painel/equipe e consultas/equipe.ts), só o gestor. */
class EquipeController extends Controller
{
    public const PERIODOS = ['hoje' => 'Hoje', '7d' => 'Últimos 7 dias', '30d' => 'Últimos 30 dias', 'mes' => 'Este mês'];

    private const CONTATOS = ['oferta_enviada', 'whatsapp', 'cupom_enviado', 'convite_enviado', 'atendimento_contato', 'peca_enviada', 'pos_venda_feito'];

    private const VENDAS = ['pedido_confirmado', 'venda_caixa', 'venda_balcao', 'venda_manual'];

    private const POR_PAGINA = 60;

    /** Início do período e os dias que ele cobre. @return array{0: CarbonImmutable, 1: list<string>} */
    public static function intervalo(string $p): array
    {
        $hoje = Datas::dia();
        $n = match ($p) {
            'hoje' => 1, '7d' => 7, '30d' => 30, default => (int) substr($hoje, 8, 2)
        };
        $dias = array_map(fn ($i) => Datas::somarDiaIso(-($n - 1 - $i)), range(0, $n - 1));

        return [Datas::inicioDoDia($dias[0]), $dias];
    }

    public function __invoke(Request $request): Response
    {
        $u = $request->user();
        $periodo = array_key_exists((string) $request->query('periodo'), self::PERIODOS) ? (string) $request->query('periodo') : '7d';
        $acao = AcaoEquipe::tryFrom((string) $request->query('acao'))?->value;
        $pagina = min(20, max(1, (int) $request->query('pagina', 1)));
        [$de, $dias] = self::intervalo($periodo);

        $pessoas = User::query()->where('papel', 'vendedor')->where('ativo', true)->orderBy('name')->get(['id', 'name', 'ultimoAcessoEm', 'ultimoLoginEm']);
        $resumo = [];
        $vazio = fn () => ['segundos' => 0, 'porDia' => [], 'logins' => 0, 'clientes' => 0, 'pedidos' => 0, 'contatos' => 0, 'vendasConfirmadas' => 0, 'cancelamentos' => 0, 'diasAtivos' => 0];
        foreach (SessaoEquipe::query()->where('fimEm', '>=', $de)->get(['usuarioId', 'inicioEm', 'segundos']) as $s) {
            $resumo[$s->usuarioId] ??= $vazio();
            $resumo[$s->usuarioId]['segundos'] += $s->segundos;
            $d = Datas::dia($s->inicioEm);
            $resumo[$s->usuarioId]['porDia'][$d] = ($resumo[$s->usuarioId]['porDia'][$d] ?? 0) + $s->segundos;
        }
        foreach (AtividadeEquipe::query()->where('criadoEm', '>=', $de)->get(['usuarioId', 'tipo', 'criadoEm']) as $a) {
            $x = &$resumo[$a->usuarioId];
            $x ??= $vazio();
            $t = $a->tipo->value;
            match (true) {
                $t === 'login' => $x['logins']++, $t === 'cliente_cadastrado' => $x['clientes']++, $t === 'pedido_criado' => $x['pedidos']++,
                $t === 'pedido_cancelado' => $x['cancelamentos']++, in_array($t, self::VENDAS, true) => $x['vendasConfirmadas']++, default => null,
            };
            if (in_array($t, self::CONTATOS, true)) {
                $x['contatos']++;
            }
            $x['porDia'][Datas::dia($a->criadoEm)] ??= 0;
            unset($x);
        }
        $vendas = Venda::query()->where('data', '>=', $de)->groupBy('vendedorId')->selectRaw('vendedorId, sum(valor) v, count(*) n')->get()->keyBy('vendedorId');
        $carteira = Cliente::query()->where('telefone', '<>', '')->groupBy('vendedorId')->selectRaw('vendedorId, count(*) n')->pluck('n', 'vendedorId');

        $hist = AtividadeEquipe::query()->where('criadoEm', '>=', $de)->when($request->query('pessoa'), fn ($q, $p) => $q->where('usuarioId', $p))->when($acao, fn ($q) => $q->where('tipo', $acao));

        return Inertia::render('Painel/Equipe', [
            'periodo' => $periodo, 'periodos' => self::PERIODOS, 'ordem' => in_array($request->query('ordem'), ['vendido', 'tempo', 'acoes', 'acesso', 'nome'], true) ? $request->query('ordem') : 'vendido', 'dias' => $dias, 'acao' => $acao, 'pessoa' => $request->query('pessoa'), 'pagina' => $pagina,
            'linhas' => $pessoas->map(function ($p) use ($resumo, $vazio, $vendas, $carteira) {
                $r = $resumo[$p->id] ?? $vazio();
                $r['diasAtivos'] = count($r['porDia']);

                return [
                    'id' => $p->id, 'name' => $p->name, 'ultimoAcessoEm' => $p->ultimoAcessoEm?->toIso8601String(), 'ultimoLoginEm' => $p->ultimoLoginEm?->toIso8601String(),
                    'online' => Equipe::online($p->ultimoAcessoEm), 'resumo' => [...$r, 'porDia' => (object) $r['porDia']],
                    'vendido' => (float) ($vendas[$p->id]->v ?? 0), 'vendas' => (int) ($vendas[$p->id]->n ?? 0), 'carteira' => (int) ($carteira[$p->id] ?? 0),
                ];
            }),
            'pessoas' => User::query()->where('papel', 'vendedor')->orderBy('name')->get(['id', 'name', 'ativo']),
            'acoes' => (clone $hist)->with('usuario:id,name,papel')->orderByDesc('criadoEm')->orderByDesc('id')->take(self::POR_PAGINA * $pagina)->get()->map(fn ($a) => [
                'id' => (string) $a->id, 'tipo' => $a->tipo->value, 'criadoEm' => $a->criadoEm->toIso8601String(), 'descricao' => $a->descricao, 'clienteId' => $a->clienteId,
                'pedidoId' => $a->pedidoId, 'valor' => $a->valor === null ? null : (float) $a->valor, 'aparelho' => $a->aparelho,
                'usuario' => ['id' => $a->usuario?->id, 'name' => $a->usuario?->name ?? '—', 'papel' => $a->usuario?->papel?->value],
            ]),
            'total' => (clone $hist)->count(),
        ]);
    }
}
