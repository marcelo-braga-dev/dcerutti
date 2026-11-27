<?php

namespace App\Services\Pedidos;

use App\Enums\AcaoPedido;
use App\Enums\SituacaoItem;
use App\Enums\StatusPedido;
use App\Exceptions\ErroNegocio;
use App\Exceptions\ErroPagamento;
use App\Exceptions\ErroPedido;
use App\Models\Cupom;
use App\Models\Custo;
use App\Models\NumeroWhatsApp;
use App\Models\Pedido;
use App\Models\PedidoItem;
use App\Models\User;
use App\Models\Variante;
use App\Models\Venda;
use App\Services\AtendimentoDoPedido;
use App\Services\Catalogo;
use App\Services\Cupons\Campanhas;
use App\Services\Cupons\CupomNoPedido;
use App\Services\Estoque;
use App\Services\Pagamentos\Travas;
use App\Support\Dinheiro;
use App\Support\Texto;
use Closure;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Ciclo de vida do pedido (src/server/pedidos.ts): criar, confirmar (inteiro e parcial), editar, trocar o cupom,
 * desfazer a venda e cancelar. Cada operação numa transação, com as mesmas travas da versão em Next.
 */
class Pedidos
{
    public function __construct(
        private Estoque $estoque,
        private Historico $historico,
        private CupomNoPedido $cupons,
        private Campanhas $campanhas,
        private Travas $travas,
        private AtendimentoDoPedido $atendimento,
        private Catalogo $catalogo,
    ) {}

    /**
     * Junta linhas repetidas e limita quantidades absurdas.
     *
     * @param  list<array{varianteId: mixed, quantidade: mixed}>  $linhas
     * @return list<array{varianteId: int, quantidade: int}>
     */
    public static function normalizarLinhas(array $linhas): array
    {
        $m = [];
        foreach ($linhas as $l) {
            $q = (int) floor((float) $l['quantidade']);
            if (! is_int($l['varianteId']) || $q <= 0) {
                continue;
            }
            $m[$l['varianteId']] = ($m[$l['varianteId']] ?? 0) + $q;
        }
        if (! $m) {
            throw new ErroPedido('A sacola está vazia.');
        }
        if (count($m) > 40) {
            throw new ErroPedido('Pedido com peças demais. Divida em mais de um pedido.');
        }
        $saida = [];
        foreach ($m as $id => $q) {
            $saida[] = ['varianteId' => $id, 'quantidade' => min($q, 20)];
        }

        return $saida;
    }

    /** Regra de negócio de outro módulo (pagamento online, cupom) vira ErroPedido, para a mensagem chegar à tela. */
    private function comoErroPedido(Closure $fn): mixed
    {
        try {
            return $fn();
        } catch (ErroNegocio $e) {
            throw $e instanceof ErroPedido ? $e : new ErroPedido($e->getMessage());
        }
    }

    /** RN-05: código sequencial e único, gerado dentro da transação (a linha do contador fica travada até o commit). */
    private function proximoCodigo(string $tipo): string
    {
        $nome = $tipo === 'condicional' ? 'COND' : 'PED';
        DB::statement('INSERT INTO contador (nome, valor) VALUES (?, 1) ON DUPLICATE KEY UPDATE valor = valor + 1', [$nome]);
        $valor = DB::selectOne('SELECT valor FROM contador WHERE nome = ?', [$nome])->valor;

        return $nome.'-'.str_pad((string) $valor, 6, '0', STR_PAD_LEFT);
    }

    /** O número principal da vendedora, se ela estiver ativa e o número em uso; senão, o padrão da loja (D-31). */
    private function numeroDoPedido(string $vendedorId): ?int
    {
        $v = User::query()->with('numeroPrincipal:id,status')->find($vendedorId, ['id', 'ativo', 'numeroPrincipalId']);
        if ($v?->ativo && $v->numeroPrincipal?->status->value === 'ativo') {
            return $v->numeroPrincipal->id;
        }

        return NumeroWhatsApp::query()->where('padrao', true)->value('id');
    }

