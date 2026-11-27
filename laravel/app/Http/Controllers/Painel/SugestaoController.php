<?php

namespace App\Http\Controllers\Painel;

use App\Enums\Papel;
use App\Exceptions\ErroNegocio;
use App\Http\Controllers\Controller;
use App\Models\Cliente;
use App\Models\User;
use App\Services\Catalogo;
use App\Services\Config;
use App\Services\Sugestoes;
use App\Support\Escopo;
use App\Support\FiltroCatalogo;
use App\Support\Links;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Sugestões no painel (D-27; src/app/(painel)/painel/sugestoes e acoes/sugestoes.ts). */
class SugestaoController extends Controller
{
    public function __construct(private Sugestoes $sugestoes, private Config $config) {}

    private static function site(): string
    {
        return rtrim((string) config('app.url'), '/');
    }

    public function index(Request $request): Response
    {
        /** @var User $u */
        $u = $request->user();
        $f = ['vendedor' => $request->query('vendedor'), 'cliente' => $request->query('cliente'), 'situacao' => $request->query('situacao'), 'q' => mb_substr((string) $request->query('q'), 0, 60), 'pagina' => max(1, (int) $request->query('pagina', 1))];

        return Inertia::render('Painel/Sugestoes/Index', [
            ...$this->sugestoes->listar($u, $f), 'filtros' => $f,
            'conversao' => $this->sugestoes->conversao($u, now()->subDays(30)),
            'vendedores' => $u->ehGestor() ? User::query()->where('papel', Papel::Vendedor)->where('ativo', true)->orderBy('name')->get(['id', 'name']) : [],
            'cliente' => $f['cliente'] ? Escopo::vendedor(Cliente::query(), $u)->find($f['cliente'], ['id', 'nome']) : null,
        ]);
    }

    public function show(Request $request, string $id): Response
    {
        $s = $this->sugestoes->paraEquipe($request->user(), $id);
        abort_unless($s, 404);

        return Inertia::render('Painel/Sugestoes/Show', ['sugestao' => $s, 'link' => Links::daSugestao(self::site(), $s['codigo']), 'loja' => $this->config->nomeDaLoja()['nome']]);
    }

    /** O montador: clientes da carteira e as peças iniciais (promoções primeiro). */
    public function create(Request $request): Response
    {
        $u = $request->user();
        $clientes = Escopo::vendedor(Cliente::query(), $u)->where('telefone', '<>', '')->orderBy('nome')->get(['id', 'nome', 'telefone']);
        $de = $request->query('de') ?? $request->query('duplicar');
        $duplicar = $de ? $this->paraDuplicar($u, (string) $de) : null;
        $limite = (float) $this->config->get('caixa.descontoMaxVendedor');

        return Inertia::render('Painel/Sugestoes/Novo', [
            'clientes' => $clientes, 'clienteInicial' => $clientes->contains('id', $request->query('cliente')) ? $request->query('cliente') : '',
            'iniciais' => $this->buscar(''), 'limiteDesconto' => $u->ehGestor() ? null : $limite, 'dias' => Sugestoes::DIAS_VALIDADE, 'diasPadrao' => Sugestoes::DIAS_PADRAO,
            'maxItens' => Sugestoes::MAX_ITENS, 'cupons' => (bool) $this->config->get('cupons.ligados') && ($u->ehGestor() || $this->config->get('cupons.vendedorAplica')),
            'duplicar' => $duplicar, 'loja' => $this->config->nomeDaLoja()['nome'],
        ]);
    }

    /** @return list<array<string, mixed>> Até 24 peças com estoque; sem termo, promoções primeiro. */
    private function buscar(string $termo): array
    {
        $termos = FiltroCatalogo::termos(mb_substr($termo, 0, 80));
        $lista = array_values(array_filter(app(Catalogo::class)->lista(), fn ($p) => FiltroCatalogo::emEstoque($p) && ($termos ? FiltroCatalogo::casaBusca($p, $termos) : count($p['imagens']) > 0)));
        if (! $termos) {
            usort($lista, fn ($a, $b) => (int) ($b['precoCheio'] > $b['preco']) <=> (int) ($a['precoCheio'] > $a['preco']));
        }

        return array_map(fn ($p) => self::peca($p), array_slice($lista, 0, 24));
    }

    /** @param array<string, mixed> $p @return array<string, mixed> */
    private static function peca(array $p): array
    {
        return [
            'id' => $p['id'], 'nome' => $p['nome'], 'marca' => $p['marca'], 'cor' => $p['corNome'] ?? $p['cor'], 'categoria' => $p['categoria'], 'preco' => $p['preco'], 'precoCheio' => $p['precoCheio'],
            'imagem' => $p['imagens'][0] ?? null, 'variantes' => array_values(array_map(fn ($v) => ['id' => $v['id'], 'tamanho' => $v['tamanho'], 'disponivel' => $v['disponivel']], array_filter($p['variantes'], fn ($v) => $v['disponivel'] > 0))),
        ];
    }

