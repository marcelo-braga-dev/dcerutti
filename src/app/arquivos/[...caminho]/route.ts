import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { caminhoDoArquivo, lerFaixa } from '@/server/arquivos';

const TIPOS: Record<string, string> = {
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.avif': 'image/avif',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
};

/**
 * Serve os arquivos gravados em armazenamento/ (D-13). Públicos de propósito: as fotos vão nos links do WhatsApp.
 * Os nomes nunca se repetem, então o cache pode ser permanente. Aceita Range (D-29): o navegador pede o vídeo em
 * partes para começar a tocar e avançar, e o Safari do iPhone não toca vídeo sem isso.
 */
export async function GET(req: Request, { params }: { params: Promise<{ caminho: string[] }> }) {
  const alvo = caminhoDoArquivo((await params).caminho);
  const tipo = alvo ? TIPOS[path.extname(alvo).toLowerCase()] : undefined;
  if (!alvo || !tipo) return new Response('Não encontrado', { status: 404 });
  const info = await stat(alvo).catch(() => null);
  if (!info?.isFile()) return new Response('Não encontrado', { status: 404 });
  const cabecalhos = {
    'Content-Type': tipo,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  };
  const faixa = lerFaixa(req.headers.get('range'), info.size);
  if (faixa === 'invalida') return new Response(null, { status: 416, headers: { ...cabecalhos, 'Content-Range': `bytes */${info.size}` } });
  if (faixa) {
    const [inicio, fim] = faixa;
    return new Response(Readable.toWeb(createReadStream(alvo, { start: inicio, end: fim })) as ReadableStream, {
      status: 206,
      headers: { ...cabecalhos, 'Content-Length': String(fim - inicio + 1), 'Content-Range': `bytes ${inicio}-${fim}/${info.size}` },
    });
  }
  return new Response(Readable.toWeb(createReadStream(alvo)) as ReadableStream, { headers: { ...cabecalhos, 'Content-Length': String(info.size) } });
}
