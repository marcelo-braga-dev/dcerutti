/**
 * Pós-venda (docs/26) — regras puras: o que programar depois da venda, consentimento de ofertas e os textos.
 * Tudo é manual: o sistema lembra, sugere o texto e registra o resultado; quem manda a mensagem é a pessoa.
 */

export type TipoPosVenda = 'entrega' | 'satisfacao' | 'sugestao' | 'reativacao';
export type DiasPosVenda = Record<TipoPosVenda, number>;

export const DIAS_POS_VENDA: DiasPosVenda = { entrega: 1, satisfacao: 7, sugestao: 30, reativacao: 90 };

export const TIPOS_POS_VENDA: Record<TipoPosVenda, string> = { entrega: 'Entrega', satisfacao: 'Satisfação', sugestao: 'Sugestão', reativacao: 'Reativação' };

/** Oferta depende de aceite; falar sobre o próprio pedido, não. */
export const ehOferta = (t: string) => t === 'sugestao' || t === 'reativacao';

const DIA = 86_400_000;

/** Venda na loja física não tem entrega a acompanhar: só os contatos de oferta. */
export function contatosDoPedido(origem: string, dias: DiasPosVenda, agora: Date) {
  const tipos: TipoPosVenda[] = origem === 'balcao' ? ['sugestao', 'reativacao'] : ['entrega', 'satisfacao', 'sugestao', 'reativacao'];
  return tipos.map(tipo => ({ tipo, venceEm: new Date(agora.getTime() + dias[tipo] * DIA) }));
}

export const RESULTADOS_POS_VENDA: Record<string, string> = { respondeu: 'Respondeu', nao_respondeu: 'Não respondeu', virou_atendimento: 'Virou atendimento', pulado: 'Pulado' };

const TEXTOS: Record<TipoPosVenda, string> = {
  entrega: 'Oi, {nome}! Aqui é {vendedora}, da {loja}. Suas peças chegaram bem?',
  satisfacao: 'Oi, {nome}! Aqui é {vendedora}, da {loja}. O que achou das peças? Serviram direitinho?',
  sugestao: 'Oi, {nome}! Aqui é {vendedora}, da {loja}. Chegaram novidades que combinam com o que você levou. Quer que eu te mostre?',
  reativacao: 'Oi, {nome}! Aqui é {vendedora}, da {loja}. Faz um tempinho que não nos falamos. Posso te mostrar as novidades?',
};

export const textoPosVenda = (tipo: TipoPosVenda, v: { nome: string; vendedora: string; loja: string }) =>
  TEXTOS[tipo].replace('{nome}', v.nome).replace('{vendedora}', v.vendedora).replace('{loja}', v.loja);

type Consentimento = { aceitaOfertasEm: Date | null; descadastradaEm: Date | null };

export const aceitaOfertas = (c: Consentimento | null | undefined) => !!c?.aceitaOfertasEm && !c.descadastradaEm;

/**
 * Datas de consentimento depois de marcar ou desmarcar a caixa. Marcar de novo renova o aceite e limpa o descadastro.
 * Desmarcar sem nunca ter aceitado não muda nada: a pessoa não pediu para sair, só não entrou.
 */
export function consentimento(atual: Consentimento | null | undefined, marcado: boolean, agora = new Date()): Consentimento {
  // Só as duas datas: quem chama passa a ficha inteira e espalha o resultado na gravação.
  const a = { aceitaOfertasEm: atual?.aceitaOfertasEm ?? null, descadastradaEm: atual?.descadastradaEm ?? null };
  if (marcado) return aceitaOfertas(a) ? a : { aceitaOfertasEm: agora, descadastradaEm: null };
  return aceitaOfertas(a) ? { aceitaOfertasEm: a.aceitaOfertasEm, descadastradaEm: agora } : a;
}

export const SITUACOES_PAGAMENTO: Record<string, string> = { a_combinar: 'Pagamento a combinar', aguardando: 'Aguardando pagamento', pago: 'Pago' };
export const SITUACOES_ENTREGA: Record<string, string> = { a_combinar: 'Entrega a combinar', separando: 'Separando', enviado: 'Enviado', entregue: 'Entregue' };

/** "45 min", "3 h", "2 dias"; sem medida, um traço. */
export function tempoLegivel(minutos: number | null) {
  if (minutos == null) return '—';
  if (minutos < 60) return `${minutos} min`;
  if (minutos < 48 * 60) return `${Math.round(minutos / 60)} h`;
  return `${Math.round(minutos / (24 * 60))} dias`;
}
