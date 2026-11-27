<?php

namespace App\Http\Controllers\Painel;

use App\Enums\MotivoEstoque;
use App\Http\Controllers\Controller;
use App\Models\Categoria;
use App\Models\Custo;
use App\Models\Marca;
use App\Models\MovimentoEstoque;
use App\Models\Produto;
use App\Models\Variante;
use App\Services\Arquivos;
use App\Services\Catalogo;
use App\Services\Estoque;
use App\Support\Dinheiro;
use App\Support\Pecas;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/** Produtos e estoque do gestor (src/app/(painel)/painel/produtos e src/server/acoes/produtos.ts). */
class ProdutoController extends Controller
{
    public const POR_PAGINA = 40;

    private const FILTROS = ['', 'sem-foto', 'sem-custo', 'esgotados', 'inativos'];

    public function __construct(private Catalogo $catalogo, private Arquivos $arquivos) {}

    public function index(Request $request): Response
    {
        $q = trim((string) $request->query('q'));
        $filtro = in_array($request->query('filtro', ''), self::FILTROS, true) ? (string) $request->query('filtro', '') : '';
        $pagina = max(1, (int) $request->query('pagina', 1));
        $consulta = Produto::query()
            ->when($q !== '', fn ($x) => $x->where(fn ($y) => $y->where('nome', 'like', "%{$q}%")->orWhere('referencia', 'like', "%{$q}%")->orWhereHas('variantes', fn ($v) => $v->where('codigoInterno', $q))))
            ->when($filtro === 'sem-foto', fn ($x) => $x->whereDoesntHave('imagens'))->when($filtro === 'sem-custo', fn ($x) => $x->whereDoesntHave('custo'))
            ->when($filtro === 'esgotados', fn ($x) => $x->whereDoesntHave('variantes', fn ($v) => $v->where('estoque', '>', 0)))->when($filtro === 'inativos', fn ($x) => $x->where('ativo', false));
        $total = (clone $consulta)->count();
        $produtos = $consulta->with(['marca:id,nome', 'categoria:id,nome', 'custo', 'imagens' => fn ($i) => $i->orderBy('ordem'), 'variantes:id,produtoId,tamanho,estoque,reservado'])
            ->orderByDesc('ativo')->orderBy('nome')->limit(self::POR_PAGINA * $pagina)->get();

        // Indicadores do estoque ativo (src/server/relatorios.ts → indicadoresEstoque).
        $ativos = Produto::query()->where('ativo', true)->with(['custo', 'variantes:id,produtoId,estoque'])->withCount('imagens')->get(['id', 'preco']);
        $pecas = 0;
        $aCusto = 0.0;
        $aVenda = 0.0;
        $semCusto = 0;
        $semFoto = 0;
        foreach ($ativos as $p) {
            $qtd = $p->variantes->sum(fn ($v) => max(0, $v->estoque));
            $pecas += $qtd;
            $aVenda += $qtd * (float) $p->preco;
            $p->custo ? $aCusto += $qtd * (float) $p->custo->valor : $semCusto++;
            if (! $p->imagens_count) {
                $semFoto++;
            }
        }

        return Inertia::render('Painel/Produtos/Index', [
            'indicadores' => ['modelos' => $ativos->count(), 'pecas' => $pecas, 'aCusto' => $aCusto, 'aVenda' => $aVenda, 'lucro' => $aVenda - $aCusto, 'margem' => $aVenda ? ($aVenda - $aCusto) / $aVenda : 0, 'semCusto' => $semCusto, 'semFoto' => $semFoto],
            'produtos' => $produtos->map(fn (Produto $p) => [
                'id' => $p->id, 'referencia' => $p->referencia, 'nome' => $p->nome, 'marca' => $p->marca->nome, 'categoria' => $p->categoria->nome, 'ativo' => $p->ativo, 'imperdivel' => $p->imperdivel,
                'preco' => (float) $p->preco, 'precoCheio' => (float) $p->precoCheio, 'custo' => $p->custo ? (float) $p->custo->valor : null, 'imagem' => $p->imagens->first()?->url,
                'variantes' => $p->variantes->sortBy(fn ($v) => Pecas::posicaoTamanho($v->tamanho))->map(fn ($v) => ['tamanho' => $v->tamanho, 'estoque' => $v->estoque, 'reservado' => $v->reservado])->values()->all(),
            ])->all(),
            'total' => $total, 'filtros' => ['q' => $q ?: null, 'filtro' => $filtro ?: null], 'pagina' => $pagina,
        ]);
    }

    /** @return array{marcas: mixed, categorias: mixed} */
    private function listas(): array
    {
        return ['marcas' => Marca::query()->orderBy('nome')->get(['id', 'nome']), 'categorias' => Categoria::query()->orderBy('nome')->get(['id', 'nome'])];
    }

