/**
 * Cache em disco das fotos originais da Hering (L-01). A Hering apaga fotos com o tempo, então cada foto baixada fica
 * guardada aqui, pelo endereço, e a migração para o banco de produção usa o cache em vez da internet.
 * Pasta: FOTOS_CACHE_DIR ou ../fotos-originais (fora do Git e de armazenamento/, que é do ambiente).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const DIR_CACHE_FOTOS = path.resolve(process.env.FOTOS_CACHE_DIR ?? path.join(__dirname, '..', '..', 'fotos-originais'));

const arquivoDe = (url: string) => path.join(DIR_CACHE_FOTOS, `${createHash('sha1').update(url).digest('hex')}.img`);

export const temNoCache = (url: string) => existsSync(arquivoDe(url));

async function buscar(url: string): Promise<Buffer | number> {
  const r = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'dcerutti-migracao-fotos' } });
  if (!r.ok) return r.status;
  return Buffer.from(await r.arrayBuffer());
}

/**
 * Devolve os bytes da foto (do cache ou baixando) ou o status HTTP da falha.
 * Tenta primeiro a versão grande da Hering (o tamanho está no caminho) e guarda o resultado no cache.
 */
export async function baixarFoto(url: string): Promise<Buffer | number> {
  const arquivo = arquivoDe(url);
  if (existsSync(arquivo)) return readFile(arquivo);
  const grande = url.replace('-600-800/', '-1200-1600/');
  let dados = grande !== url ? await buscar(grande) : 404;
  if (typeof dados === 'number') dados = await buscar(url);
  if (typeof dados !== 'number') {
    mkdirSync(DIR_CACHE_FOTOS, { recursive: true });
    await writeFile(arquivo, dados);
  }
  return dados;
}
