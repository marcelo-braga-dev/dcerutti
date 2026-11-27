<?php

namespace App\Services\Pagamentos;

use App\Enums\StatusCobranca;
use App\Exceptions\ErroPagamento;
use App\Models\Cobranca;
use App\Models\EventoPagamento;
use App\Services\Estoque;
use Illuminate\Support\Facades\Log;

/**
 * Pontos em que o fluxo de pedidos encosta no pagamento online (docs/27; src/server/pagamentos/travas.ts).
 * O cancelamento das orders no Mercado Pago vem com o gateway, na fase 6; até lá só os registros locais mudam.
 */
class Travas
{
    public const ATIVAS = [StatusCobranca::Criada, StatusCobranca::Pendente];

    public const PAGAS = [StatusCobranca::Aprovada, StatusCobranca::EstornadaParcial, StatusCobranca::Contestada];

    public function __construct(private Estoque $estoque) {}

    /** RP-05: pedido com cobrança ativa ou paga não muda de peças, preço, cupom nem frete. */
    public function garantirSemCobranca(string $pedidoId): void
    {
        $c = Cobranca::query()->where('pedidoId', $pedidoId)->whereIn('status', [...self::ATIVAS, ...self::PAGAS])->first(['status']);
        if (! $c) {
            return;
        }
        throw new ErroPagamento(in_array($c->status, self::PAGAS, true)
            ? 'Este pedido já foi pago online. Para mudar as peças ou o valor, estorne o pagamento primeiro (quadro Pagamento online).'
            : 'Há um link de pagamento aberto para este pedido. Cancele a cobrança (quadro Pagamento online) antes de mudar o pedido.');
    }

    /** RP-08: pedido pago online só é cancelado ou desfeito depois do estorno. */
    public function garantirSemPagamento(string $pedidoId): void
    {
        if (Cobranca::query()->where('pedidoId', $pedidoId)->whereIn('status', self::PAGAS)->exists()) {
            throw new ErroPagamento('Este pedido foi pago online. Estorne o pagamento no quadro Pagamento online antes de cancelar.');
        }
    }

    /**
     * Pedido saindo de cena: as cobranças abertas são canceladas na mesma transação, e a reserva das peças volta.
     * Devolve as orders a cancelar no Mercado Pago depois do commit.
     *
     * @return list<string>
     */
    public function encerrarCobrancasAtivas(string $pedidoId, string $motivo): array
    {
        $ativas = Cobranca::query()->with('pedido.itens:id,pedidoId,varianteId,quantidade')->where('pedidoId', $pedidoId)->whereIn('status', self::ATIVAS)->get();
        foreach ($ativas as $c) {
            if ($c->reservou) {
                foreach ($c->pedido->itens as $i) {
                    $this->estoque->liberarReserva($i->varianteId, $i->quantidade);
                }
            }
            $c->update(['status' => StatusCobranca::Cancelada, 'reservou' => false]);
            EventoPagamento::query()->create(['cobrancaId' => $c->id, 'origem' => 'acao', 'tipo' => 'cancelada_com_pedido', 'mpOrderId' => $c->mpOrderId, 'dados' => ['motivo' => $motivo]]);
        }

        return $ativas->pluck('mpOrderId')->filter()->values()->all();
    }

    /** Depois do commit: cancela as orders no Mercado Pago. Falhou (já paga, fora do ar), a conciliação acerta. @param list<string> $orderIds */
    public function cancelarOrdersNoMercadoPago(array $orderIds): void
    {
        foreach ($orderIds as $id) {
            Log::info('Pagamento: order a cancelar no Mercado Pago (gateway chega na fase 6; a conciliação confere)', ['order' => $id]);
        }
    }

    /** Confirmação de compra: se uma cobrança segura a reserva das peças, a baixa usa essa reserva. */
    public function consumirReservaDaCobranca(string $pedidoId): bool
    {
        return Cobranca::query()->where('pedidoId', $pedidoId)->where('reservou', true)->update(['reservou' => false]) > 0;
    }
}
