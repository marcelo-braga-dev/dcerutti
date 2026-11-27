<?php

namespace App\Services\Cupons;

use App\Exceptions\ErroNegocio;
use App\Models\Cliente;
use App\Models\Cupom;
use App\Models\Pedido;
use App\Models\PedidoItem;
use App\Models\Produto;
use App\Models\Venda;
use App\Support\Dinheiro;
use Illuminate\Support\Facades\DB;

/**
 * Cupom dentro da transação do pedido (docs/20-cupons.md; src/server/cupons.ts). Quem chama abre a transação; aqui o
 * cupom é conferido com a linha dele travada, e o desconto é gravado nas peças e no pedido.
 */
class CupomNoPedido
{
    /** Relações da abrangência, para regraDe() e nomesDosAlvos(). */
    public const COM_ALVOS = ['categorias.categoria:id,nome', 'marcas.marca:id,nome', 'produtos.produto:id,referencia,nome', 'clientes.cliente:id,nome,vendedorId'];

    /** Busca pelo código. `travar`: segura a linha do cupom até o commit (dois pedidos não passam juntos do limite). */
    public function buscar(string $codigo, bool $travar = false): ?Cupom
    {
        $cod = AvaliadorDeCupom::normalizarCodigo($codigo);
        if ($cod === '') {
            return null;
        }
        if ($travar) {
            DB::select('SELECT id FROM cupom WHERE codigo = ? FOR UPDATE', [$cod]);
        }
        $c = Cupom::query()->with(self::COM_ALVOS)->where('codigo', $cod)->first();

        return $c?->modelo ? null : $c; // o modelo da próxima compra nunca é aplicado
    }

    /**
     * Fichas da mesma pessoa: o telefone não é único entre as fichas, então limite por cliente e primeira compra olham todas.
     *
     * @return list<string>
     */
    public function fichasDaPessoa(string $clienteId): array
    {
        $tel = Cliente::query()->whereKey($clienteId)->value('telefone');
        if (! $tel) {
            return [$clienteId];
        }
        $ids = Cliente::query()->whereIn('telefone', [$tel, preg_replace('/\D/', '', $tel)])->pluck('id')->all();

        return array_values(array_unique([$clienteId, ...$ids]));
    }

    /**
     * Usos do cupom (pedidos não cancelados, sem contar `ignorarPedidoId`) e se a pessoa já comprou. Leitura com trava
     * (LOCK IN SHARE MODE): lê o que outra transação já gravou, e não a "foto" do começo desta.
     *
     * @return array{usosTotal: int, usosCliente: int, jaComprou: bool, clienteDesde: ?\DateTimeInterface}
     */
    public function contexto(int $cupomId, string $clienteId, ?string $ignorarPedidoId = null): array
    {
        $fichas = $this->fichasDaPessoa($clienteId);
        $ignorar = $ignorarPedidoId ?? '';
        $total = DB::selectOne("SELECT COUNT(*) AS n FROM pedido WHERE cupomId = ? AND status <> 'cancelado' AND id <> ? LOCK IN SHARE MODE", [$cupomId, $ignorar])->n;
        $marcas = implode(',', array_fill(0, count($fichas), '?'));
        $daPessoa = DB::selectOne("SELECT COUNT(*) AS n FROM pedido WHERE cupomId = ? AND status <> 'cancelado' AND id <> ? AND clienteId IN ({$marcas}) LOCK IN SHARE MODE", [$cupomId, $ignorar, ...$fichas])->n;

        return [
            'usosTotal' => (int) $total, 'usosCliente' => (int) $daPessoa,
            'jaComprou' => Venda::query()->whereIn('clienteId', $fichas)->exists(),
            'clienteDesde' => Cliente::query()->whereKey($clienteId)->first(['criadoEm'])?->criadoEm,
        ];
    }

