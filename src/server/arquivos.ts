// Sem 'server-only' de propósito: também é usado por scripts/migrar-fotos.ts, que roda fora do Next.
import { randomBytes } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

/**
 * Arquivos enviados ficam no servidor, numa pasta do projeto (D-13), servidos por /arquivos/... (src/app/arquivos).
 * Padrão: <projeto>/armazenamento. Fora do Git (.gitignore) e fora de public/ (o Next só serve public/ do build).
 */
export const DIR_ARQUIVOS = path.resolve(process.env.ARMAZENAMENTO_DIR || path.join(process.cwd(), 'armazenamento'));
export const PREFIXO_URL = '/arquivos';
export const TAMANHO_MAXIMO = 8 * 1024 * 1024;

const FORMATOS_ACEITOS = new Set(['jpeg', 'png', 'webp', 'avif', 'heif']);

export class ArquivoInvalido extends Error {}

/** Caminho absoluto dentro de DIR_ARQUIVOS, ou null se a URL tentar sair da pasta ("../"). */
export function caminhoDoArquivo(partes: string[]): string | null {
  if (!partes.length || partes.some(p => !p || p === '.' || p === '..' || p.includes('\0'))) return null;
  const alvo = path.resolve(DIR_ARQUIVOS, ...partes);
  return alvo.startsWith(DIR_ARQUIVOS + path.sep) ? alvo : null;
}

/**
 * Foto de produto: confere que é imagem de verdade (pelo conteúdo, não pela extensão), gira conforme o EXIF,
 * reduz para no máximo 1600 px e grava em WebP. Devolve a URL pública (/arquivos/produtos/<REF>/<nome>.webp).
 */
export async function salvarFotoProduto(referencia: string, dados: Buffer): Promise<string> {
  if (!/^[\w-]{1,20}$/.test(referencia)) throw new ArquivoInvalido('Referência inválida.');
  if (dados.length > TAMANHO_MAXIMO) throw new ArquivoInvalido('Foto acima de 8 MB.');
  let formato: string | undefined;
  try {
    formato = (await sharp(dados).metadata()).format;
  } catch {
    throw new ArquivoInvalido('O arquivo não é uma imagem válida.');
  }
  if (!formato || !FORMATOS_ACEITOS.has(formato)) throw new ArquivoInvalido('Use JPG, PNG, WebP ou AVIF.');
  const webp = await sharp(dados).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();

  const ref = referencia.toUpperCase();
  const nome = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}.webp`;
  const pasta = path.join(DIR_ARQUIVOS, 'produtos', ref);
  await mkdir(pasta, { recursive: true });
  // Grava em arquivo temporário e renomeia: quem lê nunca vê um arquivo pela metade.
  const temporario = path.join(pasta, `.${nome}.tmp`);
  await writeFile(temporario, webp);
  await rename(temporario, path.join(pasta, nome));
  return `${PREFIXO_URL}/produtos/${ref}/${nome}`;
}
