import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from '../db';
import { ErroNegocio } from '../erros';
import { liberarReserva } from '../estoque';
import { ATIVAS, PAGAS } from '@/lib/pagamento';
import { gateway } from './gateway';

/**
 * Pontos em que o fluxo de pedidos (server/pedidos.ts) encosta no pagamento online (docs/27). Ficam aqui, e não em
 * cobrancas.ts, porque cobrancas.ts usa pedidos.ts (confirmar ao pagar): assim não há import circular.
 */

type Tx = Prisma.TransactionClient;

export class ErroPagamento extends ErroNegocio {}

/** RP-05: pedido com cobrança ativa ou paga não muda de peças, preço, cupom nem frete. */
export async function garantirSemCobranca(tx: Tx, pedidoId: string) {
  const c = await tx.cobranca.findFirst({ where: { pedidoId, status: { in: [...ATIVAS, ...PAGAS] } }, select: { status: true } });
  if (!c) return;
  throw new ErroPagamento(PAGAS.includes(c.status)
    ? 'Este pedido já foi pago online. Para mudar as peças ou o valor, estorne o pagamento primeiro (quadro Pagamento online).'
    : 'Há um link de pagamento aberto para este pedido. Cancele a cobrança (quadro Pagamento online) antes de mudar o pedido.');
}

/** RP-08: pedido pago online só é cancelado ou desfeito depois do estorno. */
export async function garantirSemPagamento(tx: Tx, pedidoId: string) {
  const c = await tx.cobranca.findFirst({ where: { pedidoId, status: { in: PAGAS } }, select: { id: true } });
  if (c) throw new ErroPagamento('Este pedido foi pago online. Estorne o pagamento no quadro Pagamento online antes de cancelar.');
}

/**
 * Pedido saindo de cena (cancelado ou venda desfeita): as cobranças ainda abertas são canceladas aqui, na mesma
 * transação, e a reserva das peças volta. Devolve as orders a cancelar no Mercado Pago depois do commit.
 */
export async function encerrarCobrancasAtivas(tx: Tx, pedidoId: string, motivo: string): Promise<string[]> {
  const ativas = await tx.cobranca.findMany({ where: { pedidoId, status: { in: ATIVAS } }, include: { pedido: { select: { itens: { select: { varianteId: true, quantidade: true } } } } } });
  for (const c of ativas) {
    if (c.reservou) for (const i of c.pedido.itens) await liberarReserva(tx, i.varianteId, i.quantidade);
    await tx.cobranca.update({ where: { id: c.id }, data: { status: 'cancelada', reservou: false } });
    await tx.eventoPagamento.create({ data: { cobrancaId: c.id, origem: 'acao', tipo: 'cancelada_com_pedido', mpOrderId: c.mpOrderId, dados: { motivo } } });
  }
  return ativas.map(c => c.mpOrderId).filter((x): x is string => !!x);
}

/** Depois do commit: cancela as orders no Mercado Pago. Falhou (já paga, fora do ar), a conciliação acerta. */
export async function cancelarOrdersNoMercadoPago(orderIds: string[]) {
  for (const id of orderIds) {
    try {
      await gateway().cancelar(id, `cancelar-${id}`);
    } catch (e) {
      console.error('Pagamento: não foi possível cancelar a order no Mercado Pago (a conciliação confere)', id, e instanceof Error ? e.message : e);
      await db.eventoPagamento.create({ data: { origem: 'acao', tipo: 'falha_cancelar', mpOrderId: id, erro: e instanceof Error ? e.message : String(e) } }).catch(() => {});
    }
  }
}

/**
 * Confirmação de compra: se uma cobrança segura a reserva das peças, a baixa usa essa reserva (e a cobrança deixa de
 * segurar). Devolve true quando o estoque das peças estava reservado.
 */
export async function consumirReservaDaCobranca(tx: Tx, pedidoId: string) {
  const { count } = await tx.cobranca.updateMany({ where: { pedidoId, reservou: true }, data: { reservou: false } });
  return count > 0;
}
