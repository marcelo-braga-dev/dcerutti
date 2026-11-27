<?php

namespace App\Services;

use App\Models\Categoria;
use App\Models\ImportacaoEstoque as Registro;
use App\Models\Marca;
use App\Models\MovimentoEstoque;
use App\Models\Produto;
use App\Models\Variante;
use App\Support\LeitorXlsx;
use App\Support\Pecas;
use App\Support\PlanilhaEstoque as P;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Importação da planilha de estoque (docs/25; porta de src/server/importacao-estoque.ts e planilha-xlsx.ts). A planilha é
 * a verdade: estoque de cada tamanho = Estoq. − Cond. − Res. EC; preço cheio = Preço Venda (a promoção continua se for
 * menor que o novo cheio); peça nova vira produto ou tamanho novo; tamanho fora da planilha fica com 0; produto sem
 * nenhuma linha é desativado. `planejar` só lê; `aplicar` replaneja e grava numa transação, com movimentos de estoque.
 */
class ImportacaoEstoque
{
    public const TAMANHO_MAXIMO = 20 * 1024 * 1024;

    public function __construct(private Config $config, private Catalogo $catalogo) {}

    public static function pasta(): string
    {
        return storage_path('app/planilhas');
    }

    /** Guarda a planilha enviada e devolve o nome. */
    public static function guardar(string $origem): string
    {
        if (! is_dir(self::pasta())) {
            mkdir(self::pasta(), 0775, true);
        }
        $nome = 'estoque-'.now()->format('Y-m-d-H-i-s').'-'.Str::lower(Str::random(6)).'.xlsx';
        copy($origem, self::pasta()."/{$nome}");

        return $nome;
    }

    public static function caminho(string $nome): ?string
    {
        $c = self::pasta()."/{$nome}";

        return preg_match('/^[\w-]+\.xlsx$/', $nome) && is_file($c) ? $c : null;
    }

    /** Lê a primeira aba que tiver as colunas certas. @return array{linhas: list<array>, erros: list<string>, aba: ?string} */
    public static function ler(string $caminho): array
    {
        try {
            $abas = LeitorXlsx::abas($caminho);
        } catch (\Throwable) {
            return ['linhas' => [], 'erros' => ['O arquivo não é uma planilha .xlsx válida.'], 'aba' => null];
        }
        $ultimo = ['A planilha está vazia.'];
        foreach ($abas as $a) {
            $r = P::lerLinhas($a['matriz']);
            if ($r['linhas']) {
                return [...$r, 'aba' => $a['nome']];
            }
            $ultimo = $r['erros'] ?: $ultimo;
        }

        return ['linhas' => [], 'erros' => $ultimo, 'aba' => null];
    }

    /** @return array<string, array{marca: string, ignorar: bool}> */
    public function salvas(): array
    {
        return (array) ($this->config->get('fornecedores') ?? []);
    }

    /** Regras de cada fornecedor da planilha: as enviadas agora, as salvas e, para os novos, a sugestão. */
    public static function regras(array $linhas, array $salvas, array $agora = []): array
    {
        $r = [];
        foreach (array_unique(array_column($linhas, 'fornecedor')) as $f) {
            $r[$f] = $agora[$f] ?? $salvas[$f] ?? P::regraPadrao($f);
        }

        return $r;
    }

    private static function chave(string $t): string
    {
        return trim(mb_strtolower(P::semAcento($t)));
    }

    private static function slug(string $t): string
    {
        return trim((string) preg_replace('/[^a-z0-9]+/', '-', self::chave($t)), '-');
    }