    /**
     * Peças no formato da regra, com categoria, marca e promoção do produto de agora.
     *
     * @param  list<array{chave: mixed, produtoId: int, preco: float, quantidade: int}>  $linhas
     * @return list<array<string, mixed>>
     */
    public function pecas(array $linhas): array
    {
        $produtos = Produto::query()->whereIn('id', array_column($linhas, 'produtoId'))->get(['id', 'categoriaId', 'marcaId', 'preco', 'precoCheio', 'imperdivel'])->keyBy('id');

        return array_map(function ($l) use ($produtos) {
            $p = $produtos->get($l['produtoId']);

            return [
                'chave' => $l['chave'], 'produtoId' => $l['produtoId'], 'categoriaId' => $p->categoriaId ?? 0, 'marcaId' => $p->marcaId ?? 0,
                'emPromocao' => $p && ($p->imperdivel || (float) $p->precoCheio > (float) $p->preco), 'preco' => $l['preco'], 'quantidade' => $l['quantidade'],
            ];
        }, $linhas);
    }

    /**
     * Cupom do banco no formato do AvaliadorDeCupom (números em vez de texto decimal, alvos como listas de ids).
     *
     * @return array<string, mixed>
     */
    public static function regraDe(Cupom $c): array
    {
        $n = fn ($v) => $v === null ? null : (float) $v;

        return [
            'codigo' => $c->codigo, 'tipo' => $c->tipo->value, 'valor' => $n($c->valor), 'tetoDesconto' => $n($c->tetoDesconto), 'minimoCompra' => $n($c->minimoCompra),
            'inicioEm' => $c->inicioEm, 'fimEm' => $c->fimEm, 'limiteTotal' => $c->limiteTotal, 'limitePorCliente' => $c->limitePorCliente,
            'somentePrimeiraCompra' => $c->somentePrimeiraCompra, 'valePromocao' => $c->valePromocao, 'quemAplica' => $c->quemAplica->value, 'ativo' => $c->ativo,
            'categorias' => $c->categorias->pluck('categoriaId')->all(), 'marcas' => $c->marcas->pluck('marcaId')->all(),
            'produtos' => $c->produtos->pluck('produtoId')->all(), 'clientes' => $c->clientes->pluck('clienteId')->all(),
            'diasAposCadastro' => $c->diasAposCadastro,
        ];
    }

    /** @return list<string> */
    public static function nomesDosAlvos(Cupom $c): array
    {
        return [
            ...$c->categorias->map(fn ($x) => $x->categoria->nome)->all(),
            ...$c->marcas->map(fn ($x) => $x->marca->nome)->all(),
            ...$c->produtos->map(fn ($x) => "{$x->produto->nome} ({$x->produto->referencia})")->all(),
        ];
    }

    /** @param ?array{valor: float, gratisAcima: float} $regra */
    private static function freteDaRegra(string $tipo, ?array $regra, int $pecas): ?int
    {
        if ($tipo !== 'compra' || ! $regra) {
            return null;
        }

        return $regra['gratisAcima'] > 0 && $pecas >= Dinheiro::centavos($regra['gratisAcima']) ? 0 : Dinheiro::centavos($regra['valor']);
    }

