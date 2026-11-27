<?php

namespace App\Http\Controllers\Painel;

use App\Http\Controllers\Controller;
use App\Models\Cupom;
use App\Models\Pedido;
use App\Models\Produto;
use App\Models\User;
use App\Queries\Cupons;
use App\Queries\Pagamentos;
use App\Services\Catalogo;
use App\Services\Config;
use App\Services\Cupons\AvaliadorDeCupom;
use App\Services\Cupons\CupomNoPedido;
use App\Services\Equipe;
use App\Services\Pagamentos\Cobrancas;
use App\Services\Pedidos\Pedidos;
use App\Support\Escopo;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

use function Illuminate\Support\defer;

/** Detalhe do pedido e as ações da equipe sobre ele (src/app/(painel)/painel/pedidos/[id] e src/server/acoes/pedidos.ts). */
class DetalhePedidoController extends Controller
{
    public function __construct(private Pedidos $pedidos, private Equipe $equipe, private Config $config) {}

    private function pedidoDaEquipe(Request $request, string $id): Pedido
    {
        $p = Pedido::query()->find($id);
        abort_unless($p && Escopo::podeAcessar($request->user(), $p->vendedorId), 404);

        return $p;
    }

    public function show(Request $request, string $id, Cupons $cupons): Response
    {
        /** @var User $u */
        $u = $request->user();
        $p = $this->pedidoDaEquipe($request, $id)->load([
            'itens' => fn ($q) => $q->orderBy('id'), 'cliente:id,nome,endereco,cidade', 'venda', 'vendedor:id,name',
            'historico' => fn ($q) => $q->orderByDesc('criadoEm')->orderByDesc('id'), 'cupom:id,tipo,valor,tetoDesconto,descricao', 'pagamentos' => fn ($q) => $q->orderBy('id'),
        ]);
        $ativos = Produto::query()->whereIn('id', $p->itens->pluck('produtoId'))->where('ativo', true)->pluck('id')->all();
        $gerado = Cupom::query()->with(CupomNoPedido::COM_ALVOS)->where('pedidoOrigemId', $p->id)->first();
        $pendente = $p->status->value === 'pendente';
        $podeAplicar = $this->config->get('cupons.ligados') && ($u->ehGestor() || $this->config->get('cupons.vendedorAplica'));
        $beneficio = $p->cupom ? AvaliadorDeCupom::beneficio(['tipo' => $p->cupom->tipo->value, 'valor' => $p->cupom->valor, 'tetoDesconto' => $p->cupom->tetoDesconto]) : '';

        $pgto = $p->origem->value === 'balcao' ? null : app(Pagamentos::class)->doPedido($u, $p->id);
        if ($pgto && $pgto['ativa']) {
            defer(fn () => app(Cobrancas::class)->talvezConciliar());
        }
        $mostrarPagamento = $pgto && ($pgto['cfg']['ligado'] || $pgto['cobrancas']);

        return Inertia::render('Painel/Pedidos/Show', [
            'pagamento' => $mostrarPagamento ? $pgto : null,
            'pedido' => [
                ...PedidoController::resumo($p),
                'cep' => $p->cep, 'entregaSituacao' => $p->entregaSituacao->value, 'confirmadoEm' => $p->confirmadoEm?->toIso8601String(), 'canceladoEm' => $p->canceladoEm?->toIso8601String(),
                'cliente' => ['id' => $p->cliente->id, 'nome' => $p->cliente->nome, 'endereco' => $p->cliente->endereco, 'cidade' => $p->cliente->cidade],
                'venda' => $p->venda ? ['valor' => (float) $p->venda->valor, 'data' => $p->venda->data->toIso8601String()] : null,
                'cupom' => $p->cupom ? ['beneficio' => $beneficio, 'descricao' => $p->cupom->descricao] : null,
                'itens' => $p->itens->map(fn ($i) => [
                    'id' => $i->id, 'varianteId' => $i->varianteId, 'produtoId' => $i->produtoId, 'referencia' => $i->referencia, 'nome' => $i->nome, 'marca' => $i->marca,
                    'cor' => $i->cor, 'imagem' => $i->imagem, 'tamanho' => $i->tamanho, 'codigoInterno' => $i->codigoInterno, 'quantidade' => $i->quantidade,
                    'precoUnitario' => (float) $i->precoUnitario, 'precoTabela' => $i->precoTabela === null ? null : (float) $i->precoTabela,
                    'descontoCupom' => (float) $i->descontoCupom, 'situacao' => $i->situacao->value,
                    'linkProduto' => in_array($i->produtoId, $ativos, true) ? "/produto/{$i->referencia}" : ($u->ehGestor() ? "/painel/produtos/{$i->produtoId}" : null),
                ])->all(),
                'historico' => $p->historico->map(fn ($h) => [
                    'id' => $h->id, 'acao' => $h->acao->value, 'autor' => $h->autor, 'nomeUsuario' => $h->nomeUsuario, 'mudancas' => $h->mudancas, 'itens' => $h->itens,
                    'total' => (float) $h->total, 'frete' => $h->frete === null ? null : (float) $h->frete, 'observacao' => $h->observacao, 'criadoEm' => $h->criadoEm->toIso8601String(),
                ])->all(),
                'pagamentos' => $p->pagamentos->map(fn ($g) => ['id' => $g->id, 'forma' => $g->forma->value, 'valor' => (float) $g->valor, 'parcelas' => $g->parcelas, 'recebido' => $g->recebido === null ? null : (float) $g->recebido])->all(),
            ],
            'cupomGerado' => $gerado ? [
                'codigo' => $gerado->codigo, 'regra' => AvaliadorDeCupom::regraEmPalavras(CupomNoPedido::regraDe($gerado), CupomNoPedido::nomesDosAlvos($gerado)),
                'inicioEm' => $gerado->inicioEm->toIso8601String(), 'fimEm' => $gerado->fimEm?->toIso8601String(), 'quemAplica' => $gerado->quemAplica->value,
            ] : null,
            'cores' => $pendente ? $this->coresDosModelos($p->itens->pluck('produtoId')->unique()->all()) : (object) [],
            'cupomEdicao' => ! $pendente ? null : [
                'podeAplicar' => $podeAplicar,
                'atual' => $p->codigoCupom ? ['codigo' => $p->codigoCupom, 'desconto' => (float) $p->descontoCupom, 'freteGratis' => $p->freteCupom, 'beneficio' => $beneficio] : null,
                'disponiveis' => ! $podeAplicar ? [] : collect([
                    ...collect($cupons->daFicha($p->clienteId))->filter(fn ($c) => $c['situacao'] === 'disponivel' && $c['quemAplica'] !== 'cliente')->map(fn ($c) => ['codigo' => $c['codigo'], 'regra' => $c['regra']])->all(),
                    ...collect($cupons->paraDivulgar($u))->filter(fn ($c) => $c['quemAplica'] !== 'cliente' && $c['situacao'] === 'ativo' && (! $c['especifico'] || collect($c['clientes'])->contains('id', $p->clienteId)))
                        ->map(fn ($c) => ['codigo' => $c['codigo'], 'regra' => $c['regra']])->all(),
                ])->unique('codigo')->values()->all(),
            ],
            'diasExpiracao' => (int) $this->config->get('diasExpiracao'),
            'site' => rtrim((string) config('app.url'), '/'),
        ]);
    }

