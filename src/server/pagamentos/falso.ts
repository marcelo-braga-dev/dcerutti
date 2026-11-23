import 'server-only';
import { randomUUID } from 'node:crypto';
import { ErroGateway, type GatewayPagamento, type SituacaoOrder } from './gateway';

/**
 * Gateway falso (docs/27), para os testes e o ambiente sem credenciais (`PAGAMENTO_GATEWAY=falso`). Guarda as orders na
 * memória do processo e responde como o Mercado Pago, inclusive a idempotência. `simular*` faz o papel da cliente.
 */

type OrderFalsa = SituacaoOrder & { chaves: Set<string> };

const g = globalThis as unknown as { __ordersFalsas?: Map<string, OrderFalsa>; __chavesFalsas?: Map<string, string> };
const orders = (g.__ordersFalsas ??= new Map());
const porChave = (g.__chavesFalsas ??= new Map());

const copia = (o: OrderFalsa): SituacaoOrder => {
  const { chaves: _c, ...resto } = o;
  void _c;
  return { ...resto };
};

function buscar(orderId: string) {
  const o = orders.get(orderId);
  if (!o) throw new ErroGateway('Mercado Pago: order_not_found', 'order_not_found', true, 404);
  return o;
}

function nova(chave: string, base: Partial<SituacaoOrder>): SituacaoOrder {
  const existente = porChave.get(chave);
  if (existente) return copia(buscar(existente));
  const orderId = `ORD${randomUUID().replace(/-/g, '').slice(0, 24).toUpperCase()}`;
  const o: OrderFalsa = {
    orderId, status: 'action_required', statusDetalhe: 'waiting_payment', referencia: null, valorTotal: null, valorPago: null, moeda: 'BRL',
    pagamentoId: `PAY${randomUUID().replace(/-/g, '').slice(0, 24).toUpperCase()}`, meio: null, tipoMeio: null, parcelas: null, taxa: null,
    valorEstornado: 0, pixCopiaECola: null, checkoutUrl: null, expiraEm: null, ...base, chaves: new Set([chave]),
  };
  orders.set(orderId, o);
  porChave.set(chave, orderId);
  return copia(o);
}

export const gatewayFalso: GatewayPagamento & {
  simularPagamento(orderId: string, p?: { meio?: string; tipoMeio?: string; parcelas?: number; valor?: number; taxa?: number }): SituacaoOrder;
  simularSituacao(orderId: string, status: string, detalhe: string): SituacaoOrder;
  limpar(): void;
  ultima(): SituacaoOrder | null;
  falharProxima: string | null;
} = {
  nome: 'falso',
  falharProxima: null,

  async criarPix(p) {
    if (this.falharProxima) { const m = this.falharProxima; this.falharProxima = null; throw new ErroGateway(m, 'falso'); }
    return nova(p.chave, {
      referencia: p.referencia, valorTotal: p.valor, statusDetalhe: 'waiting_transfer', meio: 'pix', tipoMeio: 'bank_transfer',
      pixCopiaECola: `00020126580014br.gov.bcb.pix0136${p.referencia}520400005303986540${p.valor.toFixed(2)}5802BR6304TEST`,
      expiraEm: new Date(Date.now() + p.minutos * 60_000),
    });
  },

  async criarCheckout(p) {
    if (this.falharProxima) { const m = this.falharProxima; this.falharProxima = null; throw new ErroGateway(m, 'falso'); }
    const o = nova(p.chave, { referencia: p.referencia, valorTotal: p.valor, status: 'created', statusDetalhe: 'created', expiraEm: new Date(Date.now() + p.minutos * 60_000) });
    const fo = buscar(o.orderId);
    fo.checkoutUrl = `https://www.mercadopago.com.br/checkout/v1/redirect?order_id=${o.orderId}`;
    return copia(fo);
  },

  async consultar(orderId) {
    return copia(buscar(orderId));
  },

  async cancelar(orderId) {
    const o = buscar(orderId);
    if (!['created', 'action_required'].includes(o.status)) throw new ErroGateway('Mercado Pago: cannot_cancel_order', 'cannot_cancel_order', true, 409);
    o.status = 'canceled';
    o.statusDetalhe = 'canceled_transaction';
    return copia(o);
  },

  async estornar(orderId, _chave, parcial) {
    const o = buscar(orderId);
    if (o.status !== 'processed') throw new ErroGateway('Mercado Pago: cannot_refund_order', 'cannot_refund_order', true, 409);
    const pago = o.valorPago ?? o.valorTotal ?? 0;
    const valor = parcial ? parcial.valor : pago - o.valorEstornado;
    if (valor <= 0 || o.valorEstornado + valor > pago + 0.001) throw new ErroGateway('Mercado Pago: refund_amount_exceeds', 'refund_amount_exceeds', true, 400);
    o.valorEstornado = Math.round((o.valorEstornado + valor) * 100) / 100;
    if (o.valorEstornado >= pago - 0.001) { o.status = 'refunded'; o.statusDetalhe = 'refunded'; }
    else o.statusDetalhe = 'partially_refunded';
    return copia(o);
  },

  simularPagamento(orderId, p = {}) {
    const o = buscar(orderId);
    o.status = 'processed';
    o.statusDetalhe = 'accredited';
    o.valorPago = p.valor ?? o.valorTotal;
    o.meio = p.meio ?? o.meio ?? 'visa';
    o.tipoMeio = p.tipoMeio ?? o.tipoMeio ?? 'credit_card';
    o.parcelas = p.parcelas ?? (o.meio === 'pix' ? 1 : o.parcelas ?? 1);
    o.taxa = p.taxa ?? Math.round((o.valorPago ?? 0) * (o.meio === 'pix' ? 0.0099 : 0.0498) * 100) / 100;
    return copia(o);
  },

  simularSituacao(orderId, status, detalhe) {
    const o = buscar(orderId);
    o.status = status;
    o.statusDetalhe = detalhe;
    return copia(o);
  },

  limpar() {
    orders.clear();
    porChave.clear();
  },

  ultima() {
    const l = [...orders.values()].at(-1);
    return l ? copia(l) : null;
  },
};