    /** Preço da linha: o combinado quando é menor que o do catálogo (desconto do vendedor no caixa), senão o do catálogo. */
    private static function precoCombinado(int $catalogo, mixed $combinado): int
    {
        if ($combinado === null || ! is_numeric($combinado) || (float) $combinado < 0) {
            return $catalogo;
        }
        $c = Dinheiro::centavos($combinado);

        return $c < $catalogo ? $c : $catalogo;
    }

    /** @param ?array{valor: float, gratisAcima: float} $regra */
    private static function frete(string $tipo, ?array $regra, int $totalCentavos): ?int
    {
        if ($tipo !== 'compra' || ! $regra) {
            return null;
        }

        return $regra['gratisAcima'] > 0 && $totalCentavos >= Dinheiro::centavos($regra['gratisAcima']) ? 0 : Dinheiro::centavos($regra['valor']);
    }

    /** @param list<int> $ids @return Collection<int, Variante> */
    private function variantesComProduto(array $ids): Collection
    {
        return Variante::query()->whereIn('id', $ids)->with([
            'produto:id,referencia,nome,cor,preco,ativo,marcaId,categoriaId', 'produto.marca:id,nome', 'produto.categoria:id,nome',
            'produto.imagens' => fn ($q) => $q->orderBy('ordem'),
        ])->get()->keyBy('id');
    }

    /**
     * Cria o pedido com preços do banco. Condicional reserva o estoque na hora (RN-08); compra só confere a
     * disponibilidade e baixa na confirmação (RN-07).
     *
     * @param  array{tipo: string, origem: string, clienteId: string, vendedorId: string, nomeCliente: string, telefoneCliente: string, cep?: ?string, linhas: list<array{varianteId: int, quantidade: int}>, regraFrete?: ?array{valor: float, gratisAcima: float}, usuarioId?: ?string, cupom?: ?array{codigo: string, quem: string}, precos?: array<int, float>, aposCriar?: ?Closure, vitrineId?: ?string}  $p
     * @return array{id: string, codigo: string, total: float, frete: ?float, itens: list<array<string, mixed>>, cupom: ?array{codigo: string, desconto: float, freteGratis: bool}}
     */
    public function criar(array $p): array
    {
        $linhas = self::normalizarLinhas($p['linhas']);
        $resultado = DB::transaction(function () use ($p, $linhas) {
            $porId = $this->variantesComProduto(array_column($linhas, 'varianteId'));
            $faltas = [];
            foreach ($linhas as $l) {
                $v = $porId->get($l['varianteId']);
                if (! $v || ! $v->produto->ativo) {
                    $faltas[] = 'Uma peça da sacola não está mais disponível no catálogo.';
                } elseif ($v->estoque - $v->reservado < $l['quantidade']) {
                    $faltas[] = "{$v->produto->nome} (tam. {$v->tamanho}): ".max(0, $v->estoque - $v->reservado).' disponível(is).';
                }
            }
            if ($faltas) {
                throw new ErroPedido("Algumas peças não estão disponíveis na quantidade pedida:\n".implode("\n", $faltas));
            }
            if ($p['tipo'] === 'condicional') {
                foreach ($linhas as $l) {
                    $this->estoque->reservar($l['varianteId'], $l['quantidade']);
                }
            }

            $itens = array_map(function ($l) use ($porId, $p) {
                $v = $porId->get($l['varianteId']);
                $tabela = Dinheiro::centavos($v->produto->preco);

                return [
                    'varianteId' => $v->id, 'produtoId' => $v->produto->id, 'referencia' => $v->produto->referencia, 'nome' => $v->produto->nome,
                    'marca' => $v->produto->marca->nome, 'cor' => $v->produto->cor, 'categoria' => $v->produto->categoria->nome,
                    'imagem' => $v->produto->imagens->first()?->url, 'tamanho' => $v->tamanho, 'codigoInterno' => $v->codigoInterno,
                    'quantidade' => $l['quantidade'], 'preco' => self::precoCombinado($tabela, $p['precos'][$v->id] ?? null), 'tabela' => $tabela,
                ];
            }, $linhas);
            $total = array_sum(array_map(fn ($i) => $i['preco'] * $i['quantidade'], $itens));
            // null = a combinar (sem regra de frete, condicional, seleção do vendedor); 0 = grátis.
            $frete = self::frete($p['tipo'], $p['regraFrete'] ?? null, $total);
            $pedido = Pedido::query()->create([
                'codigo' => $this->proximoCodigo($p['tipo']), 'tipo' => $p['tipo'], 'origem' => $p['origem'], 'clienteId' => $p['clienteId'], 'vendedorId' => $p['vendedorId'],
                // D-31: o número da loja por onde a conversa acontece (balcão não tem conversa).
                'numeroId' => $p['origem'] === 'balcao' ? null : $this->numeroDoPedido($p['vendedorId']), 'vitrineId' => $p['vitrineId'] ?? null,
                'nomeCliente' => $p['nomeCliente'], 'telefoneCliente' => $p['telefoneCliente'], 'cep' => $p['cep'] ?? null,
                'total' => Dinheiro::decimal($total), 'frete' => $frete === null ? null : Dinheiro::decimal($frete),
            ]);
            $pedido->itens()->createMany(array_map(fn ($i) => [
                ...array_diff_key($i, ['preco' => 0, 'tabela' => 0]), 'precoUnitario' => Dinheiro::decimal($i['preco']), 'precoTabela' => Dinheiro::decimal($i['tabela']),
            ], $itens));
            if (isset($p['aposCriar'])) {
                ($p['aposCriar'])($pedido->id);
            }
            $fraseCupom = ! empty($p['cupom'])
                ? $this->comoErroPedido(fn () => $this->cupons->aplicar($pedido->id, $p['cupom']['quem'], $p['regraFrete'] ?? null, $p['cupom']['codigo']))
                : null;
            $this->historico->registrar($pedido->id, AcaoPedido::Criado, $p['usuarioId'] ?? null, $fraseCupom ? [$fraseCupom] : []);

            return ['pedido' => $pedido->fresh(), 'itens' => $itens];
        });
        $this->catalogo->invalidar();
        $ped = $resultado['pedido'];

        return [
            'id' => $ped->id, 'codigo' => $ped->codigo, 'total' => (float) $ped->total, 'frete' => Dinheiro::numero($ped->frete),
            'itens' => array_map(fn ($i) => [
                'nome' => $i['nome'], 'marca' => $i['marca'], 'referencia' => $i['referencia'], 'tamanho' => $i['tamanho'], 'cor' => $i['cor'],
                'codigoInterno' => $i['codigoInterno'], 'quantidade' => $i['quantidade'], 'preco' => $i['preco'] / 100, 'imagem' => $i['imagem'],
            ], $resultado['itens']),
            'cupom' => $ped->codigoCupom ? ['codigo' => $ped->codigoCupom, 'desconto' => (float) $ped->descontoCupom, 'freteGratis' => $ped->freteCupom] : null,
        ];
    }