    public function create(): Response
    {
        return Inertia::render('Painel/Produtos/Form', ['produto' => null, ...$this->listas()]);
    }

    public function show(int $id): Response
    {
        $p = Produto::query()->with(['imagens' => fn ($q) => $q->orderBy('ordem'), 'videos' => fn ($q) => $q->orderBy('ordem'), 'custo', 'variantes' => fn ($q) => $q->withCount('itens')])->findOrFail($id);
        $movimentos = MovimentoEstoque::query()->whereIn('varianteId', $p->variantes->pluck('id'))->with('usuario:id,name')->orderByDesc('criadoEm')->limit(30)->get();
        $tamanhoDe = $p->variantes->pluck('tamanho', 'id');

        return Inertia::render('Painel/Produtos/Form', [
            'produto' => [
                'id' => $p->id, 'referencia' => $p->referencia, 'nome' => $p->nome, 'marcaId' => $p->marcaId, 'categoriaId' => $p->categoriaId, 'subcategoria' => $p->subcategoria,
                'genero' => $p->genero->value, 'estacao' => $p->estacao?->value, 'cor' => $p->cor, 'composicao' => $p->composicao, 'descricao' => $p->descricao,
                'destaques' => is_array($p->destaques) ? $p->destaques : [], 'preco' => (float) $p->preco, 'precoCheio' => (float) $p->precoCheio, 'custo' => $p->custo ? (float) $p->custo->valor : null,
                'imperdivel' => $p->imperdivel, 'ativo' => $p->ativo, 'atualizadoEm' => $p->atualizadoEm?->toIso8601String(),
                'imagens' => $p->imagens->pluck('url')->all(), 'videos' => $p->videos->map(fn ($v) => ['url' => $v->url, 'capa' => $v->capa])->all(),
                'variantes' => $p->variantes->sortBy(fn ($v) => Pecas::posicaoTamanho($v->tamanho))->map(fn ($v) => [
                    'id' => $v->id, 'tamanho' => $v->tamanho, 'estoque' => $v->estoque, 'reservado' => $v->reservado, 'codigoInterno' => $v->codigoInterno, 'ean' => $v->ean, 'pedidos' => $v->itens_count,
                ])->values()->all(),
            ],
            'movimentos' => $movimentos->map(fn ($m) => [
                'id' => $m->id, 'delta' => $m->delta, 'motivo' => $m->motivo->value, 'observacao' => $m->observacao, 'tamanho' => $tamanhoDe[$m->varianteId] ?? '', 'criadoEm' => $m->criadoEm->toIso8601String(), 'usuario' => $m->usuario?->name,
            ])->all(),
            ...$this->listas(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $id = $this->salvar($request, null);

        return redirect("/painel/produtos/{$id}")->with('sucesso', 'Produto cadastrado.');
    }

    public function update(Request $request, int $id): RedirectResponse
    {
        Produto::query()->findOrFail($id);
        $this->salvar($request, $id);

        return back()->with('sucesso', 'Produto salvo.');
    }

    /** @return list<string> */
    private static function linhas(mixed $v): array
    {
        $lista = is_array($v) ? $v : preg_split('/\r?\n/', (string) $v);

        return array_values(array_filter(array_map(fn ($l) => trim((string) $l), $lista)));
    }

    /** @return list<array{url: string, capa: ?string}> */
    private static function videos(mixed $v): array
    {
        $local = fn ($u) => is_string($u) && preg_match('#^/arquivos/[\w./-]+$#', $u) && ! str_contains($u, '..');
        $lista = is_string($v) ? json_decode($v ?: '[]', true) : $v;
        if (! is_array($lista) || count($lista) > 5) {
            throw ValidationException::withMessages(['videos' => 'Vídeos inválidos: no máximo 5, enviados por aqui.']);
        }
        foreach ($lista as $x) {
            if (! is_array($x) || ! $local($x['url'] ?? null) || ! preg_match('/\.(mp4|webm)$/', $x['url']) || (($x['capa'] ?? null) !== null && ! $local($x['capa']))) {
                throw ValidationException::withMessages(['videos' => 'Vídeos inválidos: no máximo 5, enviados por aqui.']);
            }
        }

        return array_map(fn ($x) => ['url' => $x['url'], 'capa' => $x['capa'] ?? null], array_values($lista));
    }

    private function salvar(Request $request, ?int $id): int
    {
        $d = $request->validate([
            'referencia' => ['required', 'string', 'min:2', 'max:20'], 'nome' => ['required', 'string', 'min:3', 'max:160'], 'marcaId' => ['required', 'integer', 'min:1'],
            'categoriaId' => ['required'], 'novaCategoria' => ['nullable', 'string', 'max:60'], 'subcategoria' => ['nullable', 'string', 'max:60'],
            'genero' => ['required', 'in:feminino,masculino,unissex'], 'estacao' => ['nullable', 'in:inverno,verao'], 'cor' => ['nullable', 'string', 'max:60'],
            'preco' => ['required'], 'precoCheio' => ['nullable'], 'custo' => ['nullable'], 'descricao' => ['nullable', 'string', 'max:4000'], 'composicao' => ['nullable', 'string', 'max:500'],
        ], [
            'referencia.required' => 'Informe a referência.', 'referencia.min' => 'Informe a referência.', 'nome.required' => 'Informe o nome.', 'nome.min' => 'Informe o nome.',
            'marcaId.*' => 'Escolha a marca.', 'categoriaId.required' => 'Escolha a categoria.', 'genero.*' => 'Escolha o gênero.', 'preco.required' => 'Informe o preço de venda.',
        ]);
        $erro = fn (string $campo, string $msg) => throw ValidationException::withMessages([$campo => $msg]);
        $ref = mb_strtoupper(trim($d['referencia']));
        $preco = Dinheiro::lerValor((string) $d['preco']);
        if (! ($preco > 0 && $preco < 100_000)) {
            $erro('preco', 'Informe o preço de venda.');
        }
        $precoCheio = trim((string) ($d['precoCheio'] ?? '')) !== '' ? Dinheiro::lerValor((string) $d['precoCheio']) : $preco;
        if (! ($precoCheio >= $preco)) {
            $erro('precoCheio', 'O preço cheio deve ser maior ou igual ao preço de venda.');
        }
        $custo = trim((string) ($d['custo'] ?? '')) !== '' ? Dinheiro::lerValor((string) $d['custo']) : null;
        if ($custo !== null && ! ($custo >= 0)) {
            $erro('custo', 'Custo inválido.');
        }
        $imagens = self::linhas($request->input('imagens', []));
        foreach ($imagens as $u) {
            if (! preg_match('#^(https://\S+|/arquivos/[\w./-]+)$#', $u) || str_contains($u, '..')) {
                $erro('imagens', 'Cada linha deve ser uma foto enviada (/arquivos/...) ou um endereço https://.');
            }
        }
        $videos = self::videos($request->input('videos', []));
        $repetida = Produto::query()->where('referencia', $ref)->value('id');
        if ($repetida && $repetida !== $id) {
            $erro('referencia', 'Já existe um produto com esta referência.');
        }
        if ($d['categoriaId'] === 'nova') {
            $nova = trim((string) ($d['novaCategoria'] ?? ''));
            $nova !== '' || $erro('novaCategoria', 'Informe o nome da nova categoria.');
            $categoriaId = Categoria::query()->firstOrCreate(['slug' => Str::slug($nova)], ['nome' => $nova])->id;
        } elseif ((int) $d['categoriaId'] > 0) {
            $categoriaId = (int) $d['categoriaId'];
        } else {
            $erro('categoriaId', 'Escolha a categoria.');
        }
        $dados = [
            'referencia' => $ref, 'nome' => trim($d['nome']), 'marcaId' => (int) $d['marcaId'], 'categoriaId' => $categoriaId, 'subcategoria' => ($d['subcategoria'] ?? null) ?: null,
            'genero' => $d['genero'], 'estacao' => ($d['estacao'] ?? null) ?: null, 'cor' => ($d['cor'] ?? null) ?: null, 'preco' => number_format($preco, 2, '.', ''),
            'precoCheio' => number_format($precoCheio, 2, '.', ''), 'descricao' => ($d['descricao'] ?? null) ?: null, 'composicao' => ($d['composicao'] ?? null) ?: null,
            'destaques' => self::linhas($request->input('destaques', [])), 'imperdivel' => $request->boolean('imperdivel'), 'ativo' => $request->boolean('ativo'),
        ];
        // Fotos e vídeos que saírem da lista têm o arquivo apagado depois de salvar (se nada mais usar).
        $antes = $id ? Produto::query()->with(['imagens', 'videos'])->find($id) : null;
        $anteriores = $antes ? [...$antes->imagens->pluck('url')->all(), ...$antes->videos->flatMap(fn ($v) => array_filter([$v->url, $v->capa]))->all()] : [];
        $atuais = [...$imagens, ...collect($videos)->flatMap(fn ($v) => array_filter([$v['url'], $v['capa']]))->all()];
        $salvo = DB::transaction(function () use ($id, $dados, $imagens, $videos, $custo) {
            $p = $id ? tap(Produto::query()->findOrFail($id))->update($dados) : Produto::query()->create($dados);
            $p->imagens()->delete();
            $p->imagens()->createMany(array_map(fn ($url, $ordem) => ['url' => $url, 'ordem' => $ordem], $imagens, array_keys($imagens)));
            $p->videos()->delete();
            $p->videos()->createMany(array_map(fn ($v, $ordem) => [...$v, 'ordem' => $ordem], $videos, array_keys($videos)));
            $custo === null ? Custo::query()->where('produtoId', $p->id)->delete() : Custo::query()->updateOrCreate(['produtoId' => $p->id], ['valor' => number_format($custo, 2, '.', '')]);

            return $p->id;
        });
        $this->arquivos->removerSemUso(array_values(array_diff($anteriores, $atuais)));
        $this->catalogo->invalidar();

        return $salvo;
    }

    public function destroy(int $id): RedirectResponse
    {
        $this->tentar(fn () => $this->arquivos->excluirProduto($id));
        $this->catalogo->invalidar();

        return redirect('/painel/produtos')->with('sucesso', 'Produto excluído.');
    }

    public function adicionarVariante(Request $request, int $id, Estoque $estoque): RedirectResponse
    {
        Produto::query()->findOrFail($id);
        $d = $request->validate([
            'tamanho' => ['required', 'string', 'max:5'], 'codigoInterno' => ['nullable', 'string', 'max:20'], 'ean' => ['nullable', 'regex:/^\d{0,14}$/'], 'estoque' => ['required', 'integer', 'min:0', 'max:10000'],
        ], ['tamanho.required' => 'Informe o tamanho.', 'ean.regex' => 'EAN só com números.', 'estoque.*' => 'Estoque inválido.']);
        $tamanho = mb_strtoupper(trim($d['tamanho']));
        if (Variante::query()->where('produtoId', $id)->where('tamanho', $tamanho)->exists()) {
            throw ValidationException::withMessages(['tamanho' => 'Este tamanho já existe no produto.']);
        }
        if (! empty($d['codigoInterno']) && Variante::query()->where('codigoInterno', $d['codigoInterno'])->exists()) {
            throw ValidationException::withMessages(['codigoInterno' => 'Código interno já usado em outra peça.']);
        }
        DB::transaction(function () use ($id, $tamanho, $d, $estoque, $request) {
            $v = Variante::query()->create(['produtoId' => $id, 'tamanho' => $tamanho, 'codigoInterno' => ($d['codigoInterno'] ?? null) ?: null, 'ean' => ($d['ean'] ?? null) ?: null, 'estoque' => (int) $d['estoque'], 'ordem' => Pecas::posicaoTamanho($tamanho)]);
            $estoque->registrarEstoqueInicial($v->id, (int) $d['estoque'], $request->user()->id);
        });
        $this->catalogo->invalidar();

        return back()->with('sucesso', "Tamanho {$tamanho} adicionado.");
    }

    public function removerVariante(int $id, int $varianteId): RedirectResponse
    {
        $v = Variante::query()->withCount('itens')->where('produtoId', $id)->find($varianteId);
        if (! $v) {
            $this->falhar('Tamanho não encontrado.');
        }
        if ($v->itens_count > 0 || $v->reservado > 0) {
            $this->falhar('Este tamanho tem pedidos ou reserva. Zere o estoque em vez de remover.');
        }
        $v->delete();
        $this->catalogo->invalidar();

        return back()->with('sucesso', "Tamanho {$v->tamanho} removido.");
    }

    /** Entrada soma; ajuste define a quantidade contada. Tudo fica no histórico (movimento_estoque). */
    public function ajustarEstoque(Request $request, int $id, Estoque $estoque): RedirectResponse
    {
        $d = $request->validate([
            'varianteId' => ['required', 'integer', 'min:1'], 'tipo' => ['required', 'in:entrada,ajuste'], 'quantidade' => ['required', 'integer', 'min:0', 'max:10000'], 'observacao' => ['nullable', 'string', 'max:120'],
        ], ['varianteId.*' => 'Escolha o tamanho.', 'quantidade.integer' => 'Use números inteiros.', 'quantidade.*' => 'Quantidade inválida.']);
        if ($d['tipo'] === 'entrada' && (int) $d['quantidade'] === 0) {
            throw ValidationException::withMessages(['quantidade' => 'Informe quantas peças entraram.']);
        }
        abort_unless(Variante::query()->whereKey($d['varianteId'])->where('produtoId', $id)->exists(), 404);
        $this->tentar(fn () => DB::transaction(fn () => $estoque->movimentar((int) $d['varianteId'], MotivoEstoque::from($d['tipo']), (int) $d['quantidade'], $request->user()->id, $d['observacao'] ?? null)));
        $this->catalogo->invalidar();

        return back()->with('sucesso', 'Estoque atualizado.');
    }
}
