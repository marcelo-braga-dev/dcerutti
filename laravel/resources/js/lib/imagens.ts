/**
 * Fotos de produto: as enviadas ficam no servidor em /arquivos/... (D-13). Os hosts externos abaixo só existem para
 * links antigos que ainda não foram migrados por scripts/migrar-fotos.ts.
 */
export const HOSTS_IMAGENS = ['hering.vteximg.com.br', 'outletespacohering.vteximg.com.br', 'static.dafiti.com.br'];

export const fotoLocal = (src: string) => src.startsWith('/arquivos/');

export function otimizavel(src: string) {
  if (fotoLocal(src)) return true;
  try {
    return HOSTS_IMAGENS.includes(new URL(src).hostname);
  } catch {
    return false;
  }
}

/** URL da foto passando pelo otimizador (mesma origem: pode ser desenhada em canvas sem CORS). Qualidade 75 = padrão permitido. */
export const urlOtimizada = (src: string, largura = 640) => `/_next/image?url=${encodeURIComponent(src)}&w=${largura}&q=75`;
