'use server';

import { readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { revalidatePath } from 'next/cache';
import { ArquivoInvalido, DIR_ARQUIVOS, salvarImagemPagina } from '../arquivos';
import { lerConfig, salvarConfig } from '../config';
import { exigirPapel } from '../permissoes';
import { IMAGENS_INICIO, linkValido, normalizarConteudo, SECOES_INICIO, type ConteudoInicio } from '@/lib/conteudo-inicio';

/** O limite das Server Actions é 2 MB (next.config.ts); o editor reduz a foto no navegador antes de enviar. */
const LIMITE = 1.9 * 1024 * 1024;
const URL_FOTO = /^\/arquivos\/paginas\/inicio-[\w.-]+\.webp$/;

/** Envia uma foto para a página inicial. Ela só passa a valer quando o gestor salva a página. */
export async function enviarImagemInicio(fd: FormData): Promise<{ ok: true; url: string } | { ok: false; erro: string }> {
  await exigirPapel(['gestor']);
  const arquivo = fd.get('arquivo');
  if (!(arquivo instanceof File) || !arquivo.size) return { ok: false, erro: 'Escolha uma foto.' };
  if (arquivo.size > LIMITE) return { ok: false, erro: 'A foto passa de 2 MB. Use uma foto menor.' };
  try {
    return { ok: true, url: await salvarImagemPagina('inicio', Buffer.from(await arquivo.arrayBuffer())) };
  } catch (e) {
    if (e instanceof ArquivoInvalido) return { ok: false, erro: e.message };
    throw e;
  }
}

/** Grava o conteúdo da página inicial (só o gestor) e apaga as fotos que deixaram de ser usadas. */
export async function salvarInicio(c: ConteudoInicio): Promise<{ ok: true; conteudo: ConteudoInicio } | { ok: false; erro: string }> {
  await exigirPapel(['gestor']);
  if (!c || typeof c !== 'object' || typeof c.textos !== 'object' || typeof c.imagens !== 'object' || !Array.isArray(c.ocultas))
    return { ok: false, erro: 'Conteúdo inválido.' };
  const textos = Object.fromEntries(Object.entries(c.textos).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  const imagens: Record<string, string> = {};
  for (const campo of Object.keys(IMAGENS_INICIO)) {
    const url = c.imagens[campo];
    if (!url) continue;
    if (typeof url !== 'string' || !URL_FOTO.test(url)) return { ok: false, erro: 'Foto inválida.' };
    imagens[campo] = url;
  }
  const links = c.links && typeof c.links === 'object' ? c.links : {};
  if (Object.values(links).some(v => typeof v !== 'string' || !linkValido(v))) return { ok: false, erro: 'Link inválido.' };
  const ocultas = c.ocultas.filter((s): s is string => typeof s === 'string' && s in SECOES_INICIO);
  const conteudo = normalizarConteudo({ textos, imagens, links, ocultas });
  await salvarConfig({ inicio: conteudo });
  await limparFotos(new Set(Object.values(conteudo.imagens)));
  revalidatePath('/');
  return { ok: true, conteudo };
}

/** Fotos da página inicial que não estão em uso e têm mais de um dia (enviadas e não salvas, ou trocadas). */
async function limparFotos(emUso: Set<string>) {
  const pasta = path.join(DIR_ARQUIVOS, 'paginas');
  const nomes = await readdir(pasta).catch(() => [] as string[]);
  const limite = Date.now() - 24 * 60 * 60 * 1000;
  await Promise.all(nomes.filter(n => n.startsWith('inicio-') && !emUso.has(`/arquivos/paginas/${n}`)).map(async n => {
    const alvo = path.join(pasta, n);
    const info = await stat(alvo).catch(() => null);
    if (info && info.mtimeMs < limite) await unlink(alvo).catch(() => {});
  }));
}

/** Conteúdo salvo agora (para o editor recomeçar do que está no ar). */
export async function conteudoSalvoInicio() {
  await exigirPapel(['gestor']);
  return (await lerConfig()).inicio;
}
