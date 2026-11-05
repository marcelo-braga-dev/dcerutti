import 'server-only';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DIR_ARQUIVOS } from './arquivos';

/** Planilhas de estoque enviadas ficam em armazenamento/importacoes/ (fora do /arquivos: .xlsx não é servido). */
const PASTA = path.join(DIR_ARQUIVOS, 'importacoes');
export const TAMANHO_MAXIMO_PLANILHA = 20 * 1024 * 1024;
const NOME = /^[\w-]+\.xlsx$/;

export async function guardarPlanilha(dados: Buffer): Promise<string> {
  await mkdir(PASTA, { recursive: true });
  const nome = `estoque-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}-${randomBytes(3).toString('hex')}.xlsx`;
  const temporario = path.join(PASTA, `.${nome}.tmp`);
  await writeFile(temporario, dados);
  await rename(temporario, path.join(PASTA, nome));
  return nome;
}

/** Lê uma planilha já enviada; null se o nome não for de uma planilha guardada. */
export async function lerPlanilhaGuardada(nome: string): Promise<Buffer | null> {
  if (!NOME.test(nome)) return null;
  return readFile(path.join(PASTA, nome)).catch(() => null);
}
