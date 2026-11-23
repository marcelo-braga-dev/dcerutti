import 'server-only';
import { z } from 'zod';
import { lerValorMp, valorMp } from '@/lib/pagamento';
import { ErroGateway, type GatewayPagamento, type NovoCheckout, type NovoPix, type SituacaoOrder } from './gateway';

/**
 * Cliente da API Orders do Mercado Pago (docs/27), sem SDK: `fetch` + zod nas respostas.
 *   POST /v1/orders                 cria (Pix: processing_mode automatic; Checkout Pro: manual, devolve checkout_url)
 *   GET  /v1/orders/{id}            consulta (fonte da verdade, também depois de cada aviso)
 *   POST /v1/orders/{id}/cancel     cancela enquanto ninguém pagou
 *   POST /v1/orders/{id}/refund     estorna (corpo vazio = total; com transactions = parcial)
 * Toda escrita leva `X-Idempotency-Key`. Timeout de 10 s; nova tentativa só em 429/5xx/rede, respeitando Retry-After.
 * O log nunca leva o token nem dados do pagador.
 */

const API = () => (process.env.MP_API_URL || 'https://api.mercadopago.com').replace(/\/$/, '');
const TIMEOUT_MS = 10_000;
const TENTATIVAS = 3;

const valor = z.union([z.string(), z.number()]).nullish();

const pagamentoSchema = z.object({
  id: z.string().nullish(),
  amount: valor,
  paid_amount: valor,
  taxes_amount: valor,
  status: z.string().nullish(),
  status_detail: z.string().nullish(),
  date_of_expiration: z.string().nullish(),
  expiration_time: z.string().nullish(),
  payment_method: z.object({
    id: z.string().nullish(),
    type: z.string().nullish(),
    installments: z.number().nullish(),
    qr_code: z.string().nullish(),
    ticket_url: z.string().nullish(),
  }).passthrough().nullish(),
}).passthrough();

const orderSchema = z.object({
  id: z.string(),
  status: z.string().nullish(),
  status_detail: z.string().nullish(),
  external_reference: z.string().nullish(),
  total_amount: valor,
  total_paid_amount: valor,
  currency: z.string().nullish(),
  checkout_url: z.string().nullish(),
  transactions: z.object({
    payments: z.array(pagamentoSchema).nullish(),
    refunds: z.array(z.object({ amount: valor, status: z.string().nullish() }).passthrough()).nullish(),
  }).passthrough().nullish(),
}).passthrough();

type Order = z.infer<typeof orderSchema>;

/** Tradução da resposta da API para o formato do sistema. */
export function situacaoDaOrder(o: Order): SituacaoOrder {
  const pagamentos = o.transactions?.payments ?? [];
  // A tentativa que vale: a aprovada, se houver; senão a mais recente.
  const pag = pagamentos.find(p => p.status === 'processed') ?? pagamentos.at(-1) ?? null;
  const estornado = (o.transactions?.refunds ?? []).filter(r => !r.status || ['processed', 'approved', 'refunded'].includes(String(r.status))).reduce((a, r) => a + (lerValorMp(r.amount) ?? 0), 0);
  const expira = pag?.date_of_expiration ? new Date(pag.date_of_expiration) : null;
  return {
    orderId: o.id,
    status: o.status ?? '',
    statusDetalhe: o.status_detail ?? '',
    referencia: o.external_reference ?? null,
    valorTotal: lerValorMp(o.total_amount),
    valorPago: lerValorMp(o.total_paid_amount) ?? (pag?.status === 'processed' ? lerValorMp(pag.amount) : null),
    moeda: o.currency ?? null,
    pagamentoId: pag?.id ?? null,
    meio: pag?.payment_method?.id ?? null,
    tipoMeio: pag?.payment_method?.type ?? null,
    parcelas: pag?.payment_method?.installments ?? null,
    taxa: lerValorMp(pag?.taxes_amount),
    valorEstornado: Math.round(estornado * 100) / 100,
    pixCopiaECola: pag?.payment_method?.qr_code ?? null,
    checkoutUrl: o.checkout_url ?? null,
    expiraEm: expira && !Number.isNaN(expira.getTime()) ? expira : null,
  };
}

const espera = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Mensagem da API sem dados sensíveis: só o código e o texto do erro. */
function erroDaApi(http: number, corpo: unknown): ErroGateway {
  const c = (corpo ?? {}) as { errors?: { code?: string; message?: string }[]; error?: string; message?: string };
  const primeiro = c.errors?.[0];
  const codigo = primeiro?.code ?? c.error ?? null;
  const texto = primeiro?.message ?? c.message ?? `HTTP ${http}`;
  return new ErroGateway(`Mercado Pago: ${texto}`, codigo, http >= 400 && http < 500 && http !== 429, http);
}

