import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { caminhoDoArquivo } from '@/server/arquivos';

const TIPOS: Record<string, string> = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.avif': 'image/avif' };

/**
 * Serve os arquivos gravados em armazenamento/ (D-13). Públicos de propósito: as fotos vão nos links do WhatsApp.
 * Os nomes nunca se repetem, então o cache pode ser permanente.
 */
export async function GET(_: Request, { params }: { params: Promise<{ caminho: string[] }> }) {
  const alvo = caminhoDoArquivo((await params).caminho);
  const tipo = alvo ? TIPOS[path.extname(alvo).toLowerCase()] : undefined;
  if (!alvo || !tipo) return new Response('Não encontrado', { status: 404 });
  const info = await stat(alvo).catch(() => null);
  if (!info?.isFile()) return new Response('Não encontrado', { status: 404 });
  return new Response(Readable.toWeb(createReadStream(alvo)) as ReadableStream, {
    headers: {
      'Content-Type': tipo,
      'Content-Length': String(info.size),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