    /**
     * C-07: muda o status só se ainda estiver pendente, como primeira escrita da transação. A linha do pedido fica
     * travada até o commit, então um segundo clique espera e depois encontra o pedido já fechado.
     *
     * @param  array<string, mixed>  $dados
     */
    private function fecharSePendente(string $pedidoId, array $dados): void
    {
        if (Pedido::query()->whereKey($pedidoId)->where('status', StatusPedido::Pendente)->update($dados) === 1) {
            return;
        }
        throw new ErroPedido(Pedido::query()->whereKey($pedidoId)->exists() ? 'Este pedido já foi fechado.' : 'Pedido não encontrado.');
    }

    /**
     * Confirma o pedido. Compra: todas as peças vendidas. Condicional: `ficaram[itemId]` = quantas unidades a cliente
     * ficou (0 = voltou tudo). B-13: parte ficou, a linha é dividida em vendida e devolvida. Baixa estoque, libera
     * reservas, grava o custo do momento (RN-10) e cria a venda.
     *
     * @param  array<int, int>  $ficaram
     * @return array{cupomGerado: ?array<string, mixed>}
     */
    public function confirmar(string $pedidoId, array $ficaram, ?string $usuarioId): array
    {
        $resultado = DB::transaction(function () use ($pedidoId, $ficaram, $usuarioId) {
            $this->fecharSePendente($pedidoId, ['status' => StatusPedido::Confirmado, 'confirmadoEm' => now()]);
            $pedido = Pedido::query()->with('itens')->findOrFail($pedidoId);
            $cond = $pedido->tipo->value === 'condicional';
            // Pagamento online (RP-03): a cobrança reservou as peças da compra; a baixa usa essa reserva.
            $reservadaPeloPagamento = ! $cond && $this->travas->consumirReservaDaCobranca($pedidoId);
            $this->historico->garantirRegistroInicial($pedidoId, $pedido->criadoEm);
            $vendidas = 0;
            $voltaram = 0;
            $custos = Custo::query()->whereIn('produtoId', $pedido->itens->pluck('produtoId'))->pluck('valor', 'produtoId');
            $valor = 0;
            $custo = 0;
            $temCusto = false;

            foreach ($pedido->itens as $item) {
                $k = $cond ? ($ficaram[$item->id] ?? null) : $item->quantidade;
                if (! is_int($k) || $k < 0 || $k > $item->quantidade) {
                    throw new ErroPedido('Marque quantas unidades de cada peça ficaram.');
                }
                $devolvidas = $item->quantidade - $k;
                if ($k > 0 && $devolvidas > 0) {
                    // Parte ficou, parte voltou: a linha atual vira a vendida e uma nova linha guarda as devolvidas.
                    PedidoItem::query()->create([...array_diff_key($item->getAttributes(), ['id' => 0]), 'quantidade' => $devolvidas, 'situacao' => SituacaoItem::Devolvido, 'custoUnitario' => null]);
                    $this->estoque->liberarReserva($item->varianteId, $devolvidas);
                }
                $vendidas += $k;
                $voltaram += $item->quantidade - $k;
                $q = $k > 0 ? $k : $item->quantidade;
                if ($k > 0) {
                    $this->estoque->baixarVenda($item->varianteId, $q, $cond || $reservadaPeloPagamento, $pedidoId, $usuarioId, $pedido->codigo, "{$item->nome} (tam. {$item->tamanho})");
                    $c = $custos->get($item->produtoId);
                    $valor += Dinheiro::centavos($item->precoUnitario) * $q;
                    if ($c !== null) {
                        $custo += Dinheiro::centavos($c) * $q;
                        $temCusto = true;
                    }
                    $item->update(['situacao' => SituacaoItem::Vendido, 'custoUnitario' => $c, 'quantidade' => $q]);
                } else {
                    $this->estoque->liberarReserva($item->varianteId, $q);
                    $item->update(['situacao' => SituacaoItem::Devolvido]);
                }
            }

            // Cupom: no condicional vale só sobre o que ficou (pode sair, se não chega ao mínimo); a venda já é com o desconto.
            $fraseCupom = $pedido->cupomId && $cond ? $this->cupons->aplicar($pedidoId, 'equipe', null, null, true) : null;
            if ($pedido->cupomId) {
                $valor -= Dinheiro::centavos(PedidoItem::query()->where('pedidoId', $pedidoId)->where('situacao', SituacaoItem::Vendido)->sum('descontoCupom'));
            }
            if ($valor > 0) {
                Venda::query()->create([
                    'pedidoId' => $pedidoId, 'vendedorId' => $pedido->vendedorId, 'clienteId' => $pedido->clienteId, 'valor' => Dinheiro::decimal($valor),
                    'custo' => $temCusto ? Dinheiro::decimal($custo) : null, 'data' => now(),
                    'observacao' => ($pedido->origem->value === 'balcao' ? 'Venda na loja' : ($cond ? 'Condicional' : 'Pedido'))." {$pedido->codigo}",
                ]);
            }
            $mudancas = $cond
                ? ['Ficou com a cliente: '.Texto::plural($vendidas, 'peça', 'peças').' ('.Dinheiro::brl($valor / 100).')', ...($voltaram ? ['Voltou: '.Texto::plural($voltaram, 'peça', 'peças')] : [])]
                : ['Venda de '.Dinheiro::brl($valor / 100)];
            if ($fraseCupom) {
                $mudancas[] = $fraseCupom;
            }
            // Campanha de próxima compra: a venda pode gerar um cupom pessoal para a cliente.
            $tinhaCupom = (bool) Pedido::query()->whereKey($pedidoId)->value('cupomId');
            $cupomGerado = $valor > 0 ? $this->campanhas->gerarCupomProximaCompra($pedidoId, $pedido->clienteId, $valor / 100, $tinhaCupom) : null;
            if ($cupomGerado) {
                $mudancas[] = "Cupom de próxima compra gerado: {$cupomGerado['codigo']} ({$cupomGerado['regra']})";
            }
            $this->historico->registrar($pedidoId, AcaoPedido::Confirmado, $usuarioId, $mudancas);

            return ['cupomGerado' => $cupomGerado];
        });
        $this->catalogo->invalidar();
        $this->atendimento->sincronizar($pedidoId, 'confirmado');
        $this->atendimento->programarPosVenda($pedidoId);

        return $resultado;
    }

