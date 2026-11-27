<?php

namespace App\Http\Controllers\Painel;

use App\Http\Controllers\Controller;
use App\Models\Categoria;
use App\Models\Cliente;
use App\Models\Cupom;
use App\Models\Marca;
use App\Models\Pedido;
use App\Models\Produto;
use App\Models\User;
use App\Queries\Cupons;
use App\Services\Config;
use App\Services\Cupons\AvaliadorDeCupom;
use App\Services\Cupons\Campanhas;
use App\Services\Cupons\CupomNoPedido;
use App\Support\Datas;
use App\Support\Dinheiro;
use App\Support\Telefone;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/** Cupons (docs/20-cupons.md; src/app/(painel)/painel/cupons e acoes/cupons.ts). Só o gestor cria, edita e apaga. */
class CupomController extends Controller
{
    public function __construct(private Cupons $cupons, private Config $config) {}

    /** Gestor: todos os cupons, com usos e desconto concedido. Vendedora: os disponíveis para divulgar (P-13). */
    public function index(Request $request): Response
    {
        /** @var User $u */
        $u = $request->user();
        $site = rtrim((string) config('app.url'), '/');
        $ligados = (bool) $this->config->get('cupons.ligados');
        if (! $u->ehGestor()) {
            return Inertia::render('Painel/Cupons/Index', ['gestor' => false, 'ligados' => $ligados, 'site' => $site, 'cupons' => $ligados ? $this->cupons->paraDivulgar($u) : []]);
        }
        $lista = Cupom::query()->with(CupomNoPedido::COM_ALVOS)->where('modelo', false)->where('origem', '<>', 'proximaCompra')->orderByDesc('ativo')->orderByDesc('criadoEm')->get();
        $usos = $this->cupons->usos($lista->pluck('id')->all());

        return Inertia::render('Painel/Cupons/Index', [
            'gestor' => true, 'ligados' => $ligados, 'site' => $site,
            'cupons' => $lista->map(function (Cupom $c) use ($usos) {
                $regra = CupomNoPedido::regraDe($c);
                $uso = $usos[$c->id] ?? ['usos' => 0, 'desconto' => 0];

                return [
                    'id' => $c->id, 'codigo' => $c->codigo, 'descricao' => $c->descricao, 'tipo' => $c->tipo->value, 'origem' => $c->origem->value, 'quemAplica' => $c->quemAplica->value,
                    'inicioEm' => $c->inicioEm->toIso8601String(), 'fimEm' => $c->fimEm?->toIso8601String(), 'limiteTotal' => $c->limiteTotal, 'clientes' => $c->clientes->count(),
                    'regra' => AvaliadorDeCupom::regraEmPalavras($regra, CupomNoPedido::nomesDosAlvos($c)), 'beneficio' => AvaliadorDeCupom::beneficio($regra),
                    'situacao' => Cupons::situacao($regra, $uso['usos']), ...$uso,
                ];
            })->values(),
        ]);
    }

    /** @return array<string, list<array{valor: string, rotulo: string, detalhe?: string}>> */
    private function opcoes(): array
    {
        return [
            'categorias' => Categoria::query()->orderBy('nome')->get(['id', 'nome'])->map(fn ($x) => ['valor' => (string) $x->id, 'rotulo' => $x->nome])->all(),
            'marcas' => Marca::query()->orderBy('nome')->get(['id', 'nome'])->map(fn ($x) => ['valor' => (string) $x->id, 'rotulo' => $x->nome])->all(),
            'clientes' => Cliente::query()->where('telefone', '<>', '')->orderBy('nome')->get(['id', 'nome', 'telefone'])->map(fn ($x) => ['valor' => $x->id, 'rotulo' => $x->nome, 'detalhe' => Telefone::formatar($x->telefone)])->all(),
        ];
    }

    public function create(): Response
    {
        return Inertia::render('Painel/Cupons/Form', ['opcoes' => $this->opcoes(), 'usado' => false, 'cupom' => null, 'pedidos' => [], 'resumo' => null]);
    }

