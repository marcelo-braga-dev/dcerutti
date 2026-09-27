/** Servidores de imagem aceitos pelo otimizador do Next (next.config.ts) e pelo componente <Foto>. */
const hostR2 = process.env.NEXT_PUBLIC_IMAGENS_URL ? new URL(process.env.NEXT_PUBLIC_IMAGENS_URL).hostname : null;

export const HOSTS_IMAGENS = [
  'hering.vteximg.com.br',
  'outletespacohering.vteximg.com.br',
  'static.dafiti.com.br',
  ...(hostR2 ? [hostR2] : []),
];

export function otimizavel(src: string) {
  try {
    return HOSTS_IMAGENS.includes(new URL(src).hostname);
  } catch {
    return false;
  }
}

/** URL da foto passando pelo otimizador (mesma origem: pode ser desenhada em canvas sem CORS). Qualidade 75 = padrão permitido. */
export const urlOtimizada = (src: string, largura = 640) => `/_next/image?url=${encodeURIComponent(src)}&w=${largura}&q=75`;
