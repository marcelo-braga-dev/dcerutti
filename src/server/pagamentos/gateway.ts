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
  pagador: Pagador & { email: string };
  minutos: number;
  urlAviso: string | null;
};

/** O-07: quanto mais dados do pagador, melhor a aprovação e a análise de fraude do Mercado Pago. */
export type Pagador = { email: string | null; nome: string; telefone?: string | null; cpf?: string | null };

export type NovoCheckout = {
  chave: string;
  referencia: string;
  valor: number;
  descricao: string;
  itens: { titulo: string; quantidade: number; preco: number; codigo?: string | null; foto?: string | null }[];
  pagador: Pagador;
  /** O-06: nome que aparece na fatura do cartão. */
  nomeNaFatura: string;
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
  /** Confere as credenciais e diz de qual conta são (página de configuração do pagamento). */
  testarConexao(): Promise<ContaGateway>;
}

export type ContaGateway = { id: string; apelido: string | null; pais: string | null; teste: boolean };

/** Erro da API com mensagem para a equipe; `definitivo` = não adianta tentar de novo. */
export class ErroGateway extends Error {
  constructor(message: string, readonly codigo: string | null = null, readonly definitivo = false, readonly http: number | null = null) {
    super(message);
  }
}

/**
 * Banco de produção (D-15: `dcerutti_producao`) ou `PAGAMENTO_PRODUCAO=1`. Nele o Mercado Pago simulado nunca vale:
 * com o simulado, qualquer pessoa marcaria um pedido como pago pelo botão de teste (docs/28, R-01).
 */
export function ambienteDeProducao() {
  if (process.env.PAGAMENTO_PRODUCAO === '1') return true;
  const banco = /\/([^/?]+)(\?|$)/.exec(process.env.DATABASE_URL ?? '')?.[1] ?? '';
  return banco.endsWith('_producao');
}

/**
 * Como o pagamento está rodando: `mercadopago` (credenciais reais ou de teste), `simulado` (PAGAMENTO_GATEWAY=falso,
 * fora da produção) ou `bloqueado` (pediram o simulado na produção: nada é cobrado e o painel avisa).
 */
export function modoPagamento(): 'mercadopago' | 'simulado' | 'bloqueado' {
  if (process.env.PAGAMENTO_GATEWAY !== 'falso') return 'mercadopago';
  return ambienteDeProducao() ? 'bloqueado' : 'simulado';
}

export const simuladoAtivo = () => modoPagamento() === 'simulado';

let avisouBloqueio = false;

/** Gateway em uso: o simulado nos testes e no ambiente de teste; senão o Mercado Pago (exige `MP_ACCESS_TOKEN`). */
export function gateway(): GatewayPagamento {
  const modo = modoPagamento();
  if (modo === 'bloqueado') {
    if (!avisouBloqueio) { avisouBloqueio = true; console.error('Pagamento: PAGAMENTO_GATEWAY=falso ignorado no banco de produção. Retire a linha do .env.'); }
    throw new ErroGateway('O pagamento online está bloqueado: o modo simulado foi pedido na produção. Retire PAGAMENTO_GATEWAY do .env.', 'simulado_na_producao', true);
  }
  return modo === 'simulado' ? gatewayFalso : gatewayMercadoPago;
}

/** Pronto para cobrar? Sem credenciais (ou com o simulado bloqueado), o painel avisa e nada é cobrado. */
export function gatewayConfigurado() {
  const modo = modoPagamento();
  if (modo === 'bloqueado') return false;
  if (modo === 'simulado') return true;
  return !!process.env.MP_ACCESS_TOKEN;
}