async function chamar(metodo: 'GET' | 'POST', caminho: string, corpo?: unknown, idempotencia?: string): Promise<unknown> {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) throw new ErroGateway('Pagamento online sem credenciais: defina MP_ACCESS_TOKEN no servidor.', 'sem_credenciais', true);
  let ultimo: unknown = null;
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    try {
      const r = await fetch(`${API()}${caminho}`, {
        method: metodo,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(idempotencia ? { 'X-Idempotency-Key': idempotencia } : {}),
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: 'no-store',
      });
      const texto = await r.text();
      let json: unknown = null;
      try { json = texto ? JSON.parse(texto) : null; } catch { json = null; }
      if (r.ok) return json;
      const erro = erroDaApi(r.status, json);
      if (erro.definitivo || tentativa === TENTATIVAS) throw erro;
      ultimo = erro;
      const depois = Number(r.headers.get('retry-after'));
      await espera(Number.isFinite(depois) && depois > 0 ? Math.min(depois, 5) * 1000 : 400 * tentativa);
    } catch (e) {
      if (e instanceof ErroGateway && (e.definitivo || tentativa === TENTATIVAS)) throw e;
      if (!(e instanceof ErroGateway) && tentativa === TENTATIVAS) throw new ErroGateway('Mercado Pago fora do ar ou sem resposta. Tente de novo em instantes.', 'rede');
      ultimo = e;
      if (!(e instanceof ErroGateway)) await espera(400 * tentativa);
    }
  }
  throw ultimo instanceof Error ? ultimo : new ErroGateway('Falha ao falar com o Mercado Pago.');
}

async function order(metodo: 'GET' | 'POST', caminho: string, corpo?: unknown, idempotencia?: string) {
  const r = orderSchema.safeParse(await chamar(metodo, caminho, corpo, idempotencia));
  if (!r.success) throw new ErroGateway('Resposta inesperada do Mercado Pago.', 'resposta_invalida');
  return situacaoDaOrder(r.data);
}

const duracao = (min: number) => `PT${Math.max(1, Math.round(min))}M`;

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0]?.slice(0, 40) || 'Cliente';
const sobrenome = (nome: string) => nome.trim().split(/\s+/).slice(1).join(' ').slice(0, 60) || undefined;

export const gatewayMercadoPago: GatewayPagamento = {
  nome: 'mercadopago',

  criarPix(p: NovoPix) {
    const v = valorMp(p.valor);
    return order('POST', '/v1/orders', {
      type: 'online',
      processing_mode: 'automatic',
      external_reference: p.referencia,
      total_amount: v,
      description: p.descricao.slice(0, 150),
      payer: { email: p.pagador.email, first_name: primeiroNome(p.pagador.nome), last_name: sobrenome(p.pagador.nome) },
      transactions: { payments: [{ amount: v, payment_method: { id: 'pix', type: 'bank_transfer' }, expiration_time: duracao(p.minutos) }] },
      ...(p.urlAviso ? { config: { online: { callback_url: p.urlAviso } } } : {}),
    }, p.chave);
  },

  criarCheckout(p: NovoCheckout) {
    return order('POST', '/v1/orders', {
      type: 'online',
      processing_mode: 'manual',
      external_reference: p.referencia,
      // Precisa ser igual à soma dos itens: cobrancas.ts manda um item só, "Pedido PED-…", com o valor já com cupom e frete.
      total_amount: valorMp(p.valor),
      description: p.descricao.slice(0, 150),
      expiration_time: duracao(p.minutos),
      items: p.itens.map(i => ({
        title: i.titulo.slice(0, 120), quantity: i.quantidade, unit_price: valorMp(i.preco),
        ...(i.codigo ? { external_code: i.codigo.slice(0, 40) } : {}), ...(i.foto?.startsWith('https://') ? { picture_url: i.foto } : {}),
      })),
      ...(p.pagador.email ? { payer: { email: p.pagador.email, first_name: primeiroNome(p.pagador.nome), last_name: sobrenome(p.pagador.nome) } } : {}),
      config: {
        online: {
          success_url: p.urls.sucesso, failure_url: p.urls.falha, pending_url: p.urls.pendente, auto_return: 'all',
          ...(p.urlAviso ? { callback_url: p.urlAviso } : {}),
        },
        payment_method: {
          max_installments: Math.max(1, p.parcelasMax),
          ...(p.semJurosAte > 1 ? { installments: { interest_free: { type: 'range', values: [2, Math.min(p.semJurosAte, p.parcelasMax)] } } } : {}),
        },
      },
    }, p.chave);
  },

  consultar(orderId: string) {
    return order('GET', `/v1/orders/${encodeURIComponent(orderId)}`);
  },

  cancelar(orderId: string, chave: string) {
    return order('POST', `/v1/orders/${encodeURIComponent(orderId)}/cancel`, undefined, chave);
  },

  async estornar(orderId: string, chave: string, parcial?: { pagamentoId: string; valor: number }) {
    const corpo = parcial ? { transactions: [{ id: parcial.pagamentoId, amount: valorMp(parcial.valor) }] } : {};
    await chamar('POST', `/v1/orders/${encodeURIComponent(orderId)}/refund`, corpo, chave);
    // A resposta do estorno não traz tudo (meio, parcelas): consulta a order inteira.
    return order('GET', `/v1/orders/${encodeURIComponent(orderId)}`);
  },
};
