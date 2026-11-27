/**
 * Sugestões para você (D-27, docs/23-selecoes.md) — lógica pura, usada pelo painel, pela página da cliente e pelo
 * servidor: situação (com "vencida" calculada pela validade), preço que vale em cada peça, totais e a mensagem do
 * WhatsApp para a cliente.
 */

export type StatusGravado = 'enviada' | 'vista' | 'respondida' | 'convertida' | 'cancelada';
export type Situacao = StatusGravado | 'vencida' | 'aEnviar';
export type Escolha = 'pendente' | 'quero' | 'talvez' | 'nao';

export const SITUACOES: Record<Situacao, { rotulo: string; cor: 'bege' | 'caramelo' | 'oliva' | 'escuro' | 'cinza' }> = {
  aEnviar: { rotulo: 'Para enviar', cor: 'caramelo' },
  enviada: { rotulo: 'Enviada', cor: 'bege' },
  vista: { rotulo: 'Vista', cor: 'caramelo' },
  respondida: { rotulo: 'Respondida', cor: 'escuro' },
  convertida: { rotulo: 'Virou pedido', cor: 'oliva' },
  vencida: { rotulo: 'Vencida', cor: 'cinza' },
  cancelada: { rotulo: 'Cancelada', cor: 'cinza' },
};

export const ESCOLHAS: Record<Exclude<Escolha, 'pendente'>, string> = { quero: 'Quero', talvez: 'Talvez', nao: 'Não' };

/** Opções de validade no painel (dias); padrão 7 (D-27). */
export const DIAS_VALIDADE = [3, 7, 15, 30] as const;
export const DIAS_PADRAO = 7;
export const MAX_ITENS = 30;

/** Vencida: passou da validade sem virar pedido nem ser cancelada. Para enviar: criado com "Só criar" e o link ainda não foi. */
export function situacaoDe(s: { status: StatusGravado; validaAte: Date; enviadaEm?: Date | null }, agora = new Date()): Situacao {
  if (s.status === 'convertida' || s.status === 'cancelada') return s.status;
  if (s.validaAte.getTime() < agora.getTime()) return 'vencida';
  return s.status === 'enviada' && s.enviadaEm === null ? 'aEnviar' : s.status;
}

/** A cliente ainda pode responder? (Para enviar também: o link já vale, só não foi mandado.) */
export const aberta = (s: Situacao) => s === 'enviada' || s === 'vista' || s === 'respondida' || s === 'aEnviar';

/** Preço que vale na peça: o especial só antes da validade e só abaixo do catálogo. */
export function precoQueVale(catalogo: number, oferta: number | null | undefined, vencida: boolean) {
  return !vencida && oferta != null && oferta > 0 && oferta < catalogo ? oferta : catalogo;
}

/** Desconto do preço especial sobre o catálogo (0 a 1). */
export const descontoDaOferta = (catalogo: number, oferta: number | null | undefined) =>
  oferta != null && oferta > 0 && oferta < catalogo ? 1 - oferta / catalogo : 0;

/** Totais das peças marcadas como "Quero" (com tamanho escolhido). */
export function totaisEscolhidos(itens: { escolha: Escolha; preco: number; quantidade: number; temTamanho: boolean }[]) {
  const quero = itens.filter(i => i.escolha === 'quero');
  return {
    pecas: quero.reduce((a, i) => a + i.quantidade, 0),
    total: Math.round(quero.reduce((a, i) => a + i.preco * i.quantidade, 0) * 100) / 100,
    semTamanho: quero.filter(i => !i.temTamanho).length,
  };
}

const primeiro = (nome: string) => nome.trim().split(/\s+/)[0] ?? '';

/** Mensagem do vendedor para a cliente, com o link da sugestão (o WhatsApp mostra o cartão com as fotos). */
export function mensagemDaSugestao(p: { nomeCliente: string; nomeVendedor: string; loja: string; titulo: string; mensagem?: string | null; link: string; pecas: number; validaAte: Date; temOferta: boolean; cupom?: string | null }) {
  const ate = p.validaAte.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
  return [
    `Oi, ${primeiro(p.nomeCliente)}! Aqui é ${primeiro(p.nomeVendedor)}, da ${p.loja}. 💛`,
    `Separei ${p.pecas} ${p.pecas === 1 ? 'peça' : 'peças'} para você: *${p.titulo}*`,
    p.mensagem?.trim() || null,
    `Toque no link, marque o que gostou e escolha o tamanho:\n${p.link}`,
    p.cupom ? `E o cupom *${p.cupom}* já vai aplicado quando você pedir.` : null,
    p.temOferta ? `Os preços especiais valem até ${ate}.` : `A sugestão fica aberta até ${ate}.`,
  ].filter(Boolean).join('\n\n');
}

/** Lembrete pelo WhatsApp, conforme o ponto em que ela parou. */
export function mensagemLembrete(p: { nomeCliente: string; nomeVendedor: string; situacao: Situacao; link: string; validaAte: Date; temOferta: boolean }) {
  const ate = p.validaAte.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
  const oi = `Oi, ${primeiro(p.nomeCliente)}! Aqui é ${primeiro(p.nomeVendedor)}. 😊`;
  const corpo = p.situacao === 'respondida'
    ? 'Vi que você marcou algumas peças. Ficou com alguma dúvida de tamanho ou cor? Posso separar para você.'
    : p.situacao === 'vista'
      ? 'Conseguiu ver as peças que separei? Se quiser, me fala o tamanho que eu já deixo reservado.'
      : 'Separei umas peças para você e acho que vai gostar. Dá uma olhadinha quando puder?';
  return [oi, corpo, p.link, p.temOferta ? `Os preços especiais valem até ${ate}.` : null].filter(Boolean).join('\n\n');
}

export type Atencao = 'enviar' | 'semAbrir' | 'viuSemResponder' | 'pensando' | 'vencendo';
export const ATENCAO: Record<Atencao, string> = {
  enviar: 'Criada e ainda não enviada',
  semAbrir: 'Enviada há 2 dias ou mais e ela não abriu',
  viuSemResponder: 'Ela viu há mais de 1 dia e não respondeu',
  pensando: 'Ela marcou as peças e está pensando',
  vencendo: 'Vence nas próximas 24 horas',
};

const H = 3_600_000;
/** A sugestão pede uma ação do vendedor agora? Devolve o motivo mais urgente, ou null. */
export function precisaDeAtencao(s: { situacao: Situacao; enviadaEm: Date | null; vistaEm: Date | null; respondidaEm: Date | null; validaAte: Date; lembradoEm?: Date | null }, agora = new Date()): Atencao | null {
  if (!aberta(s.situacao)) return null;
  if (s.situacao === 'aEnviar') return 'enviar';
  // Lembrado nas últimas 24 h: dá um tempo antes de pedir de novo.
  if (s.lembradoEm && agora.getTime() - s.lembradoEm.getTime() < 24 * H) return null;
  if (s.validaAte.getTime() - agora.getTime() < 24 * H) return 'vencendo';
  if (s.situacao === 'respondida') return 'pensando';
  if (s.situacao === 'vista' && s.vistaEm && agora.getTime() - s.vistaEm.getTime() > 24 * H) return 'viuSemResponder';
  if (s.situacao === 'enviada' && s.enviadaEm && agora.getTime() - s.enviadaEm.getTime() > 48 * H) return 'semAbrir';
  return null;
}
