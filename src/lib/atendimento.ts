/**
 * Atendimento online (docs/26) — regras puras: etapas, motivos de perda, Instagram e respostas prontas.
 * As conversas continuam no WhatsApp e no Instagram; aqui fica quem atender, o que enviar e quando retomar.
 */

export type Etapa = 'novo' | 'em_conversa' | 'proposta' | 'aguardando_pagamento' | 'ganho' | 'perdido';
export type Canal = 'whatsapp' | 'instagram' | 'loja' | 'link_peca' | 'vitrine' | 'live' | 'indicacao' | 'outro';

export const ETAPAS: Record<Etapa, string> = {
  novo: 'Novo', em_conversa: 'Em conversa', proposta: 'Proposta', aguardando_pagamento: 'Aguardando pagamento', ganho: 'Vendido', perdido: 'Perdido',
};

/** Etapas que a equipe escolhe; aguardando pagamento e vendido vêm do pedido. */
export const ETAPAS_MANUAIS: Etapa[] = ['em_conversa', 'proposta', 'perdido'];

export const CANAIS: Record<Canal, string> = {
  whatsapp: 'WhatsApp', instagram: 'Instagram', loja: 'Loja física', link_peca: 'Link da peça', vitrine: 'Vitrine', live: 'Live', indicacao: 'Indicação', outro: 'Outro',
};

/** Canais do cadastro manual; link da peça, vitrine e live entram sozinhos. */
export const CANAIS_MANUAIS: Canal[] = ['whatsapp', 'instagram', 'loja', 'indicacao', 'outro'];

export const MOTIVOS_PERDA: Record<string, string> = {
  preco: 'Preço', tamanho: 'Tamanho', sem_estoque: 'Sem estoque', frete: 'Frete', desistiu: 'Desistiu', sem_resposta: 'Sem resposta', outro: 'Outro',
};

export const ehEtapa = (v: unknown): v is Etapa => typeof v === 'string' && v in ETAPAS;
export const ehCanal = (v: unknown): v is Canal => typeof v === 'string' && v in CANAIS;

/** "@Fulana", "instagram.com/fulana/" e "fulana" viram "fulana". Inválido ou vazio = null. */
export function normalizarInstagram(v: string): string | null {
  let t = v.trim().toLowerCase();
  const url = /(?:instagram\.com|instagr\.am)\/([^/?#\s]+)/.exec(t);
  if (url) t = url[1];
  t = t.replace(/^@+/, '').replace(/\/+$/, '');
  return /^[a-z0-9._]{1,30}$/.test(t) ? t : null;
}

export const linkDirect = (usuario: string) => `https://ig.me/m/${encodeURIComponent(usuario)}`;

/** A etapa que o pedido define: `vendeu` = saiu venda (condicional devolvido inteiro não é venda). */
export const etapaDoFechamento = (status: 'confirmado' | 'cancelado', vendeu: boolean): Etapa => (status === 'confirmado' && vendeu ? 'ganho' : 'em_conversa');

/** Depois do primeiro contato, se ninguém marcou outra data, o retorno fica para o dia seguinte. */
export const retornoPadrao = (agora: Date) => new Date(agora.getTime() + 86_400_000);

export const VARIAVEIS_RESPOSTA = ['nome', 'vendedora', 'loja', 'peca', 'preco', 'tamanhos'] as const;
export type VariaveisResposta = Partial<Record<(typeof VARIAVEIS_RESPOSTA)[number], string>>;

/** Variáveis digitadas que não existem: o formulário avisa em vez de mandar "{nmoe}" para a cliente. */
export const variaveisDesconhecidas = (texto: string) =>
  [...texto.matchAll(/\{([^{}\s]+)\}/g)].map(m => m[1]).filter(v => !(VARIAVEIS_RESPOSTA as readonly string[]).includes(v));

/** Troca as variáveis. Sem valor, a variável sai, e os espaços e pontuações que sobraram são arrumados. */
export function montarResposta(texto: string, v: VariaveisResposta) {
  return texto
    .replace(/\{(\w+)\}/g, (original, nome: string) => ((VARIAVEIS_RESPOSTA as readonly string[]).includes(nome) ? (v[nome as keyof VariaveisResposta] ?? '') : original))
    .replace(/[ \t]+([,.!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^,\s*/gm, '')
    .trim();
}

/** Modelos com que a loja começa (a migration grava os mesmos). O proprietário revisa os textos em Respostas prontas. */
export const RESPOSTAS_DA_LOJA: { titulo: string; texto: string }[] = [
  { titulo: 'Saudação', texto: 'Oi, {nome}! Aqui é {vendedora}, da {loja}. Como posso te ajudar?' },
  { titulo: 'Peça disponível', texto: 'Oi, {nome}! A {peca} está disponível nos tamanhos {tamanhos}, por {preco}. Qual tamanho você usa?' },
  { titulo: 'Provar em casa', texto: '{nome}, você pode provar em casa: separo as peças, você experimenta e fica só com o que gostar. Quer que eu monte para você?' },
  { titulo: 'Pedir o WhatsApp', texto: 'Oi, {nome}! Para eu te mandar fotos, vídeos e os valores certinho, me passa seu WhatsApp com DDD?' },
  { titulo: 'Pagamento', texto: '{nome}, separei suas peças. Me confirma como prefere pagar e eu já finalizo para você.' },
  { titulo: 'Retomar conversa', texto: 'Oi, {nome}! Aqui é {vendedora}, da {loja}. Ficou com alguma dúvida sobre as peças que você viu?' },
  { titulo: 'Pós-venda', texto: 'Oi, {nome}! Aqui é {vendedora}, da {loja}. Suas peças chegaram bem? Conta para mim o que achou!' },
];
