<?php

namespace App\Queries;

use App\Enums\StatusPedido;
use App\Models\Pedido;
use App\Models\PedidoItem;
use App\Models\User;
use App\Models\Variante;
use App\Services\Catalogo;
use App\Support\Datas;
use App\Support\Escopo;
use Carbon\CarbonImmutable;

/**
 * O que a tela do caixa precisa (src/server/consultas/caixa.ts). O catálogo vai inteiro para o navegador: a busca e os
 * filtros respondem na hora. O servidor confere tudo ao gravar.
 */
class Caixa
{
    public function __construct(private Catalogo $catalogo) {}

    /** @return list<array<string, mixed>> */
    public function produtos(): array
    {
        $eans = Variante::query()->whereHas('produto', fn ($q) => $q->where('ativo', true))->pluck('ean', 'id');
        $vendidos = PedidoItem::query()->where('situacao', '<>', 'devolvido')
            ->whereHas('pedido', fn ($q) => $q->where('status', StatusPedido::Confirmado)->where('confirmadoEm', '>=', now()->subDays(90)))
            ->selectRaw('produtoId, sum(quantidade) as n')->groupBy('produtoId')->pluck('n', 'produtoId');

        return array_map(fn ($p) => [
            'id' => $p['id'], 'referencia' => $p['referencia'], 'nome' => $p['nome'], 'marca' => $p['marca'], 'marcaSlug' => $p['marcaSlug'], 'categoria' => $p['categoria'],
            'categoriaSlug' => $p['categoriaSlug'], 'genero' => $p['genero'], 'corNome' => $p['corNome'] ?? $p['cor'], 'preco' => $p['preco'], 'precoCheio' => $p['precoCheio'],
            'imperdivel' => $p['imperdivel'], 'imagem' => $p['imagens'][0] ?? null, 'modelo' => $p['modelo'] ?? null, 'vendidos' => (int) ($vendidos[$p['id']] ?? 0),
            'variantes' => array_map(fn ($v) => [...$v, 'ean' => $eans[$v['id']] ?? null], $p['variantes']),
        ], $this->catalogo->lista());
    }

    /** @return array{dia: string, inicio: CarbonImmutable, fim: CarbonImmutable} */
    private static function intervalo(?string $dia): array
    {
        $d = $dia && preg_match('/^\d{4}-\d{2}-\d{2}$/', $dia) ? $dia : Datas::dia();

        return ['dia' => $d, 'inicio' => Datas::inicioDoDia($d), 'fim' => Datas::fimDoDia($d)];
    }

    /** Total e quantidade das vendas do caixa de hoje (topo da tela). O vendedor vê as dele. @return array{total: float, vendas: int} */
    public function resumo(User $u): array
    {
        ['inicio' => $i, 'fim' => $f] = self::intervalo(null);
        $q = Escopo::vendedor(Pedido::query(), $u)->where('origem', 'balcao')->where('status', StatusPedido::Confirmado)->whereBetween('confirmadoEm', [$i, $f]);

        return ['total' => (float) (clone $q)->sum('total'), 'vendas' => $q->count()];
    }

    /** Vendas do caixa do dia, com pagamentos, e os totais do fechamento (por forma e por vendedora). @return array<string, mixed> */
    public function vendasDoDia(User $u, ?string $dia): array
    {
        ['dia' => $d, 'inicio' => $i, 'fim' => $f] = self::intervalo($dia);
        // Confirmadas e as desfeitas depois de confirmadas; as que o caixa cancelou antes de confirmar ficam fora.
        $pedidos = Escopo::vendedor(Pedido::query(), $u)->where('origem', 'balcao')->whereBetween('criadoEm', [$i, $f])
            ->where(fn ($q) => $q->where('status', StatusPedido::Confirmado)->orWhere(fn ($c) => $c->where('status', StatusPedido::Cancelado)->whereNotNull('confirmadoEm')))
            ->with(['vendedor:id,name', 'itens:id,pedidoId,quantidade,nome,tamanho,imagem', 'pagamentos:id,pedidoId,forma,valor,parcelas,recebido'])
            ->latest('criadoEm')->get();
        $validas = $pedidos->where('status', StatusPedido::Confirmado);
        $porForma = [];
        $porVendedor = [];
        $troco = 0.0;
        foreach ($validas as $p) {
            foreach ($p->pagamentos as $g) {
                $forma = $g->forma->value;
                $porForma[$forma] ??= ['forma' => $forma, 'valor' => 0.0, 'n' => 0];
                $porForma[$forma]['valor'] += (float) $g->valor;
                $porForma[$forma]['n']++;
                if ($forma === 'dinheiro' && $g->recebido !== null) {
                    $troco += max(0, (float) $g->recebido - (float) $g->valor);
                }
            }
            $nome = $p->vendedor->name;
            $porVendedor[$nome] ??= ['nome' => $nome, 'valor' => 0.0, 'n' => 0];
            $porVendedor[$nome]['valor'] += (float) $p->total;
            $porVendedor[$nome]['n']++;
        }
        $ordenar = function (array $l): array {
            $l = array_values($l);
            usort($l, fn ($a, $b) => $b['valor'] <=> $a['valor']);

            return array_map(fn ($x) => [...$x, 'valor' => round($x['valor'], 2)], $l);
        };
        $total = round($validas->sum(fn ($p) => (float) $p->total), 2);

        return [
            'dia' => $d, 'total' => $total, 'vendas' => $validas->count(), 'pecas' => $validas->sum(fn ($p) => $p->itens->sum('quantidade')),
            'ticketMedio' => $validas->count() ? round($total / $validas->count(), 2) : 0, 'troco' => round($troco, 2),
            'porForma' => $ordenar($porForma), 'porVendedor' => $ordenar($porVendedor), 'desfeitas' => $pedidos->where('status', StatusPedido::Cancelado)->count(),
            'pedidos' => $pedidos->map(fn (Pedido $p) => [
                'id' => $p->id, 'codigo' => $p->codigo, 'status' => $p->status->value, 'criadoEm' => $p->criadoEm->toIso8601String(), 'total' => (float) $p->total,
                'nomeCliente' => $p->nomeCliente, 'codigoCupom' => $p->codigoCupom, 'vendedor' => $p->vendedor->name,
                'itens' => $p->itens->map(fn ($x) => ['quantidade' => $x->quantidade, 'nome' => $x->nome, 'tamanho' => $x->tamanho, 'imagem' => $x->imagem])->values(),
                'pagamentos' => $p->pagamentos->map(fn ($g) => ['forma' => $g->forma->value, 'valor' => (float) $g->valor, 'parcelas' => $g->parcelas, 'recebido' => $g->recebido === null ? null : (float) $g->recebido])->values(),
            ])->values(),
        ];
    }
}