    /**
     * Edita o pedido pendente (U-08). Condicional: reserva a mais ou devolve a diferença de cada tamanho. Compra: confere
     * a disponibilidade do que aumentou. Peça igual mantém o preço combinado; nova ou trocada usa o preço informado.
     * O frete é recalculado pela regra atual (null continua a combinar). Cada edição entra no histórico.
     *
     * @param  list<array{itemId?: ?int, varianteId: mixed, quantidade: mixed, preco: mixed}>  $linhas
     * @param  ?array{valor: float, gratisAcima: float}  $regraFrete
     */
    public function editar(string $pedidoId, array $linhas, ?array $regraFrete, string $usuarioId, ?string $observacao = null): void
    {
        DB::transaction(function () use ($pedidoId, $linhas, $regraFrete, $usuarioId, $observacao) {
            // Trava a linha do pedido até o commit (C-07): quem confirmar ou cancelar ao mesmo tempo espera.
            $trava = DB::selectOne('SELECT status FROM pedido WHERE id = ? FOR UPDATE', [$pedidoId]);
            if (! $trava) {
                throw new ErroPedido('Pedido não encontrado.');
            }
            if ($trava->status !== 'pendente') {
                throw new ErroPedido('Este pedido já foi fechado e não pode mais ser alterado.');
            }
            $this->comoErroPedido(fn () => $this->travas->garantirSemCobranca($pedidoId));
            $pedido = Pedido::query()->with(['itens' => fn ($q) => $q->orderBy('id')])->findOrFail($pedidoId);
            $cond = $pedido->tipo->value === 'condicional';

            if (! $linhas) {
                throw new ErroPedido('O pedido precisa de pelo menos uma peça. Para desistir de tudo, cancele o pedido.');
            }
            if (count($linhas) > 40) {
                throw new ErroPedido('Pedido com peças demais. Divida em mais de um pedido.');
            }
            $atuais = $pedido->itens->keyBy('id');
            $usados = [];
            foreach ($linhas as $l) {
                if (! is_int($l['varianteId'])) {
                    throw new ErroPedido('Peça inválida.');
                }
                if (! is_int($l['quantidade']) || $l['quantidade'] < 1 || $l['quantidade'] > 20) {
                    throw new ErroPedido('Quantidade inválida.');
                }
                if (! is_numeric($l['preco']) || ! is_finite((float) $l['preco']) || $l['preco'] < 0 || $l['preco'] > 99_999) {
                    throw new ErroPedido('Preço inválido.');
                }
                $itemId = $l['itemId'] ?? null;
                if ($itemId !== null && (! $atuais->has($itemId) || in_array($itemId, $usados, true))) {
                    throw new ErroPedido('O pedido mudou enquanto você editava. Recarregue a página.');
                }
                if ($itemId !== null) {
                    $usados[] = $itemId;
                }
            }
            if (count(array_unique(array_column($linhas, 'varianteId'))) !== count($linhas)) {
                throw new ErroPedido('A mesma peça e tamanho aparecem duas vezes. Junte numa linha só.');
            }

            $porVariante = $this->variantesComProduto(array_column($linhas, 'varianteId'));
            // Linhas como vão ficar, com a cópia da peça quando ela é nova ou foi trocada.
            $novas = array_map(function ($l) use ($porVariante, $atuais) {
                $v = $porVariante->get($l['varianteId']);
                $antes = isset($l['itemId']) ? $atuais->get($l['itemId']) : null;
                $mesmaPeca = $antes?->varianteId === $l['varianteId'];
                if (! $v || (! $mesmaPeca && ! $v->produto->ativo)) {
                    throw new ErroPedido('Uma das peças escolhidas não está mais no catálogo.');
                }
                $preco = Dinheiro::centavos($l['preco']);
                $dados = $mesmaPeca
                    ? ['quantidade' => $l['quantidade'], 'precoUnitario' => Dinheiro::decimal($preco)]
                    : [
                        'varianteId' => $v->id, 'produtoId' => $v->produto->id, 'referencia' => $v->produto->referencia, 'nome' => $v->produto->nome,
                        'marca' => $v->produto->marca->nome, 'cor' => $v->produto->cor, 'categoria' => $v->produto->categoria->nome,
                        'imagem' => $v->produto->imagens->first()?->url, 'tamanho' => $v->tamanho, 'codigoInterno' => $v->codigoInterno,
                        'quantidade' => $l['quantidade'], 'precoUnitario' => Dinheiro::decimal($preco), 'precoTabela' => $v->produto->preco,
                    ];
                $comparavel = [
                    'antesId' => $antes?->id, 'varianteId' => $v->id, 'quantidade' => $l['quantidade'], 'preco' => $preco,
                    'nome' => $mesmaPeca ? $antes->nome : $v->produto->nome, 'cor' => $mesmaPeca ? $antes->cor : $v->produto->cor, 'tamanho' => $v->tamanho,
                ];

                return ['linha' => $l, 'antes' => $antes, 'dados' => $dados, 'comparavel' => $comparavel, 'nomePeca' => "{$v->produto->nome} (tam. {$v->tamanho})", 'variante' => $v];
            }, $linhas);

            // Estoque: compara o total de cada tamanho antes e depois.
            $qAntes = [];
            foreach ($pedido->itens as $i) {
                $qAntes[$i->varianteId] = ($qAntes[$i->varianteId] ?? 0) + $i->quantidade;
            }
            $qDepois = [];
            foreach ($novas as $x) {
                $qDepois[$x['variante']->id] = $x['linha']['quantidade'];
            }
            foreach (array_unique([...array_keys($qAntes), ...array_keys($qDepois)]) as $id) {
                $dif = ($qDepois[$id] ?? 0) - ($qAntes[$id] ?? 0);
                if (! $dif) {
                    continue;
                }
                $x = collect($novas)->first(fn ($n) => $n['variante']->id === $id);
                if ($dif > 0) {
                    if ($cond) {
                        try {
                            $this->estoque->reservar($id, $dif);
                        } catch (ErroNegocio) {
                            throw new ErroPedido("{$x['nomePeca']}: não há {$dif} a mais disponível.");
                        }
                    } elseif ($x['variante']->estoque - $x['variante']->reservado < $qDepois[$id]) {
                        throw new ErroPedido("{$x['nomePeca']}: só ".max(0, $x['variante']->estoque - $x['variante']->reservado).' disponível(is).');
                    }
                } elseif ($cond) {
                    $this->estoque->liberarReserva($id, -$dif);
                }
            }

            $total = array_sum(array_map(fn ($x) => $x['comparavel']['preco'] * $x['linha']['quantidade'], $novas));
            $freteAntes = $pedido->frete === null ? null : Dinheiro::centavos($pedido->frete);
            $frete = $freteAntes === null || ! $regraFrete ? $freteAntes : ($regraFrete['gratisAcima'] > 0 && $total >= Dinheiro::centavos($regraFrete['gratisAcima']) ? 0 : Dinheiro::centavos($regraFrete['valor']));
            $antesComparavel = $pedido->itens->map(fn ($i) => ['id' => $i->id, 'varianteId' => $i->varianteId, 'nome' => $i->nome, 'cor' => $i->cor, 'tamanho' => $i->tamanho, 'quantidade' => $i->quantidade, 'preco' => Dinheiro::centavos($i->precoUnitario)])->all();
            $mudancas = Historico::descreverMudancas($antesComparavel, array_column($novas, 'comparavel'), [
                'totalAntes' => Dinheiro::centavos($pedido->total), 'totalDepois' => $total, 'freteAntes' => $freteAntes, 'freteDepois' => $frete,
            ]);
            if (! $mudancas) {
                throw new ErroPedido('Nada foi alterado.');
            }

            $this->historico->garantirRegistroInicial($pedidoId, $pedido->criadoEm);
            // Primeiro apaga as retiradas, para uma peça poder sair de uma linha e entrar em outra.
            PedidoItem::query()->where('pedidoId', $pedidoId)->whereNotIn('id', $usados ?: [0])->delete();
            foreach ($novas as $x) {
                if ($x['antes']) {
                    PedidoItem::query()->whereKey($x['antes']->id)->update($x['dados']);
                } else {
                    PedidoItem::query()->create([...$x['dados'], 'pedidoId' => $pedidoId]);
                }
            }
            $pedido->update(['total' => Dinheiro::decimal($total), 'frete' => $frete === null ? null : Dinheiro::decimal($frete)]);
            // O cupom acompanha a edição: recalculado sobre as peças novas, ou retirado (com o motivo) se deixou de valer.
            $fraseCupom = $this->cupons->aplicar($pedidoId, 'equipe', $regraFrete);
            if ($fraseCupom) {
                $mudancas[] = $fraseCupom;
            }
            $this->historico->registrar($pedidoId, AcaoPedido::Editado, $usuarioId, $mudancas, $observacao);
        });
        $this->catalogo->invalidar();
    }