    public function planejar(array $linhas, array $regras, array $salvas = []): array
    {
        $produtos = Produto::query()->with(['marca:id,nome', 'variantes'])->get();
        $avisos = [];
        $ignoradas = [];
        $porCodigo = [];
        foreach ($produtos as $p) {
            foreach ($p->variantes as $v) {
                if ($v->codigoInterno) {
                    $porCodigo[$v->codigoInterno] = [$v, $p];
                }
            }
        }
        $produtoPorId = $produtos->keyBy('id');
        $codigosUsados = array_map(fn ($x) => $x[0]->id, $porCodigo);

        $vistas = [];
        $validas = [];
        foreach ($linhas as $l) {
            $motivo = ($regras[$l['fornecedor']]['ignorar'] ?? false) ? 'Fornecedor ignorado' : (! ($l['preco'] > 0) ? 'Sem preço de venda' : (isset($vistas[$l['codigo']]) ? 'Código repetido na planilha' : null));
            if ($motivo) {
                $ignoradas[] = ['linha' => $l['linha'], 'codigo' => $l['codigo'], 'descricao' => $l['descricao'], 'motivo' => $motivo];

                continue;
            }
            $vistas[$l['codigo']] = true;
            $validas[] = $l;
        }

        $novos = [];
        $mudados = [];
        $variantesNovas = [];
        $variantesMudadas = [];
        $tocados = [];
        $variantesTocadas = [];
        $referencias = array_fill_keys($produtos->pluck('referencia')->all(), true);
        $estoquePorProduto = [];
        $mudar = function ($p, array $dados) use (&$mudados) {
            $mudados[$p->id] ??= ['id' => $p->id, 'referencia' => $p->referencia, 'nome' => $p->nome, 'dados' => []];
            $mudados[$p->id]['dados'] = [...$mudados[$p->id]['dados'], ...$dados];
        };
        $porTamanho = function (array $ls, $p = null) use (&$avisos) {
            $m = [];
            foreach ($ls as $l) {
                $m[P::tamanho($l['tamanho'])][] = $l;
            }
            $r = [];
            foreach ($m as $tamanho => $grupo) {
                $conhecida = $grupo[0];
                if ($p) {
                    foreach ($grupo as $l) {
                        if ($p->variantes->contains('codigoInterno', $l['codigo'])) {
                            $conhecida = $l;
                            break;
                        }
                    }
                }
                if (count($grupo) > 1) {
                    $avisos[] = "{$grupo[0]['descricao']} ({$tamanho}): ".count($grupo).' códigos para o mesmo tamanho ('.implode(', ', array_column($grupo, 'codigo'))."); estoque somado no código {$conhecida['codigo']}.";
                }
                $ean = null;
                foreach ($grupo as $l) {
                    $ean ??= P::ean($l['codigoBarras']);
                }
                $r[] = ['tamanho' => (string) $tamanho, 'linha' => $conhecida, 'estoque' => array_sum(array_map(P::estoque(...), $grupo)), 'ean' => $ean];
            }

            return $r;
        };

        $grupos = P::agrupar($validas);
        $coresPorReferencia = [];
        foreach ($grupos as $g) {
            $coresPorReferencia["{$g['fornecedor']}|{$g['referenciaBase']}"][$g['chave']] = true;
        }

        foreach ($grupos as $g) {
            $destinos = array_map(fn ($l) => isset($porCodigo[$l['codigo']]) ? $porCodigo[$l['codigo']][1]->id : null, $g['linhas']);
            $contagem = array_count_values(array_filter($destinos, fn ($d) => $d !== null));
            arsort($contagem);
            $principal = $contagem ? array_key_first($contagem) : null;
            $porDestino = [];
            foreach ($g['linhas'] as $i => $l) {
                $porDestino[(string) ($destinos[$i] ?? $principal ?? '')][] = $l;
            }
            foreach ($porDestino as $destino => $ls) {
                if ($destino === '') {
                    $l = $ls[0];
                    $categoria = P::categoria($l['descricao']);
                    $variantes = array_map(fn ($t) => ['tamanho' => $t['tamanho'], 'ordem' => Pecas::posicaoTamanho($t['tamanho']), 'estoque' => $t['estoque'], 'codigoInterno' => $t['linha']['codigo'], 'ean' => $t['ean']], $porTamanho($ls));
                    $precisaCor = count($coresPorReferencia["{$g['fornecedor']}|{$g['referenciaBase']}"] ?? []) > 1;
                    $novos[] = [
                        'referencia' => P::referenciaDoProduto($g, $referencias, $precisaCor || $g['referenciaBase'] === ''), 'nome' => P::nome($l),
                        'marca' => P::marcaDoProduto($regras[$l['fornecedor']]['marca'], $categoria), 'categoria' => $categoria, 'genero' => P::genero($l['descricao'], $categoria),
                        'estacao' => P::estacao($l['descricao'], $categoria), 'cor' => P::cor($l), 'preco' => P::preco($ls), 'fornecedor' => $l['fornecedor'], 'variantes' => $variantes,
                    ];
                    foreach ($variantes as $v) {
                        $codigosUsados[$v['codigoInterno']] = -1;
                    }

                    continue;
                }
                $p = $produtoPorId[(int) $destino];
                $tocados[$p->id] = true;
                $cheio = P::preco($ls);
                $preco = (float) $p->preco < (float) $p->precoCheio && (float) $p->preco < $cheio ? (float) $p->preco : $cheio;
                $dados = [];
                if (round((float) $p->precoCheio, 2) !== round($cheio, 2)) {
                    $dados['precoCheio'] = $cheio;
                }
                if (round((float) $p->preco, 2) !== round($preco, 2)) {
                    $dados['preco'] = $preco;
                }
                if ($p->fornecedor !== $ls[0]['fornecedor']) {
                    $dados['fornecedor'] = $ls[0]['fornecedor'];
                }
                $marcaRegra = $regras[$ls[0]['fornecedor']]['marca'];
                $marcaAntes = $salvas[$ls[0]['fornecedor']]['marca'] ?? null;
                if ($p->fornecedor && $marcaAntes && $marcaAntes !== $marcaRegra && ! str_starts_with(self::chave($p->marca->nome), self::chave($marcaRegra))) {
                    $dados['marca'] = P::marcaDoProduto($marcaRegra, '');
                }
                if ($dados) {
                    $mudar($p, $dados);
                }
                $total = $estoquePorProduto[$p->id] ?? 0;
                foreach ($porTamanho($ls, $p) as $t) {
                    $v = $p->variantes->firstWhere('codigoInterno', $t['linha']['codigo']) ?? $p->variantes->first(fn ($x) => $x->tamanho === $t['tamanho'] && ! isset($variantesTocadas[$x->id]));
                    $total += $t['estoque'];
                    if (! $v) {
                        if (isset($codigosUsados[$t['linha']['codigo']])) {
                            $avisos[] = "Código {$t['linha']['codigo']} já está em outra peça do site; linha {$t['linha']['linha']} ignorada.";

                            continue;
                        }
                        $variantesNovas[] = ['produtoId' => $p->id, 'nome' => $p->nome, 'tamanho' => $t['tamanho'], 'ordem' => Pecas::posicaoTamanho($t['tamanho']), 'estoque' => $t['estoque'], 'codigoInterno' => $t['linha']['codigo'], 'ean' => $t['ean']];
                        $codigosUsados[$t['linha']['codigo']] = -1;

                        continue;
                    }
                    $variantesTocadas[$v->id] = true;
                    $m = ['id' => $v->id, 'produtoId' => $p->id, 'nome' => $p->nome, 'tamanho' => $v->tamanho, 'de' => $v->estoque, 'para' => $t['estoque'], 'reservado' => $v->reservado];
                    if ($v->codigoInterno !== $t['linha']['codigo']) {
                        $dono = $codigosUsados[$t['linha']['codigo']] ?? null;
                        if ($dono === null || $dono === $v->id) {
                            $m['codigoInterno'] = $t['linha']['codigo'];
                            if ($v->codigoInterno) {
                                unset($codigosUsados[$v->codigoInterno]);
                            }
                            $codigosUsados[$t['linha']['codigo']] = $v->id;
                        }
                    }
                    if ($t['ean'] && $t['ean'] !== $v->ean) {
                        $m['ean'] = $t['ean'];
                    }
                    if ($m['de'] !== $m['para'] || isset($m['codigoInterno']) || array_key_exists('ean', $m)) {
                        $variantesMudadas[$v->id] = $m;
                    }
                    if ($t['estoque'] < $v->reservado) {
                        $avisos[] = "{$p->nome} ({$v->tamanho}): {$v->reservado} reservada(s) em pedidos do site e só {$t['estoque']} na planilha.";
                    }
                }
                $estoquePorProduto[$p->id] = $total;
            }
        }

        foreach ($produtos as $p) {
            foreach ($p->variantes as $v) {
                if (! isset($variantesTocadas[$v->id]) && $v->estoque !== 0) {
                    $variantesMudadas[$v->id] = ['id' => $v->id, 'produtoId' => $p->id, 'nome' => $p->nome, 'tamanho' => $v->tamanho, 'de' => $v->estoque, 'para' => 0, 'reservado' => $v->reservado];
                }
            }
            $comEstoque = ($estoquePorProduto[$p->id] ?? 0) > 0 || collect($variantesNovas)->contains(fn ($v) => $v['produtoId'] === $p->id && $v['estoque'] > 0);
            $ativo = isset($tocados[$p->id]) && $comEstoque;
            if ($p->ativo !== $ativo) {
                $mudar($p, ['ativo' => $ativo]);
            }
        }

        $nomesMarcas = Marca::query()->pluck('nome')->map(fn ($n) => self::chave($n))->flip();
        $nomesCategorias = Categoria::query()->pluck('nome')->map(fn ($n) => self::chave($n))->flip();
        $marcasNovas = collect([...array_column($novos, 'marca'), ...array_filter(array_map(fn ($m) => $m['dados']['marca'] ?? null, $mudados))])->unique()->reject(fn ($m) => $nomesMarcas->has(self::chave($m)))->values()->all();
        $categoriasNovas = collect(array_column($novos, 'categoria'))->unique()->reject(fn ($c) => $nomesCategorias->has(self::chave($c)))->values()->all();
        $fornecedores = collect($linhas)->groupBy('fornecedor')->map(fn ($ls, $nome) => ['nome' => $nome, ...$regras[$nome], 'novo' => ! array_key_exists($nome, $salvas), 'skus' => $ls->count(), 'pecas' => $ls->sum('estoque')])
            ->sortByDesc('pecas')->values()->all();

        $antes = $produtos->where('ativo', true)->sum(fn ($p) => $p->variantes->sum('estoque'));
        $desativados = array_keys(array_filter($mudados, fn ($m) => ($m['dados']['ativo'] ?? null) === false));
        $ativados = array_keys(array_filter($mudados, fn ($m) => ($m['dados']['ativo'] ?? null) === true));
        $depois = 0;
        foreach ($produtos as $p) {
            if (in_array($p->id, $ativados, true) || ($p->ativo && ! in_array($p->id, $desativados, true))) {
                foreach ($p->variantes as $v) {
                    $depois += $variantesMudadas[$v->id]['para'] ?? $v->estoque;
                }
            }
        }
        $depois += array_sum(array_column($variantesNovas, 'estoque')) + array_sum(array_map(fn ($n) => array_sum(array_column($n['variantes'], 'estoque')), $novos));

        return [
            'linhas' => count($linhas), 'ignoradas' => $ignoradas, 'fornecedores' => $fornecedores, 'produtosNovos' => $novos, 'produtosMudados' => array_values($mudados),
            'variantesNovas' => $variantesNovas, 'variantesMudadas' => array_values($variantesMudadas), 'marcasNovas' => $marcasNovas, 'categoriasNovas' => $categoriasNovas, 'avisos' => $avisos,
            'totais' => ['pecasPlanilha' => array_sum(array_column($linhas, 'estoque')), 'valorPlanilha' => round(array_sum(array_map(fn ($l) => $l['estoque'] * $l['preco'], $linhas)), 2), 'pecasSiteAntes' => (int) $antes, 'pecasSiteDepois' => $depois],
        ];
    }