    /**
     * Aplica (`codigo`), recalcula (sem `codigo`, se o pedido já tem cupom) ou retira o cupom, e grava o desconto nas
     * peças, o total (peças − cupom) e o frete. Devolve a frase para o histórico, ou null se nada mudou.
     * - Aplicar: confere todas as regras; recusado, lança o motivo (o pedido não é gravado).
     * - Recalcular: só conta, mínimo e abrangência; se deixar de valer, o cupom sai e a frase diz por quê.
     * `somenteVendidos`: fechamento do condicional, o cupom vale só sobre o que ficou.
     *
     * @param  ?array{valor: float, gratisAcima: float}  $regraFrete
     */
    public function aplicar(string $pedidoId, string $quem, ?array $regraFrete, ?string $codigo = null, bool $somenteVendidos = false, bool $retirar = false): ?string
    {
        $pedido = Pedido::query()->with('itens')->findOrFail($pedidoId);
        $linhas = $pedido->itens->filter(fn (PedidoItem $i) => $somenteVendidos ? $i->situacao->value === 'vendido' : $i->situacao->value !== 'devolvido');
        $pecas = $linhas->sum(fn ($i) => Dinheiro::centavos($i->precoUnitario) * $i->quantidade);
        // O total do pedido é sempre todas as linhas − o cupom (no condicional fechado, as devolvidas ficam com desconto 0).
        $todas = $pedido->itens->sum(fn ($i) => Dinheiro::centavos($i->precoUnitario) * $i->quantidade);
        $freteSemCupom = $pedido->freteCupom ? self::freteDaRegra($pedido->tipo->value, $regraFrete, $pecas) : ($pedido->frete === null ? null : Dinheiro::centavos($pedido->frete));

        $tirar = function (?string $frase) use ($pedido, $pedidoId, $todas, $freteSemCupom) {
            if (! $pedido->cupomId && Dinheiro::centavos($pedido->descontoCupom) <= 0 && ! $pedido->freteCupom) {
                return null;
            }
            PedidoItem::query()->where('pedidoId', $pedidoId)->update(['descontoCupom' => 0]);
            $pedido->update(['cupomId' => null, 'codigoCupom' => null, 'descontoCupom' => 0, 'freteCupom' => false, 'total' => Dinheiro::decimal($todas), 'frete' => $freteSemCupom === null ? null : Dinheiro::decimal($freteSemCupom)]);

            return $frase;
        };

        if ($retirar) {
            return $tirar("Cupom {$pedido->codigoCupom} retirado");
        }
        $novo = $codigo !== null;
        $cupom = $novo ? $this->buscar($codigo, true) : ($pedido->cupomId ? Cupom::query()->with(self::COM_ALVOS)->find($pedido->cupomId) : null);
        if ($novo && ! $cupom) {
            throw new ErroNegocio('Cupom não encontrado.');
        }
        if (! $cupom) {
            return $tirar($pedido->codigoCupom ? "Cupom {$pedido->codigoCupom} retirado: ele não existe mais" : null);
        }

        $ctx = [
            'agora' => now(), 'quem' => $quem, 'clienteId' => $pedido->clienteId, 'tipoPedido' => $pedido->origem->value === 'balcao' ? 'balcao' : $pedido->tipo->value,
            ...($novo ? $this->contexto($cupom->id, $pedido->clienteId, $pedidoId) : ['usosTotal' => 0, 'usosCliente' => 0, 'jaComprou' => false, 'jaAplicado' => true]),
        ];
        $r = AvaliadorDeCupom::avaliar(self::regraDe($cupom), $this->pecas($linhas->map(fn ($i) => [
            'chave' => $i->id, 'produtoId' => $i->produtoId, 'preco' => (float) $i->precoUnitario, 'quantidade' => $i->quantidade,
        ])->values()->all()), $ctx);
        if (! $r['ok']) {
            if ($novo) {
                throw new ErroNegocio($r['mensagem']);
            }

            return $tirar("Cupom {$cupom->codigo} retirado: {$r['mensagem']}");
        }

        $porLinha = collect($r['descontos'])->mapWithKeys(fn ($d) => [$d['chave'] => $d['valor']]);
        foreach ($pedido->itens as $i) {
            $valor = $porLinha->get($i->id, 0);
            if (Dinheiro::centavos($i->descontoCupom) !== Dinheiro::centavos($valor)) {
                $i->update(['descontoCupom' => Dinheiro::decimal(Dinheiro::centavos($valor))]);
            }
        }
        $desconto = Dinheiro::centavos($r['desconto']);
        $anterior = Dinheiro::centavos($pedido->descontoCupom);
        $pedido->update([
            'cupomId' => $cupom->id, 'codigoCupom' => $cupom->codigo, 'descontoCupom' => Dinheiro::decimal($desconto), 'freteCupom' => $r['freteGratis'],
            'total' => Dinheiro::decimal($todas - $desconto), 'frete' => $r['freteGratis'] ? '0.00' : ($freteSemCupom === null ? null : Dinheiro::decimal($freteSemCupom)),
        ]);

        $efeito = $r['freteGratis'] ? 'frete grátis' : '−'.Dinheiro::brl($r['desconto']);
        if ($novo) {
            return "Cupom {$cupom->codigo} aplicado ({$efeito})";
        }
        if (! $r['freteGratis'] && $desconto !== $anterior) {
            return "Cupom {$cupom->codigo}: desconto de ".Dinheiro::brl($anterior / 100).' para '.Dinheiro::brl($r['desconto']);
        }

        return null;
    }
}