    /**
     * A equipe aplica, troca (`codigo`) ou retira (`codigo` null) o cupom de um pedido pendente. Aplicar confere todas
     * as regras; recusado, nada muda e o motivo sobe. Entra no histórico.
     *
     * @param  ?array{valor: float, gratisAcima: float}  $regraFrete
     */
    public function trocarCupom(string $pedidoId, ?string $codigo, ?array $regraFrete, string $usuarioId, ?string $observacao = null): void
    {
        DB::transaction(function () use ($pedidoId, $codigo, $regraFrete, $usuarioId, $observacao) {
            $trava = DB::selectOne('SELECT status FROM pedido WHERE id = ? FOR UPDATE', [$pedidoId]);
            if (! $trava) {
                throw new ErroPedido('Pedido não encontrado.');
            }
            if ($trava->status !== 'pendente') {
                throw new ErroPedido('Este pedido já foi fechado e não pode mais ser alterado.');
            }
            $this->comoErroPedido(fn () => $this->travas->garantirSemCobranca($pedidoId));
            $pedido = Pedido::query()->findOrFail($pedidoId, ['id', 'criadoEm', 'codigoCupom']);
            if (! $codigo && ! $pedido->codigoCupom) {
                throw new ErroPedido('Este pedido não tem cupom.');
            }
            $this->historico->garantirRegistroInicial($pedidoId, $pedido->criadoEm);
            $frase = $this->comoErroPedido(fn () => $codigo
                ? $this->cupons->aplicar($pedidoId, 'equipe', $regraFrete, $codigo)
                : $this->cupons->aplicar($pedidoId, 'equipe', $regraFrete, null, false, true));
            $mudancas = array_values(array_filter([$pedido->codigoCupom && $codigo ? "Cupom {$pedido->codigoCupom} trocado" : null, $frase]));
            $this->historico->registrar($pedidoId, AcaoPedido::Editado, $usuarioId, $mudancas, $observacao);
        });
    }