    public function show(int $id): Response
    {
        $c = Cupom::query()->with(CupomNoPedido::COM_ALVOS)->find($id);
        abort_if(! $c || $c->modelo || $c->origem->value !== 'manual', 404); // campanhas têm a tela própria
        $uso = $this->cupons->usos([$id])[$id] ?? ['usos' => 0, 'desconto' => 0];
        $pedidos = Pedido::query()->where('cupomId', $id)->with('vendedor:id,name')->latest('criadoEm')->take(50)
            ->get(['id', 'codigo', 'nomeCliente', 'status', 'criadoEm', 'descontoCupom', 'freteCupom', 'total', 'vendedorId']);
        $texto = fn ($v) => $v === null ? '' : str_replace('.', ',', (string) (float) $v);

        return Inertia::render('Painel/Cupons/Form', [
            'opcoes' => $this->opcoes(), 'usado' => $pedidos->isNotEmpty(),
            'resumo' => ['situacao' => Cupons::situacao(CupomNoPedido::regraDe($c), $uso['usos']), 'limiteTotal' => $c->limiteTotal, 'ativo' => $c->ativo, ...$uso],
            'cupom' => [
                'id' => $c->id, 'codigo' => $c->codigo, 'descricao' => $c->descricao ?? '', 'tipo' => $c->tipo->value, 'valor' => $texto($c->valor), 'tetoDesconto' => $texto($c->tetoDesconto),
                'minimoCompra' => $texto($c->minimoCompra), 'inicio' => Datas::dia($c->inicioEm), 'fim' => $c->fimEm ? Datas::dia($c->fimEm) : '',
                'limiteTotal' => $c->limiteTotal === null ? '' : (string) $c->limiteTotal, 'limitePorCliente' => $c->limitePorCliente === null ? '' : (string) $c->limitePorCliente,
                'quemAplica' => $c->quemAplica->value, 'somentePrimeiraCompra' => $c->somentePrimeiraCompra, 'valePromocao' => $c->valePromocao, 'ativo' => $c->ativo,
                'categorias' => $c->categorias->map(fn ($x) => (string) $x->categoriaId)->values(), 'marcas' => $c->marcas->map(fn ($x) => (string) $x->marcaId)->values(),
                'clientes' => $c->clientes->pluck('clienteId')->values(), 'referencias' => $c->produtos->map(fn ($x) => $x->produto->referencia)->implode(', '),
            ],
            'pedidos' => $pedidos->map(fn ($p) => [
                'id' => $p->id, 'codigo' => $p->codigo, 'nomeCliente' => $p->nomeCliente, 'status' => $p->status->value, 'criadoEm' => $p->criadoEm->toIso8601String(),
                'descontoCupom' => (float) $p->descontoCupom, 'freteCupom' => (bool) $p->freteCupom, 'total' => (float) $p->total, 'vendedor' => $p->vendedor?->name,
            ])->values(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $id = $this->salvar($request, null);

        return redirect("/painel/cupons/{$id}")->with('sucesso', 'Cupom criado.');
    }

    public function update(Request $request, int $id): RedirectResponse
    {
        $this->salvar($request, $id);

        return back()->with('sucesso', 'Cupom salvo.');
    }

    /** Valida os campos de desconto comuns ao cupom e às campanhas. @return array<string, mixed> */
    private static function desconto(Request $request): array
    {
        $erros = [];
        $d = ['tipo' => $request->input('tipo')];
        foreach (['valor' => 'Valor', 'tetoDesconto' => 'Teto', 'minimoCompra' => 'Mínimo'] as $campo => $rotulo) {
            $v = trim((string) $request->input($campo));
            $n = $v === '' ? null : Dinheiro::lerValor($v);
            if ($n !== null && ! ($n >= 0)) {
                $erros[$campo] = "{$rotulo}: valor inválido.";
                $n = null;
            }
            $d[$campo] = $n;
        }
        if (! in_array($d['tipo'], ['percentual', 'valor', 'freteGratis'], true)) {
            $erros['tipo'] = 'Escolha o tipo.';
        }
        if ($d['tipo'] === 'percentual' && ! ($d['valor'] !== null && $d['valor'] > 0 && $d['valor'] <= 100)) {
            $erros['valor'] = 'Informe o percentual, de 0,01 a 100.';
        }
        if ($d['tipo'] === 'valor' && ! ($d['valor'] !== null && $d['valor'] > 0)) {
            $erros['valor'] = 'Informe o valor do desconto em reais.';
        }
        if (! in_array($request->input('quemAplica'), ['cliente', 'equipe', 'ambos'], true)) {
            $erros['quemAplica'] = 'Escolha quem aplica.';
        }
        if ($erros) {
            throw ValidationException::withMessages($erros);
        }

        return [
            'tipo' => $d['tipo'], 'valor' => $d['tipo'] === 'freteGratis' ? null : $d['valor'], 'tetoDesconto' => $d['tipo'] === 'percentual' ? $d['tetoDesconto'] : null,
            'minimoCompra' => $d['minimoCompra'], 'valePromocao' => $request->boolean('valePromocao'), 'quemAplica' => $request->input('quemAplica'), 'ativo' => $request->boolean('ativo'),
        ];
    }

    private static function inteiro(Request $request, string $campo, string $rotulo): ?int
    {
        $v = trim((string) $request->input($campo));
        if ($v === '') {
            return null;
        }
        if (! ctype_digit($v) || (int) $v < 1) {
            throw ValidationException::withMessages([$campo => "{$rotulo}: use um número inteiro a partir de 1, ou deixe em branco."]);
        }

        return (int) $v;
    }

    /** Cria ou edita o cupom manual. Cupom já usado: o que muda o valor fica travado. */
    private function salvar(Request $request, ?int $id): int
    {
        $codigo = AvaliadorDeCupom::normalizarCodigo((string) $request->input('codigo'));
        if (! AvaliadorDeCupom::codigoValido($codigo)) {
            throw ValidationException::withMessages(['codigo' => 'De 3 a 30 letras, números ou hífen, começando por letra ou número.']);
        }
        $desconto = self::desconto($request);
        $dia = fn (string $c) => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $request->input($c)) ? $request->input($c) : null;
        [$inicio, $fim] = [$dia('inicio'), $dia('fim')];
        if ($inicio && $fim && $fim < $inicio) {
            throw ValidationException::withMessages(['fim' => 'O fim precisa ser no mesmo dia do início ou depois.']);
        }
        $ids = fn (string $c) => array_values(array_unique(array_filter(array_map('strval', (array) $request->input($c, [])))));
        $categorias = array_map('intval', $ids('categorias'));
        $marcas = array_map('intval', $ids('marcas'));
        $clientes = $ids('clientes');
        $refs = array_values(array_unique(array_filter(preg_split('/[\s,;]+/', mb_strtoupper((string) $request->input('referencias'))) ?: [])));
        $produtos = $refs ? Produto::query()->whereIn('referencia', $refs)->get(['id', 'referencia']) : collect();
        $faltam = array_filter($refs, fn ($r) => ! $produtos->contains(fn ($p) => mb_strtoupper($p->referencia) === $r));
        if ($faltam) {
            throw ValidationException::withMessages(['referencias' => 'Referência não encontrada: '.implode(', ', $faltam).'.']);
        }
        $dados = [
            ...$desconto, 'codigo' => $codigo, 'descricao' => trim((string) $request->input('descricao')) ?: null,
            'inicioEm' => $inicio ? Datas::inicioDoDia($inicio) : now(), 'fimEm' => $fim ? Datas::fimDoDia($fim) : null,
            'limiteTotal' => self::inteiro($request, 'limiteTotal', 'Limite total'), 'limitePorCliente' => self::inteiro($request, 'limitePorCliente', 'Limite por cliente'),
            'somentePrimeiraCompra' => $request->boolean('somentePrimeiraCompra'),
        ];
        if (Cupom::query()->where('codigo', $codigo)->when($id, fn ($q) => $q->where('id', '<>', $id))->exists()) {
            throw ValidationException::withMessages(['codigo' => "Já existe um cupom com o código {$codigo}."]);
        }

        return DB::transaction(function () use ($id, $dados, $categorias, $marcas, $clientes, $produtos, $request) {
            if ($id) {
                $atual = Cupom::query()->with(['categorias', 'marcas', 'produtos'])->find($id);
                abort_unless($atual, 404);
                if ($atual->origem->value !== 'manual' || $atual->modelo) {
                    throw ValidationException::withMessages(['erro' => 'Este é um cupom de campanha: edite em Cupons › Campanhas.']);
                }
                if (Pedido::query()->where('cupomId', $id)->exists()) {
                    $mesmo = fn (array $a, array $b) => count($a) === count($b) && ! array_diff($a, $b);
                    $mudou = $atual->codigo !== $dados['codigo'] || $atual->tipo->value !== $dados['tipo'] || (float) ($atual->valor ?? 0) !== (float) ($dados['valor'] ?? 0)
                        || (float) ($atual->tetoDesconto ?? -1) !== (float) ($dados['tetoDesconto'] ?? -1) || $atual->valePromocao !== $dados['valePromocao']
                        || ! $mesmo($atual->categorias->pluck('categoriaId')->all(), $categorias) || ! $mesmo($atual->marcas->pluck('marcaId')->all(), $marcas)
                        || ! $mesmo($atual->produtos->pluck('produtoId')->all(), $produtos->pluck('id')->all());
                    if ($mudou) {
                        throw ValidationException::withMessages(['erro' => 'Este cupom já foi usado: código, tipo, valor, teto, promoção e abrangência não podem mudar. Desative-o e crie outro.']);
                    }
                }
                $atual->update($dados);
                $atual->categorias()->delete();
                $atual->marcas()->delete();
                $atual->produtos()->delete();
                $atual->clientes()->delete();
                $c = $atual;
            } else {
                $c = Cupom::query()->create([...$dados, 'criadoPorId' => $request->user()->id]);
            }
            $c->categorias()->createMany(array_map(fn ($x) => ['categoriaId' => $x], $categorias));
            $c->marcas()->createMany(array_map(fn ($x) => ['marcaId' => $x], $marcas));
            $c->produtos()->createMany($produtos->map(fn ($p) => ['produtoId' => $p->id])->all());
            $c->clientes()->createMany(array_map(fn ($x) => ['clienteId' => $x], $clientes));

            return $c->id;
        });
    }

    public function alternar(Request $request, int $id): RedirectResponse
    {
        $n = Cupom::query()->whereKey($id)->update(['ativo' => $request->boolean('ativo')]);

        return $n ? back() : back()->withErrors(['erro' => 'Cupom não encontrado.']);
    }

    /** Só cupom nunca usado pode ser apagado; o usado é desativado (os pedidos guardam o vínculo). */
    public function destroy(int $id): RedirectResponse
    {
        if (Pedido::query()->where('cupomId', $id)->exists()) {
            return back()->withErrors(['erro' => 'Este cupom já foi usado em pedidos: desative em vez de apagar.']);
        }

        return Cupom::query()->whereKey($id)->delete() ? redirect('/painel/cupons') : back()->withErrors(['erro' => 'Cupom não encontrado.']);
    }

    /** Campanhas (fase 4 dos cupons): primeira compra e próxima compra. */
    public function campanhas(): Response
    {
        $primeira = Cupom::query()->where('origem', 'primeiraCompra')->where('modelo', false)->orderBy('id')->first();
        $modelo = Cupom::query()->where('origem', 'proximaCompra')->where('modelo', true)->first();
        $usosPrimeira = $primeira ? ($this->cupons->usos([$primeira->id])[$primeira->id] ?? ['usos' => 0, 'desconto' => 0]) : ['usos' => 0, 'desconto' => 0];
        $gerados = $modelo ? Cupom::query()->where('modeloId', $modelo->id)->pluck('id')->all() : [];
        $usosGerados = $this->cupons->usos($gerados);
        $texto = fn ($v) => $v === null ? '' : str_replace('.', ',', (string) (float) $v);
        $regras = $this->config->get('proximaCompra');

        return Inertia::render('Painel/Cupons/Campanhas', [
            'ligados' => (bool) $this->config->get('cupons.ligados'),
            'usosPrimeira' => $usosPrimeira, 'temPrimeira' => (bool) $primeira, 'temModelo' => (bool) $modelo,
            'proxima' => ['gerados' => count($gerados), 'usados' => array_sum(array_column($usosGerados, 'usos')), 'desconto' => array_sum(array_column($usosGerados, 'desconto'))],
            'primeira' => $primeira ? [
                'ativo' => $primeira->ativo, 'codigo' => $primeira->codigo, 'tipo' => $primeira->tipo->value, 'valor' => $texto($primeira->valor), 'tetoDesconto' => $texto($primeira->tetoDesconto),
                'minimoCompra' => $texto($primeira->minimoCompra), 'valePromocao' => $primeira->valePromocao, 'quemAplica' => $primeira->quemAplica->value,
                'diasAposCadastro' => $primeira->diasAposCadastro === null ? '' : (string) $primeira->diasAposCadastro,
            ] : ['ativo' => false, 'codigo' => 'BEMVINDA', 'tipo' => 'percentual', 'valor' => '10', 'tetoDesconto' => '', 'minimoCompra' => '', 'valePromocao' => false, 'quemAplica' => 'ambos', 'diasAposCadastro' => '30'],
            'proximaForm' => [
                'ativo' => $modelo?->ativo ?? false, 'tipo' => $modelo?->tipo->value ?? 'percentual', 'valor' => $modelo ? $texto($modelo->valor) : '10', 'tetoDesconto' => $modelo ? $texto($modelo->tetoDesconto) : '50',
                'minimoCompra' => $texto($modelo?->minimoCompra), 'valePromocao' => $modelo?->valePromocao ?? false, 'quemAplica' => $modelo?->quemAplica->value ?? 'ambos',
                'minimoParaGerar' => $texto($regras['minimoParaGerar']), 'diasParaComecar' => (string) $regras['diasParaComecar'], 'diasValidade' => (string) $regras['diasValidade'],
                'geraComCupom' => (bool) $regras['geraComCupom'], 'acumula' => (bool) $regras['acumula'],
            ],
        ]);
    }

    /** Primeira compra: o cupom público de boas-vindas. Próxima compra: o modelo e, na configuração, quando gerar e o prazo. */
    public function salvarCampanha(Request $request): RedirectResponse
    {
        $campanha = $request->input('campanha');
        abort_unless(in_array($campanha, ['primeiraCompra', 'proximaCompra'], true), 422);
        $desconto = self::desconto($request);
        if ($campanha === 'proximaCompra') {
            $validade = self::inteiro($request, 'diasValidade', 'Validade');
            if ($validade === null) {
                throw ValidationException::withMessages(['diasValidade' => 'Informe por quantos dias o cupom vale.']);
            }
            $comecar = trim((string) $request->input('diasParaComecar')) === '' ? 0 : (int) $request->input('diasParaComecar');
            if ($comecar < 0 || $comecar > 365 || ! ctype_digit((string) ($request->input('diasParaComecar') ?: '0'))) {
                throw ValidationException::withMessages(['diasParaComecar' => 'De 0 a 365 dias.']);
            }
            $minimo = trim((string) $request->input('minimoParaGerar')) === '' ? 0 : Dinheiro::lerValor((string) $request->input('minimoParaGerar'));
            DB::transaction(function () use ($desconto, $request, $validade, $comecar, $minimo) {
                $modelo = Cupom::query()->where('origem', 'proximaCompra')->where('modelo', true)->first();
                $modelo ? $modelo->update($desconto) : Cupom::query()->create([...$desconto, 'codigo' => Campanhas::CODIGO_MODELO_PROXIMA, 'origem' => 'proximaCompra', 'modelo' => true, 'limitePorCliente' => null, 'criadoPorId' => $request->user()->id, 'inicioEm' => now()]);
                $this->config->salvar(['proximaCompra' => ['minimoParaGerar' => max(0, $minimo), 'diasParaComecar' => $comecar, 'diasValidade' => $validade, 'geraComCupom' => $request->boolean('geraComCupom'), 'acumula' => $request->boolean('acumula')]]);
            });

            return back()->with('sucesso', 'Campanha salva.');
        }
        $codigo = AvaliadorDeCupom::normalizarCodigo((string) $request->input('codigo'));
        if (! AvaliadorDeCupom::codigoValido($codigo)) {
            throw ValidationException::withMessages(['codigo' => 'De 3 a 30 letras, números ou hífen.']);
        }
        $atual = Cupom::query()->where('origem', 'primeiraCompra')->where('modelo', false)->orderBy('id')->first();
        if (Cupom::query()->where('codigo', $codigo)->when($atual, fn ($q) => $q->where('id', '<>', $atual->id))->exists()) {
            throw ValidationException::withMessages(['codigo' => "Já existe um cupom com o código {$codigo}."]);
        }
        $dados = [...$desconto, 'codigo' => $codigo, 'diasAposCadastro' => self::inteiro($request, 'diasAposCadastro', 'Prazo'), 'somentePrimeiraCompra' => true, 'limitePorCliente' => 1, 'descricao' => 'Campanha de primeira compra'];
        if (! $atual) {
            Cupom::query()->create([...$dados, 'origem' => 'primeiraCompra', 'criadoPorId' => $request->user()->id, 'inicioEm' => now()]);
        } else {
            if (Pedido::query()->where('cupomId', $atual->id)->exists()) {
                $mudou = $atual->codigo !== $codigo || $atual->tipo->value !== $dados['tipo'] || (float) ($atual->valor ?? 0) !== (float) ($dados['valor'] ?? 0)
                    || (float) ($atual->tetoDesconto ?? -1) !== (float) ($dados['tetoDesconto'] ?? -1) || $atual->valePromocao !== $dados['valePromocao'];
                if ($mudou) {
                    throw ValidationException::withMessages(['erro' => 'O cupom de primeira compra já foi usado: código, tipo, valor, teto e promoção não podem mudar. Desligue a campanha, apague o código antigo em Cupons e crie de novo.']);
                }
            }
            $atual->update($dados);
        }

        return back()->with('sucesso', 'Campanha salva.');
    }
}
