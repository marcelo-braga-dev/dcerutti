// Sem 'server-only' de propósito: também é usado por scripts/migrar-fotos.ts, que roda fora do Next.
import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, open, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';

/**
 * Arquivos enviados ficam no servidor, numa pasta do projeto (D-13), servidos por /arquivos/... (src/app/arquivos).
 * Padrão: <projeto>/armazenamento. Fora do Git (.gitignore) e fora de public/ (o Next só serve public/ do build).
 */
export const DIR_ARQUIVOS = path.resolve(process.env.ARMAZENAMENTO_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), 'armazenamento'));
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

/** "bytes=início-fim", "bytes=início-" ou "bytes=-últimos". Só uma faixa; várias ou mal formadas: arquivo inteiro. */
export function lerFaixa(cabecalho: string | null, tamanho: number): [number, number] | 'invalida' | null {
  const m = cabecalho?.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (!m[1] && !m[2])) return null;
  let inicio: number, fim: number;
  if (!m[1]) {
    inicio = Math.max(0, tamanho - Number(m[2]));
    fim = tamanho - 1;
  } else {
    inicio = Number(m[1]);
    fim = m[2] ? Math.min(Number(m[2]), tamanho - 1) : tamanho - 1;
  }
  return inicio > fim || inicio >= tamanho ? 'invalida' : [inicio, fim];
}

export const TAMANHO_MAXIMO_VIDEO = 100 * 1024 * 1024;

/**
 * Vídeo de produto (D-29): grava o corpo da requisição direto no disco, sem juntar tudo na memória, e confere o
 * formato pelo conteúdo. Aceita MP4/MOV (H.264, AV1 ou VP9) e WebM. Não converte (o servidor não tem ffmpeg):
 * por isso recusa HEVC, o padrão das câmeras de iPhone, que não toca no Android nem no Windows.
 * MOV é o mesmo contêiner do MP4 e é gravado como .mp4. Devolve a URL pública (/arquivos/produtos/<REF>/<nome>).
 */
export async function salvarVideoProduto(referencia: string, corpo: ReadableStream<Uint8Array> | Readable): Promise<string> {
  if (!/^[\w-]{1,20}$/.test(referencia)) throw new ArquivoInvalido('Referência inválida.');
  const ref = referencia.toUpperCase();
  const pasta = path.join(DIR_ARQUIVOS, 'produtos', ref);
  await mkdir(pasta, { recursive: true });
  const base = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
  const temporario = path.join(pasta, `.${base}.tmp`);
  try {
    let total = 0;
    const limite = new Transform({
      transform(parte: Buffer, _, pronto) {
        total += parte.length;
        pronto(total > TAMANHO_MAXIMO_VIDEO ? new ArquivoInvalido('Vídeo acima de 100 MB.') : null, parte);
      },
    });
    const entrada = corpo instanceof Readable ? corpo : Readable.fromWeb(corpo as import('node:stream/web').ReadableStream<Uint8Array>);
    await pipeline(entrada, limite, createWriteStream(temporario));
    if (!total) throw new ArquivoInvalido('Escolha um vídeo.');
    const extensao = await conferirVideo(temporario);
    const nome = `${base}.${extensao}`;
    await rename(temporario, path.join(pasta, nome));
    return `${PREFIXO_URL}/produtos/${ref}/${nome}`;
  } catch (e) {
    await unlink(temporario).catch(() => {});
    throw e;
  }
}

/** Formato pelo conteúdo: MP4/MOV (caixa `ftyp`) ou WebM (EBML com docType "webm"). Devolve a extensão a gravar. */
async function conferirVideo(arquivo: string): Promise<'mp4' | 'webm'> {
  const f = await open(arquivo, 'r');
  try {
    const { size } = await f.stat();
    const inicio = Buffer.alloc(64);
    await f.read(inicio, 0, 64, 0);
    if (inicio.readUInt32BE(0) === 0x1a45dfa3) {
      if (!inicio.includes('webm')) throw new ArquivoInvalido('Use vídeo MP4, MOV ou WebM.');
      return 'webm';
    }
    if (inicio.toString('latin1', 4, 8) !== 'ftyp') throw new ArquivoInvalido('O arquivo não é um vídeo válido. Use MP4, MOV ou WebM.');
    // Percorre as caixas do topo até o `moov` (que pode estar no fim) e procura o codec do vídeo dentro dele.
    let pos = 0;
    const cab = Buffer.alloc(16);
    while (pos + 8 <= size) {
      await f.read(cab, 0, 16, pos);
      let tam = cab.readUInt32BE(0);
      let cabecalho = 8;
      if (tam === 1) { tam = Number(cab.readBigUInt64BE(8)); cabecalho = 16; } else if (tam === 0) tam = size - pos;
      if (tam < cabecalho) break;
      if (cab.toString('latin1', 4, 8) === 'moov') {
        if (pos + tam > size) break; // cortado no meio
        const moov = Buffer.alloc(Math.min(tam, 64 * 1024 * 1024));
        await f.read(moov, 0, moov.length, pos);
        if (moov.includes('hvc1') || moov.includes('hev1'))
          throw new ArquivoInvalido('Vídeo em HEVC (padrão do iPhone) não toca em Android nem Windows. No iPhone, use Ajustes > Câmera > Formatos > Mais Compatível, ou exporte em H.264.');
        if (!['avc1', 'avc3', 'av01', 'vp09'].some(c => moov.includes(c))) throw new ArquivoInvalido('Codec de vídeo não aceito. Use MP4 com H.264.');
        return 'mp4';
      }
      pos += tam;
    }
    throw new ArquivoInvalido('O vídeo está incompleto (sem índice). Exporte de novo e tente outra vez.');
  } finally {
    await f.close();
  }
}

export type TipoMarca = 'logo' | 'logoClara' | 'favicon';

/**
 * Logo ou favicon da identidade visual (D-25). Aceita também SVG, que o sharp transforma em imagem (nenhum SVG é
 * servido como veio). Logos: WebP com transparência, até 1200 px. Favicon: PNG quadrado de 512 px, com a imagem
 * centralizada. Nome novo a cada envio: o cache dos navegadores nunca mostra a antiga.
 */
export async function salvarArquivoMarca(tipo: TipoMarca, dados: Buffer): Promise<{ url: string; largura: number; altura: number }> {
  if (dados.length > TAMANHO_MAXIMO) throw new ArquivoInvalido('Arquivo acima de 8 MB.');
  let formato: string | undefined;
  try {
    formato = (await sharp(dados).metadata()).format;
  } catch {
    throw new ArquivoInvalido('O arquivo não é uma imagem válida.');
  }
  if (!formato || !(FORMATOS_ACEITOS.has(formato) || formato === 'svg')) throw new ArquivoInvalido('Use PNG, SVG, WebP ou JPG.');
  const base = sharp(dados, { density: 300 }).rotate();
  const saida = tipo === 'favicon'
    ? await base.resize({ width: 512, height: 512, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer({ resolveWithObject: true })
    : await base.resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 90, alphaQuality: 100 }).toBuffer({ resolveWithObject: true });
  const nome = `${tipo}-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}.${tipo === 'favicon' ? 'png' : 'webp'}`;
  const pasta = path.join(DIR_ARQUIVOS, 'marca');
  await mkdir(pasta, { recursive: true });
  const temporario = path.join(pasta, `.${nome}.tmp`);
  await writeFile(temporario, saida.data);
  await rename(temporario, path.join(pasta, nome));
  return { url: `${PREFIXO_URL}/marca/${nome}`, largura: saida.info.width, altura: saida.info.height };
}