    /**
     * Cancelar um pedido confirmado desfaz a venda: as peças vendidas voltam ao estoque ("estorno"), a venda sai (metas
     * e relatórios), o uso do cupom é liberado e o cupom de próxima compra gerado por ela, se não usado, é desativado.
     */
    public function desfazerVenda(string $pedidoId, string $usuarioId, string $observacao): void
    {
        $orders = DB::transaction(function () use ($pedidoId, $usuarioId, $observacao) {
            $this->comoErroPedido(fn () => $this->travas->garantirSemPagamento($pedidoId));
            $n = Pedido::query()->whereKey($pedidoId)->where('status', StatusPedido::Confirmado)->update(['status' => StatusPedido::Cancelado, 'canceladoEm' => now(), 'motivoCancelamento' => 'equipe']);
            if (! $n) {
                $status = Pedido::query()->whereKey($pedidoId)->value('status');
                throw new ErroPedido(! $status ? 'Pedido não encontrado.' : ($status === StatusPedido::Cancelado ? 'Este pedido já foi cancelado.' : 'Este pedido ainda está em aberto.'));
            }
            $pedido = Pedido::query()->with(['itens', 'venda'])->findOrFail($pedidoId);
            $this->historico->garantirRegistroInicial($pedidoId, $pedido->criadoEm);
            $pecas = 0;
            foreach ($pedido->itens->filter(fn ($i) => $i->situacao === SituacaoItem::Vendido) as $i) {
                $this->estoque->estornarVenda($i->varianteId, $i->quantidade, $pedidoId, $usuarioId, "Cancelamento de {$pedido->codigo}");
                $pecas += $i->quantidade;
            }
            $mudancas = ['Venda desfeita: '.Texto::plural($pecas, 'peça voltou', 'peças voltaram').' ao estoque'];
            if ($pedido->venda) {
                $pedido->venda->delete();
                $mudancas[] = 'Venda de '.Dinheiro::brl($pedido->venda->valor).' removida das metas e dos relatórios';
            }
            if ($pedido->codigoCupom) {
                $mudancas[] = "Uso do cupom {$pedido->codigoCupom} liberado";
            }
            $gerados = Cupom::query()->where('pedidoOrigemId', $pedidoId)->where('ativo', true)
                ->whereDoesntHave('pedidos', fn ($q) => $q->where('status', '<>', StatusPedido::Cancelado))->get(['id', 'codigo']);
            if ($gerados->isNotEmpty()) {
                Cupom::query()->whereIn('id', $gerados->pluck('id'))->update(['ativo' => false]);
                $mudancas[] = 'Cupom de próxima compra '.$gerados->pluck('codigo')->implode(', ').' desativado';
            }
            $this->historico->registrar($pedidoId, AcaoPedido::Cancelado, $usuarioId, $mudancas, $observacao);

            return $this->travas->encerrarCobrancasAtivas($pedidoId, 'venda desfeita');
        });
        $this->catalogo->invalidar();
        $this->travas->cancelarOrdersNoMercadoPago($orders);
        $this->atendimento->sincronizar($pedidoId, 'cancelado');
        $this->atendimento->cancelarPosVenda($pedidoId);
    }

