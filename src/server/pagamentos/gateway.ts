import 'server-only';
import { gatewayFalso } from './falso';
import { gatewayMercadoPago } from './mercadopago';

/**
 * O Mercado Pago visto pelo resto do sistema (docs/27). Nada fora de src/server/pagamentos fala com a API direto:
 * trocar a API (plano B: Payments + Preferences) ou testar com o gateway falso não muda as regras.
 */

/** Situação de uma order, já lida da API. Valores em reais. */
export type SituacaoOrder = {
  orderId: string;
  status: string;
  statusDetalhe: string;
  referencia: string | null;
  valorTotal: number | null;
  valorPago: number | null;
  moeda: string | null;
  pagamentoId: string | null;
  meio: string | null;
  tipoMeio: string | null;
  parcelas: number | null;
  taxa: number | null;
  valorEstornado: number;
  pixCopiaECola: string | null;
  checkoutUrl: string | null;
  expiraEm: Date | null;
};

export type NovoPix = {
  /** Chave de idempotência (a da cobrança). */
  chave: string;
  /** external_reference: o id da cobrança. */
  referencia: string;
  valor: number;
  descricao: string;
  pagador: { email: string; nome: string };
  minutos: number;
  urlAviso: string | null;
};

export type NovoCheckout = {
  chave: string;
  referencia: string;
  valor: number;
  descricao: string;
  itens: { titulo: string; quantidade: number; preco: number; codigo?: string | null; foto?: string | null }[];
  pagador: { email: string | null; nome: string };
  urls: { sucesso: string; falha: string; pendente: string };
  parcelasMax: number;
  semJurosAte: number;
  minutos: number;
  urlAviso: string | null;
};

export interface GatewayPagamento {
  readonly nome: 'mercadopago' | 'falso';
  criarPix(p: NovoPix): Promise<SituacaoOrder>;
  criarCheckout(p: NovoCheckout): Promise<SituacaoOrder>;
  consultar(orderId: string): Promise<SituacaoOrder>;
  /** Só enquanto ninguém pagou (created / action_required). */
  cancelar(orderId: string, chave: string): Promise<SituacaoOrder>;
  /** Sem `valor`: estorno total. */
  estornar(orderId: string, chave: string, parcial?: { pagamentoId: string; valor: number }): Promise<SituacaoOrder>;
}

/** Erro da API com mensagem para a equipe; `definitivo` = não adianta tentar de novo. */
export class ErroGateway extends Error {
  constructor(message: string, readonly codigo: string | null = null, readonly definitivo = false, readonly http: number | null = null) {
    super(message);
  }
}

/** Gateway em uso: `PAGAMENTO_GATEWAY=falso` nos testes; senão o Mercado Pago (exige `MP_ACCESS_TOKEN`). */
export function gateway(): GatewayPagamento {
  return process.env.PAGAMENTO_GATEWAY === 'falso' ? gatewayFalso : gatewayMercadoPago;
}

/** Credenciais presentes? Sem elas, o painel avisa e nada é cobrado. */
export function gatewayConfigurado() {
  if (process.env.PAGAMENTO_GATEWAY === 'falso') return true;
  return !!process.env.MP_ACCESS_TOKEN;
}