    /** Resumo do plano para a tela e para o histórico (listas cortadas). */
    public static function resumir(array $p, int $limite = 300): array
    {
        $desativados = array_values(array_filter($p['produtosMudados'], fn ($m) => ($m['dados']['ativo'] ?? null) === false));
        $ativados = array_values(array_filter($p['produtosMudados'], fn ($m) => ($m['dados']['ativo'] ?? null) === true));
        $precos = array_values(array_filter($p['produtosMudados'], fn ($m) => array_key_exists('precoCheio', $m['dados']) || array_key_exists('preco', $m['dados'])));
        $estoque = array_values(array_filter($p['variantesMudadas'], fn ($v) => $v['de'] !== $v['para']));
        $cortar = fn (array $l) => array_slice($l, 0, $limite);

        return [
            'linhas' => $p['linhas'], 'totais' => $p['totais'], 'fornecedores' => $p['fornecedores'], 'marcasNovas' => $p['marcasNovas'], 'categoriasNovas' => $p['categoriasNovas'],
            'contagens' => [
                'produtosNovos' => count($p['produtosNovos']), 'variantesNovas' => count($p['variantesNovas']) + array_sum(array_map(fn ($x) => count($x['variantes']), $p['produtosNovos'])),
                'estoqueAlterado' => count($estoque), 'precosAlterados' => count($precos), 'desativados' => count($desativados), 'reativados' => count($ativados),
                'ignoradas' => count($p['ignoradas']), 'avisos' => count($p['avisos']),
            ],
            'produtosNovos' => array_map(fn ($x) => ['referencia' => $x['referencia'], 'nome' => $x['nome'], 'marca' => $x['marca'], 'categoria' => $x['categoria'], 'genero' => $x['genero'], 'preco' => $x['preco'],
                'tamanhos' => implode(', ', array_column($x['variantes'], 'tamanho')), 'pecas' => array_sum(array_column($x['variantes'], 'estoque'))], $cortar($p['produtosNovos'])),
            'estoque' => array_map(fn ($v) => ['nome' => $v['nome'], 'tamanho' => $v['tamanho'], 'de' => $v['de'], 'para' => $v['para']], $cortar($estoque)),
            'precos' => array_map(fn ($m) => ['referencia' => $m['referencia'], 'nome' => $m['nome'], 'preco' => $m['dados']['preco'] ?? null, 'precoCheio' => $m['dados']['precoCheio'] ?? null], $cortar($precos)),
            'desativados' => array_map(fn ($m) => ['referencia' => $m['referencia'], 'nome' => $m['nome']], $cortar($desativados)),
            'reativados' => array_map(fn ($m) => ['referencia' => $m['referencia'], 'nome' => $m['nome']], $cortar($ativados)),
            'ignoradas' => $cortar($p['ignoradas']), 'avisos' => $cortar($p['avisos']),
        ];
    }