    /**
     * RN-09: cancelar libera as reservas do condicional. `motivo`: equipe, cliente ou expirado (Q-05). `usuarioId`
     * null = sistema (expiração).
     */
    public function cancelar(string $pedidoId, string $motivo, ?string $usuarioId = null, ?string $observacao = null): void
    {
        $orders = DB::transaction(function () use ($pedidoId, $motivo, $usuarioId, $observacao) {
            $this->fecharSePendente($pedidoId, ['status' => StatusPedido::Cancelado, 'canceladoEm' => now(), 'motivoCancelamento' => $motivo]);
            try {
                $this->travas->garantirSemPagamento($pedidoId);
            } catch (ErroPagamento $e) {
                throw new ErroPedido($e->getMessage());
            }
            $pedido = Pedido::query()->with('itens')->findOrFail($pedidoId);
            if ($pedido->tipo->value === 'condicional') {
                foreach ($pedido->itens as $i) {
                    $this->estoque->liberarReserva($i->varianteId, $i->quantidade);
                }
            }
            $this->historico->garantirRegistroInicial($pedidoId, $pedido->criadoEm);
            $this->historico->registrar($pedidoId, AcaoPedido::Cancelado, $usuarioId, [Texto::cancelamento($motivo, false) ?? 'Cancelado'], $observacao);

            return $this->travas->encerrarCobrancasAtivas($pedidoId, "pedido cancelado ({$motivo})");
        });
        $this->catalogo->invalidar();
        $this->travas->cancelarOrdersNoMercadoPago($orders);
        $this->atendimento->sincronizar($pedidoId, 'cancelado');
    }
}