    /**
     * Cores do mesmo modelo de cada produto, para trocar no pedido. Na Hering, o modelo são os 4 primeiros caracteres
     * da referência (mesma marca). Inclui tamanhos sem estoque: o servidor confere ao salvar.
     *
     * @param  list<int>  $produtoIds
     * @return array<int, list<array<string, mixed>>>
     */
    private function coresDosModelos(array $produtoIds): array
    {
        $todos = app(Catalogo::class)->lista();
        $r = [];
        foreach ($produtoIds as $id) {
            $base = collect($todos)->firstWhere('id', $id);
            if (! $base) {
                $r[$id] = [];

                continue;
            }
            $modelo = mb_strtoupper(mb_substr($base['referencia'], 0, 4));
            $mesmos = mb_strlen($base['referencia']) >= 6
                ? collect($todos)->filter(fn ($p) => $p['marca'] === $base['marca'] && str_starts_with(mb_strtoupper($p['referencia']), $modelo))
                : collect([$base]);
            $r[$id] = $mesmos->sortByDesc(fn ($p) => $p['id'] === $id)->take(24)->map(fn ($p) => [
                'id' => $p['id'], 'referencia' => $p['referencia'], 'nome' => $p['nome'], 'cor' => $p['cor'], 'preco' => $p['preco'], 'imagem' => $p['imagens'][0] ?? null, 'variantes' => $p['variantes'],
            ])->values()->all();
        }

        return $r;
    }

    /** Busca do montador e do "Incluir peça" (Catalogo::buscarPecas). */
    public function buscarPecas(Request $request, Catalogo $catalogo): JsonResponse
    {
        return response()->json($catalogo->buscarPecas((string) $request->query('q')));
    }

    public function confirmar(Request $request, string $id): RedirectResponse
    {
        $this->pedidoDaEquipe($request, $id);
        $ficaram = collect((array) $request->input('ficaram', []))->mapWithKeys(fn ($v, $k) => [(int) $k => is_numeric($v) ? (int) $v : $v])->all();
        $this->tentar(fn () => $this->pedidos->confirmar($id, $ficaram, $request->user()->id));
        $this->equipe->registrarPedido($request->user()->id, 'pedido_confirmado', $id);

        return back()->with('sucesso', 'Pedido confirmado.');
    }

