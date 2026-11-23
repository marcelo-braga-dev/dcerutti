/**
 * Pagamento online (docs/27) — regras puras, compartilhadas por servidor, painel e testes: a situação de cada cobrança,
 * a ordem em que ela pode mudar, a tradução da situação do Mercado Pago, o valor a cobrar e os textos.
 */

export type StatusCobranca = 'criada' | 'pendente' | 'aprovada' | 'recusada' | 'expirada' | 'cancelada' | 'estornada' | 'estornada_parcial' | 'contestada';
export type MetodoCobranca = 'pix' | 'checkout';

/** Cobrança ainda pode ser paga (e segura a reserva das peças). */
export const ATIVAS: StatusCobranca[] = ['criada', 'pendente'];
/** Dinheiro entrou e não saiu por inteiro. */
export const PAGAS: StatusCobranca[] = ['aprovada', 'estornada_parcial', 'contestada'];

export const ehAtiva = (s: string) => (ATIVAS as string[]).includes(s);
export const ehPaga = (s: string) => (PAGAS as string[]).includes(s);

export const ROTULO_STATUS: Record<StatusCobranca, string> = {
  criada: 'Criando',
  pendente: 'Aguardando pagamento',
  aprovada: 'Pago',
  recusada: 'Recusado',
  expirada: 'Vencido',
  cancelada: 'Cancelado',
  estornada: 'Estornado',
  estornada_parcial: 'Estornado em parte',
  contestada: 'Contestado',
};

export const COR_STATUS: Record<StatusCobranca, 'oliva' | 'cinza' | 'escuro' | 'vermelho' | 'padrao'> = {
  criada: 'padrao', pendente: 'escuro', aprovada: 'oliva', recusada: 'vermelho', expirada: 'cinza', cancelada: 'cinza',
  estornada: 'cinza', estornada_parcial: 'escuro', contestada: 'vermelho',
};

export const ROTULO_METODO: Record<MetodoCobranca, string> = { pix: 'Pix', checkout: 'Cartão (Mercado Pago)' };

/**
 * Mudanças permitidas. O Mercado Pago é a fonte da verdade, então um Pix pago no último segundo vence o "vencido" e uma
 * contestação ganha pela loja volta a "aprovada". Nunca se volta para criada/pendente depois de uma decisão, e um
 * estorno total é final. Mesma situação = só atualiza os detalhes (idempotente).
 */
const PROXIMOS: Record<StatusCobranca, StatusCobranca[]> = {
  criada: ['pendente', 'aprovada', 'recusada', 'expirada', 'cancelada', 'estornada', 'estornada_parcial', 'contestada'],
  pendente: ['aprovada', 'recusada', 'expirada', 'cancelada', 'estornada', 'estornada_parcial', 'contestada'],
  recusada: ['pendente', 'aprovada', 'expirada', 'cancelada', 'estornada', 'estornada_parcial', 'contestada'],
  expirada: ['aprovada', 'estornada', 'estornada_parcial', 'contestada'],
  cancelada: ['aprovada', 'estornada', 'estornada_parcial', 'contestada'],
  aprovada: ['estornada', 'estornada_parcial', 'contestada'],
  estornada_parcial: ['estornada', 'contestada'],
  contestada: ['aprovada', 'estornada', 'estornada_parcial'],
  estornada: [],
};

export const podeMudar = (de: StatusCobranca, para: StatusCobranca) => de === para || PROXIMOS[de].includes(para);

/**
 * Situação da order do Mercado Pago (status + status_detail, API Orders) traduzida. `recusada` é tentativa de cartão que
 * falhou: no Checkout Pro a cliente pode tentar de novo (`waiting_retry` continua pendente).
 */
export function traduzirStatusMp(status: string | null | undefined, detalhe: string | null | undefined): StatusCobranca {
  const s = String(status ?? '').toLowerCase();
  const d = String(detalhe ?? '').toLowerCase();
  switch (s) {
    case 'created':
    case 'processing':
    case 'action_required':
      return 'pendente';
    case 'processed':
      return d === 'partially_refunded' ? 'estornada_parcial' : 'aprovada';
    case 'refunded':
      return 'estornada';
    case 'charged_back':
      return d === 'reimbursed' ? 'aprovada' : 'contestada';
    case 'canceled':
    case 'cancelled':
      return d === 'expired' ? 'expirada' : 'cancelada';
    case 'expired':
      return 'expirada';
    case 'failed':
      return d === 'expired' ? 'expirada' : 'recusada';
    default:
      return 'pendente';
  }
}