    /** Grava o plano numa transação: marcas e categorias novas, produtos, tamanhos, preços e estoque (com movimentos). */
    public function aplicar(array $p, ?string $usuarioId, string $arquivo, string $nomeOriginal): void
    {
        $obs = "Importação da planilha {$nomeOriginal}";
        DB::transaction(function () use ($p, $usuarioId, $arquivo, $nomeOriginal, $obs) {
            $marcas = Marca::query()->get(['id', 'nome'])->mapWithKeys(fn ($m) => [self::chave($m->nome) => $m->id])->all();
            foreach ($p['marcasNovas'] as $nome) {
                $s = self::slug($nome) ?: 'marca';
                for ($n = 2; Marca::query()->where('slug', $s)->exists(); $n++) {
                    $s = (self::slug($nome) ?: 'marca')."-{$n}";
                }
                $marcas[self::chave($nome)] = Marca::query()->create(['nome' => $nome, 'slug' => $s])->id;
            }
            $categorias = Categoria::query()->get(['id', 'nome'])->mapWithKeys(fn ($c) => [self::chave($c->nome) => $c->id])->all();
            foreach ($p['categoriasNovas'] as $nome) {
                $s = self::slug($nome) ?: 'categoria';
                for ($n = 2; Categoria::query()->where('slug', $s)->exists(); $n++) {
                    $s = (self::slug($nome) ?: 'categoria')."-{$n}";
                }
                $categorias[self::chave($nome)] = Categoria::query()->create(['nome' => $nome, 'slug' => $s])->id;
            }
            $movimentos = [];
            $agora = now();
            $mov = fn (int $varianteId, int $delta, string $motivo) => ['varianteId' => $varianteId, 'delta' => $delta, 'motivo' => $motivo, 'observacao' => $obs, 'usuarioId' => $usuarioId, 'criadoEm' => $agora];
            // Primeiro libera os códigos que vão mudar de dono (o código é único).
            foreach ($p['variantesMudadas'] as $v) {
                if (! empty($v['codigoInterno'])) {
                    Variante::query()->where('codigoInterno', $v['codigoInterno'])->whereKeyNot($v['id'])->update(['codigoInterno' => null]);
                }
            }
            foreach ($p['produtosMudados'] as $m) {
                $dados = $m['dados'];
                if (isset($dados['marca'])) {
                    $dados['marcaId'] = $marcas[self::chave($dados['marca'])];
                    unset($dados['marca']);
                }
                Produto::query()->whereKey($m['id'])->update($dados);
            }
            foreach ($p['variantesMudadas'] as $v) {
                Variante::query()->whereKey($v['id'])->update(array_filter(['estoque' => $v['para'], 'codigoInterno' => $v['codigoInterno'] ?? null], fn ($x) => $x !== null) + (array_key_exists('ean', $v) ? ['ean' => $v['ean']] : []));
                if ($v['para'] !== $v['de']) {
                    $movimentos[] = $mov($v['id'], $v['para'] - $v['de'], 'ajuste');
                }
            }
            foreach ($p['variantesNovas'] as $v) {
                $c = Variante::query()->create(['produtoId' => $v['produtoId'], 'tamanho' => $v['tamanho'], 'ordem' => $v['ordem'], 'estoque' => $v['estoque'], 'codigoInterno' => $v['codigoInterno'], 'ean' => $v['ean']]);
                if ($v['estoque']) {
                    $movimentos[] = $mov($c->id, $v['estoque'], 'entrada');
                }
            }
            foreach ($p['produtosNovos'] as $n) {
                $criado = Produto::query()->create([
                    'referencia' => $n['referencia'], 'nome' => $n['nome'], 'marcaId' => $marcas[self::chave($n['marca'])], 'categoriaId' => $categorias[self::chave($n['categoria'])],
                    'genero' => $n['genero'], 'estacao' => $n['estacao'], 'cor' => $n['cor'], 'preco' => $n['preco'], 'precoCheio' => $n['preco'], 'fornecedor' => $n['fornecedor'],
                    'ativo' => collect($n['variantes'])->contains(fn ($v) => $v['estoque'] > 0),
                ]);
                foreach ($n['variantes'] as $v) {
                    $c = Variante::query()->create([...$v, 'produtoId' => $criado->id]);
                    if ($v['estoque']) {
                        $movimentos[] = $mov($c->id, $v['estoque'], 'entrada');
                    }
                }
            }
            foreach (array_chunk($movimentos, 500) as $lote) {
                MovimentoEstoque::query()->insert($lote);
            }
            Registro::query()->create(['arquivo' => $arquivo, 'nomeOriginal' => $nomeOriginal, 'usuarioId' => $usuarioId, 'resumo' => self::resumir($p, 100)]);
        });
        $this->catalogo->invalidar();
    }
}
