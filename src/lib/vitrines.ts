/**
 * Vitrines (docs/26) — regras puras: uma vitrine é um conjunto de peças ligado a uma live ou publicação do Instagram.
 * A live em si continua no Instagram: aqui ficam as peças, o preço especial e o link.
 */

export type TipoVitrine = 'live' | 'post' | 'reels' | 'story';
export type StatusVitrine = 'rascunho' | 'agendada' | 'no_ar' | 'publicada' | 'encerrada' | 'arquivada';

export const TIPOS_VITRINE: Record<TipoVitrine, string> = { live: 'Live', post: 'Post do feed', reels: 'Reels', story: 'Story' };
export const STATUS_VITRINE: Record<StatusVitrine, string> = { rascunho: 'Rascunho', agendada: 'Agendada', no_ar: 'No ar', publicada: 'Publicada', encerrada: 'Encerrada', arquivada: 'Arquivada' };

export const ehTipoVitrine = (v: unknown): v is TipoVitrine => typeof v === 'string' && v in TIPOS_VITRINE;
export const ehStatusVitrine = (v: unknown): v is StatusVitrine => typeof v === 'string' && v in STATUS_VITRINE;

/** Situações que aparecem ao público com o pedido aberto. */
export const STATUS_ATIVOS: StatusVitrine[] = ['agendada', 'no_ar', 'publicada'];
export const vitrineAtiva = (status: string) => (STATUS_ATIVOS as string[]).includes(status);

/** Para onde cada situação pode ir. Rascunho e arquivada não aparecem ao público. */
export function proximosStatus(tipo: TipoVitrine, status: StatusVitrine): StatusVitrine[] {
  if (status === 'encerrada') return ['arquivada', ...(tipo === 'live' ? [] : (['publicada'] as StatusVitrine[]))];
  if (status === 'arquivada') return ['encerrada'];
  if (tipo === 'live') return ({ rascunho: ['agendada'], agendada: ['no_ar', 'rascunho'], no_ar: ['encerrada'] } as Partial<Record<StatusVitrine, StatusVitrine[]>>)[status] ?? [];
  return ({ rascunho: ['publicada'], publicada: ['encerrada'] } as Partial<Record<StatusVitrine, StatusVitrine[]>>)[status] ?? [];
}

/** O preço especial vale com a vitrine ativa e dentro da data. */
export const ofertaVale = (v: { status: string; ofertaAte: Date | string | null }, agora = new Date()) =>
  vitrineAtiva(v.status) && (!v.ofertaAte || new Date(v.ofertaAte).getTime() > agora.getTime());

/** "Novidades de Inverno!" vira "novidades-de-inverno". O endereço é o que circula: curto e sem acento. */
export function gerarSlug(titulo: string) {
  const s = titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  return s || 'vitrine';
}

/** Só endereços https do Instagram: a página pública usa este link. Inválido = null. */
export function urlInstagramValida(v: string): string | null {
  let u: URL;
  try { u = new URL(v.trim()); } catch { return null; }
  if (u.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(u.hostname) || u.username || u.password || u.port) return null;
  return u.toString().slice(0, 300);
}

/** Robôs que buscam a prévia do link (WhatsApp, Facebook, buscadores): não contam como visita. */
export const ROBO = /whatsapp|facebookexternalhit|facebot|bot|crawler|spider|preview|curl|wget/i;

type PecaConferida = { nome: string; imagens: number; videos: number; tamanhos: number; ativa: boolean };

/** O que conferir antes de publicar. Só avisa: quem decide é a pessoa. */
export function conferirVitrine(v: { tipo: TipoVitrine; urlInstagram: string | null; inicioPrevisto: Date | string | null; legenda?: string | null; pecas: PecaConferida[] }) {
  const avisos: string[] = [];
  if (!v.pecas.length) avisos.push('Adicione pelo menos uma peça.');
  if (v.tipo === 'live' && !v.inicioPrevisto) avisos.push('Marque a data e a hora da live.');
  if (v.tipo !== 'live' && !v.urlInstagram) avisos.push('Falta o link da publicação no Instagram.');
  if (v.tipo !== 'live' && !v.legenda?.trim()) avisos.push('Falta a legenda da publicação.');
  for (const p of v.pecas) {
    if (!p.ativa) avisos.push(`${p.nome}: fora do catálogo; não aparece na página.`);
    else if (!p.tamanhos) avisos.push(`${p.nome}: sem estoque.`);
    else if (p.tamanhos === 1) avisos.push(`${p.nome}: só um tamanho disponível.`);
    if (p.ativa && !p.imagens) avisos.push(`${p.nome}: sem foto.`);
    if (p.ativa && v.tipo === 'live' && !p.videos) avisos.push(`${p.nome}: sem vídeo (opcional).`);
  }
  return avisos;
}

/**
 * Links em legendas e comentários do Instagram em geral não são clicáveis: a legenda aponta para a bio e para o endereço
 * curto, que a pessoa consegue ler e digitar.
 */
export function legendaSugerida(v: { tipo: TipoVitrine; titulo: string; dominio: string }) {
  return v.tipo === 'live'
    ? `${v.titulo}\n\nVem com a gente na live! As peças ficam em ${v.dominio}/live (link na bio).`
    : `${v.titulo}\n\nGostou? Veja as peças e os tamanhos pelo link na bio: ${v.dominio}/vitrines`;
}