    public function pecas(Request $request): JsonResponse
    {
        return response()->json($this->buscar((string) $request->query('q', '')));
    }

    /** @return ?array<string, mixed> */
    private function paraDuplicar(User $u, string $id): ?array
    {
        $s = $this->sugestoes->paraEquipe($u, $id);
        if (! $s) {
            return null;
        }
        $porId = array_column(app(Catalogo::class)->lista(), null, 'id');
        $itens = [];
        foreach ($s['itens'] as $i) {
            $p = $porId[$i['produto']['id'] ?? -1] ?? null;
            if (! $p || ! FiltroCatalogo::emEstoque($p)) {
                continue;
            }
            $oferta = $i['precoOferta'];
            $itens[] = ['peca' => self::peca($p), 'pct' => $oferta && $oferta < $p['preco'] ? str_replace('.', ',', (string) (round((1 - $oferta / $p['preco']) * 1000) / 10)) : '', 'nota' => $i['nota'] ?? ''];
        }

        return ['titulo' => $s['titulo'], 'mensagem' => $s['mensagem'], 'cupom' => $s['cupomCodigo'], 'itens' => $itens];
    }

    /** Registros da cliente para o painel lateral do montador. */
    public function historico(Request $request, string $clienteId): JsonResponse
    {
        $h = $this->sugestoes->historico($request->user(), $clienteId);

        return response()->json($h ? [...$h, 'maisUsados' => Sugestoes::tamanhosDaCliente($clienteId)] : null);
    }

    public function automatica(Request $request, string $clienteId): JsonResponse
    {
        return response()->json($this->sugestoes->automatica($request->user(), $clienteId));
    }

    /** Cria a sugestão e devolve o que a mensagem do WhatsApp precisa. */
    public function store(Request $request): JsonResponse
    {
        $d = $request->validate([
            'clienteId' => ['required', 'string'], 'titulo' => ['required', 'string', 'max:200'], 'mensagem' => ['nullable', 'string', 'max:2000'], 'dias' => ['nullable', 'integer'],
            'cupom' => ['nullable', 'string', 'max:40'], 'enviar' => ['nullable', 'boolean'], 'itens' => ['required', 'array', 'min:1', 'max:60'],
            'itens.*.produtoId' => ['required', 'integer'], 'itens.*.varianteId' => ['nullable', 'integer'], 'itens.*.precoOferta' => ['nullable', 'numeric'], 'itens.*.nota' => ['nullable', 'string', 'max:400'],
        ], ['clienteId.required' => 'Escolha a cliente.', 'titulo.required' => 'Dê um título para a sugestão, ex.: "Novidades no seu tamanho".', 'itens.*' => 'Adicione pelo menos uma peça.']);
        try {
            $r = $this->sugestoes->criar($request->user(), [...$d, 'cupom' => trim((string) ($d['cupom'] ?? '')) ?: null, 'enviar' => $d['enviar'] ?? true]);
        } catch (ErroNegocio $e) {
            return response()->json(['ok' => false, 'erro' => $e->getMessage()]);
        }
        $s = $r['sugestao'];

        return response()->json([
            'ok' => true, 'id' => $s->id, 'codigo' => $s->codigo, 'link' => Links::daSugestao(self::site(), $s->codigo), 'telefone' => $r['cliente']->telefone, 'nomeCliente' => $r['cliente']->nome,
            'titulo' => $s->titulo, 'mensagem' => $s->mensagem, 'pecas' => $r['pecas'], 'validaAte' => $s->validaAte->toIso8601String(), 'temOferta' => $r['temOferta'], 'cupom' => $s->cupomCodigo,
        ]);
    }

    public function cancelar(Request $request, string $id): RedirectResponse
    {
        $this->tentar(fn () => $this->sugestoes->cancelar($request->user(), $id));

        return back()->with('sucesso', 'Sugestão cancelada.');
    }

    public function renovar(Request $request, string $id): RedirectResponse
    {
        $this->tentar(fn () => $this->sugestoes->renovar($request->user(), $id, (int) $request->input('dias')));

        return back()->with('sucesso', 'Sugestão renovada.');
    }

    public function enviada(Request $request, string $id): RedirectResponse
    {
        $this->tentar(fn () => $this->sugestoes->marcarEnviada($request->user(), $id));

        return back();
    }

    public function lembrar(Request $request, string $id): RedirectResponse
    {
        $this->tentar(fn () => $this->sugestoes->lembrar($request->user(), $id));

        return back();
    }
}
