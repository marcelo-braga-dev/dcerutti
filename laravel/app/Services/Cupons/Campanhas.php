<?php

namespace App\Services\Cupons;

use App\Enums\OrigemCupom;
use App\Enums\StatusPedido;
use App\Models\Cliente;
use App\Models\Cupom;
use App\Services\Config;
use App\Support\Datas;
use Carbon\CarbonImmutable;

/**
 * Campanhas de cupom (docs/20-cupons.md, fase 4; src/server/campanhas.ts). Próxima compra: um cupom modelo (nunca
 * aplicado) com o desconto; cada venda que se encaixa gera um cupom pessoal de uso único para a cliente.
 */
class Campanhas
{
    public const CODIGO_MODELO_PROXIMA = 'MODELO-PROXIMA-COMPRA';

    /** Sem 0/O, 1/I/L: o código é ditado e digitado. */
    private const LETRAS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

    public function __construct(private Config $config, private CupomNoPedido $cupons) {}

    /**
     * Na confirmação da venda (mesma transação): gera o cupom de próxima compra, se a campanha estiver ligada e a venda
     * se encaixar. Não gera abaixo do mínimo, em venda com cupom (salvo "gera com cupom") ou, sem "acumular", se a
     * cliente já tem um cupom de próxima compra válido e não usado.
     *
     * @return ?array{codigo: string, regra: string, inicioEm: CarbonImmutable, fimEm: CarbonImmutable}
     */
    public function gerarCupomProximaCompra(string $pedidoId, string $clienteId, float $valorVenda, bool $tinhaCupom): ?array
    {
        if (! $this->config->get('cupons.ligados')) {
            return null;
        }
        $regras = $this->config->get('proximaCompra');
        $modelo = Cupom::query()->with(CupomNoPedido::COM_ALVOS)->where('origem', OrigemCupom::ProximaCompra)->where('modelo', true)->where('ativo', true)->first();
        if (! $modelo || $valorVenda < $regras['minimoParaGerar'] || ($tinhaCupom && ! $regras['geraComCupom'])) {
            return null;
        }
        // Venda sem identificar a cliente ("Consumidor final" do caixa) ou ficha anonimizada: não há pessoa para receber.
        if (! Cliente::query()->whereKey($clienteId)->value('telefone')) {
            return null;
        }
        $fichas = $this->cupons->fichasDaPessoa($clienteId);
        if (! $regras['acumula']) {
            $pendente = Cupom::query()
                ->where('origem', OrigemCupom::ProximaCompra)->where('modelo', false)->where('ativo', true)
                ->whereHas('clientes', fn ($q) => $q->whereIn('clienteId', $fichas))
                ->where(fn ($q) => $q->whereNull('fimEm')->orWhere('fimEm', '>=', now()))
                ->whereDoesntHave('pedidos', fn ($q) => $q->where('status', '<>', StatusPedido::Cancelado))
                ->exists();
            if ($pendente) {
                return null;
            }
        }

        $hoje = CarbonImmutable::now();
        $inicioEm = Datas::inicioDoDia(Datas::dia($hoje->addDays($regras['diasParaComecar'])));
        $fimEm = Datas::fimDoDia(Datas::dia($hoje->addDays($regras['diasParaComecar'] + $regras['diasValidade'])));
        // Código aleatório: em caso raro de repetido, tenta outro (a unicidade é do banco).
        for ($tentativa = 0; $tentativa < 5; $tentativa++) {
            $codigo = 'VOLTA-'.collect(range(1, 6))->map(fn () => self::LETRAS[random_int(0, strlen(self::LETRAS) - 1)])->implode('');
            if (Cupom::query()->where('codigo', $codigo)->exists()) {
                continue;
            }
            $c = Cupom::query()->create([
                'codigo' => $codigo, 'tipo' => $modelo->tipo, 'valor' => $modelo->valor, 'tetoDesconto' => $modelo->tetoDesconto, 'minimoCompra' => $modelo->minimoCompra,
                'valePromocao' => $modelo->valePromocao, 'quemAplica' => $modelo->quemAplica, 'descricao' => 'Cupom de próxima compra',
                'inicioEm' => $inicioEm, 'fimEm' => $fimEm, 'limiteTotal' => 1, 'limitePorCliente' => 1, 'ativo' => true,
                'origem' => OrigemCupom::ProximaCompra, 'modeloId' => $modelo->id, 'pedidoOrigemId' => $pedidoId,
            ]);
            $c->categorias()->createMany($modelo->categorias->map(fn ($x) => ['categoriaId' => $x->categoriaId])->all());
            $c->marcas()->createMany($modelo->marcas->map(fn ($x) => ['marcaId' => $x->marcaId])->all());
            $c->produtos()->createMany($modelo->produtos->map(fn ($x) => ['produtoId' => $x->produtoId])->all());
            $c->clientes()->create(['clienteId' => $clienteId]);
            $c->load(CupomNoPedido::COM_ALVOS);

            return ['codigo' => $codigo, 'regra' => AvaliadorDeCupom::regraEmPalavras(CupomNoPedido::regraDe($c), CupomNoPedido::nomesDosAlvos($c)), 'inicioEm' => $inicioEm, 'fimEm' => $fimEm];
        }

        return null;
    }
}