/** Forma de pagamento gravada na tabela `pagamento`, a mesma do caixa (relatório por forma). */
export function formaDoMeio(meio: string | null | undefined, tipo: string | null | undefined): 'pix' | 'credito' | 'debito' | 'mercado_pago' {
  const m = String(meio ?? '').toLowerCase();
  const t = String(tipo ?? '').toLowerCase();
  if (m === 'pix') return 'pix';
  if (t === 'credit_card') return 'credito';
  if (t === 'debit_card' || t === 'prepaid_card') return 'debito';
  return 'mercado_pago';
}

const NOMES_MEIO: Record<string, string> = {
  pix: 'Pix', visa: 'Visa', master: 'Mastercard', amex: 'Amex', elo: 'Elo', hipercard: 'Hipercard', debvisa: 'Visa Débito',
  debmaster: 'Mastercard Débito', debelo: 'Elo Débito', account_money: 'Saldo Mercado Pago', bolbradesco: 'Boleto', pec: 'Lotérica',
};

export const nomeDoMeio = (meio: string | null | undefined) => (meio ? NOMES_MEIO[meio.toLowerCase()] ?? meio : '—');

/** Ex.: "Visa em 3×", "Pix". */
export function descreverMeio(c: { meio?: string | null; parcelas?: number | null }) {
  const nome = nomeDoMeio(c.meio);
  return c.parcelas && c.parcelas > 1 ? `${nome} em ${c.parcelas}×` : nome;
}

// ---------- Valor a cobrar (RP-01, RP-02) ----------

type PedidoParaCobrar = {
  tipo: 'compra' | 'condicional';
  status: 'pendente' | 'confirmado' | 'cancelado';
  origem: 'loja' | 'vendedor' | 'balcao';
  total: number;
  frete: number | null;
  pagamentoSituacao: string;
  /** Valor da venda já registrada (condicional fechado: só o que ficou, com o cupom). */
  venda: number | null;
};

export type ValorACobrar = { ok: true; valor: number } | { ok: false; motivo: string; precisaFrete?: boolean };

const centavos = (n: number) => Math.round(n * 100) / 100;

/**
 * Quanto cobrar do pedido agora, sempre a partir do banco. Compra: peças (já com cupom) + frete; com frete "a combinar"
 * não dá para cobrar, a equipe precisa informar o frete (0 = retirada ou grátis). Condicional: só depois de fechado,
 * o valor do que ficou.
 */
export function valorACobrar(p: PedidoParaCobrar): ValorACobrar {
  if (p.origem === 'balcao') return { ok: false, motivo: 'Venda na loja: o pagamento é registrado no caixa.' };
  if (p.status === 'cancelado') return { ok: false, motivo: 'Pedido cancelado.' };
  if (p.pagamentoSituacao === 'pago') return { ok: false, motivo: 'Este pedido já está pago.' };
  if (p.tipo === 'condicional') {
    if (p.status !== 'confirmado') return { ok: false, motivo: 'No condicional, a cobrança é do que ficou: feche o condicional primeiro.' };
    if (!p.venda || p.venda <= 0) return { ok: false, motivo: 'Nenhuma peça ficou com a cliente.' };
    return { ok: true, valor: centavos(p.venda) };
  }
  if (p.frete == null) return { ok: false, motivo: 'O frete está a combinar. Informe o frete (0 para retirada ou frete grátis) antes de cobrar.', precisaFrete: true };
  const valor = centavos((p.status === 'confirmado' && p.venda != null ? p.venda : p.total) + p.frete);
  if (!(valor > 0)) return { ok: false, motivo: 'O pedido não tem valor a cobrar.' };
  return { ok: true, valor };
}

/** "123.45": formato de valor da API do Mercado Pago. */
export const valorMp = (n: number) => centavos(n).toFixed(2);

/** Valor em reais de um texto da API ("123.45"), ou null. */
export function lerValorMp(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? centavos(n) : null;
}

/** Contagem regressiva do Pix: "29:58". */
export function tempoRestante(fim: Date | string, agora = Date.now()) {
  const s = Math.max(0, Math.floor((new Date(fim).getTime() - agora) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Mensagem da vendedora com o link de pagamento, para o WhatsApp. */
export function mensagemLinkPagamento(p: { nomeCliente: string; nomeVendedor: string; codigo: string; valor: number; link: string; pix: boolean; cartao: boolean; brl: (n: number) => string }) {
  const nome = p.nomeCliente.trim().split(/\s+/)[0] || '';
  const meios = p.pix && p.cartao ? 'Pix ou cartão' : p.pix ? 'Pix' : 'cartão';
  return [
    `Oi${nome ? `, ${nome}` : ''}! Aqui é ${p.nomeVendedor.split(' ')[0]} 😊`,
    '',
    `Segue o link para pagar o pedido *${p.codigo}* (${p.brl(p.valor)}) com ${meios}:`,
    p.link,
    '',
    'Assim que o pagamento cair, eu já fico sabendo por aqui. Qualquer dúvida, me chama!',
  ].join('\n');
}