    public function editarItens(Request $request, string $id): RedirectResponse
    {
        $this->pedidoDaEquipe($request, $id);
        $d = $request->validate([
            'linhas' => ['array', 'max:40'], 'linhas.*.itemId' => ['nullable', 'integer'], 'linhas.*.varianteId' => ['required', 'integer'],
            'linhas.*.quantidade' => ['required', 'integer'], 'linhas.*.preco' => ['required', 'numeric'], 'observacao' => ['nullable', 'string', 'max:500'],
        ], ['*' => 'Confira as peças do pedido.']);
        $linhas = array_map(fn ($l) => ['itemId' => isset($l['itemId']) ? (int) $l['itemId'] : null, 'varianteId' => (int) $l['varianteId'], 'quantidade' => (int) $l['quantidade'], 'preco' => (float) $l['preco']], $d['linhas'] ?? []);
        $this->tentar(fn () => $this->pedidos->editar($id, $linhas, $this->config->get('frete'), $request->user()->id, $d['observacao'] ?? null));
        $this->equipe->registrarPedido($request->user()->id, 'pedido_editado', $id);

        return back()->with('sucesso', 'Pedido atualizado.')->with('avisarCliente', true);
    }

    public function cupom(Request $request, string $id): RedirectResponse
    {
        $this->pedidoDaEquipe($request, $id);
        $codigo = trim((string) $request->input('codigo')) ?: null;
        $u = $request->user();
        if ($codigo) {
            if (! $this->config->get('cupons.ligados')) {
                $this->falhar('Os cupons estão desligados em Configurações.');
            }
            if (! $u->ehGestor() && ! $this->config->get('cupons.vendedorAplica')) {
                $this->falhar('A loja não liberou vendedores para aplicar cupons.');
            }
        }
        $obs = mb_substr((string) $request->input('observacao'), 0, 500) ?: null;
        $this->tentar(fn () => $this->pedidos->trocarCupom($id, $codigo, $this->config->get('frete'), $u->id, $obs));
        $this->equipe->registrarPedido($u->id, 'cupom_pedido', $id, $codigo ? 'cupom '.mb_strtoupper($codigo) : 'cupom retirado');

        return back()->with('sucesso', $codigo ? 'Cupom aplicado.' : 'Cupom retirado.')->with('avisarCliente', true);
    }

    /**
     * A equipe cancela; o motivo é obrigatório e fica no histórico. Em aberto: a reserva volta (`expirado` = o prazo
     * venceu). Confirmado: desfaz a venda e as peças voltam ao estoque.
     */
    public function cancelar(Request $request, string $id): RedirectResponse
    {
        $p = $this->pedidoDaEquipe($request, $id);
        $motivo = mb_substr(trim((string) $request->input('motivo')), 0, 500);
        if (mb_strlen($motivo) < 3) {
            $this->falhar('Informe o motivo do cancelamento.');
        }
        if ($p->status->value === 'cancelado') {
            $this->falhar('Este pedido já foi cancelado.');
        }
        $confirmado = $p->status->value === 'confirmado';
        $u = $request->user();
        $this->tentar(fn () => $confirmado
            ? $this->pedidos->desfazerVenda($id, $u->id, $motivo)
            : $this->pedidos->cancelar($id, $request->boolean('expirado') ? 'expirado' : 'equipe', $u->id, $motivo));
        $this->equipe->registrarPedido($u->id, $confirmado ? 'venda_desfeita' : 'pedido_cancelado', $id, $motivo);

        return back()->with('sucesso', $confirmado ? 'Venda desfeita.' : 'Pedido cancelado.');
    }

    /** Pagamento e entrega combinados fora do site (docs/26). */
    public function situacao(Request $request, string $id): RedirectResponse
    {
        $p = $this->pedidoDaEquipe($request, $id);
        $d = $request->validate(['pagamento' => ['required', Rule::in(['a_combinar', 'aguardando', 'pago'])], 'entrega' => ['required', Rule::in(['a_combinar', 'separando', 'enviado', 'entregue'])]]);
        if ($p->status->value === 'cancelado') {
            $this->falhar('Este pedido foi cancelado.');
        }
        $p->update(['pagamentoSituacao' => $d['pagamento'], 'entregaSituacao' => $d['entrega']]);
        $rotulos = ['a_combinar' => 'a combinar', 'aguardando' => 'Aguardando pagamento', 'pago' => 'Pago', 'separando' => 'Separando', 'enviado' => 'Enviado', 'entregue' => 'Entregue'];
        $this->equipe->registrar($request->user()->id, 'pedido_editado', ['clienteId' => $p->clienteId, 'pedidoId' => $p->id, 'descricao' => "{$p->nomeCliente} · {$p->codigo} · {$rotulos[$d['pagamento']]} · {$rotulos[$d['entrega']]}"]);

        return back()->with('sucesso', 'Situação salva.');
    }
}
