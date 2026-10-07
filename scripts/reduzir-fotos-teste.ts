/**
 * SÓ PARA AMBIENTE DE TESTE: troca as fotos do catálogo por um conjunto pequeno de fotos repetidas.
 * Cada grupo categoria + gênero fica com até 3 fotos; todo produto (inclusive os sem foto) recebe 2 delas.
 * Pedidos passam a apontar para a primeira foto do produto; arquivos que ninguém usa mais são apagados do disco.
 *   npm run fotos:reduzir-teste -- --confirmar
 */
import 'dotenv/config';
import { readdir, rmdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { DIR_ARQUIVOS, PREFIXO_URL } from '../src/server/arquivos';

const POR_GRUPO = 3;
const POR_PRODUTO = 2;
const db = new PrismaClient();

async function arquivosEm(dir: string): Promise<string[]> {
  const itens = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const listas = await Promise.all(itens.map(i => (i.isDirectory() ? arquivosEm(path.join(dir, i.name)) : [path.join(dir, i.name)])));
  return listas.flat();
}

async function main() {
  if (!process.argv.includes('--confirmar')) throw new Error('Este script apaga fotos. Rode com --confirmar, e só em ambiente de teste.');

  const produtos = await db.produto.findMany({
    orderBy: { id: 'asc' },
    select: { id: true, genero: true, categoriaId: true, imagens: { select: { url: true }, orderBy: { ordem: 'asc' }, take: 1 } },
  });

  // Conjunto de fotos por grupo: a primeira foto de produtos diferentes, até POR_GRUPO.
  const grupos = new Map<string, string[]>();
  const porCategoria = new Map<number, string[]>();
  const geral: string[] = [];
  const guardar = (m: Map<string | number, string[]>, k: string | number, url: string) => {
    const l = m.get(k) ?? [];
    if (l.length < POR_GRUPO && !l.includes(url)) l.push(url);
    m.set(k, l);
  };
  for (const p of produtos) {
    const url = p.imagens[0]?.url;
    if (!url?.startsWith(`${PREFIXO_URL}/`)) continue;
    guardar(grupos as Map<string | number, string[]>, `${p.categoriaId}|${p.genero}`, url);
    guardar(porCategoria as Map<string | number, string[]>, p.categoriaId, url);
    if (geral.length < POR_GRUPO) geral.push(url);
  }
  if (!geral.length) throw new Error('Nenhuma foto local para reaproveitar.');

  const contador = new Map<string, number>();
  let linhas = 0;
  for (const p of produtos) {
    const chave = `${p.categoriaId}|${p.genero}`;
    const pool = grupos.get(chave) ?? porCategoria.get(p.categoriaId) ?? geral;
    const i = contador.get(chave) ?? 0;
    contador.set(chave, i + 1);
    const fotos = [...new Set(Array.from({ length: Math.min(POR_PRODUTO, pool.length) }, (_, k) => pool[(i + k) % pool.length]))];
    await db.$transaction([
      db.produtoImagem.deleteMany({ where: { produtoId: p.id } }),
      db.produtoImagem.createMany({ data: fotos.map((url, ordem) => ({ produtoId: p.id, url, ordem })) }),
      db.pedidoItem.updateMany({ where: { produtoId: p.id }, data: { imagem: fotos[0] } }),
    ]);
    linhas += fotos.length;
  }

  // Apaga do disco o que nenhum produto nem pedido usa mais.
  const usados = new Set([
    ...(await db.produtoImagem.findMany({ select: { url: true } })).map(i => i.url),
    ...(await db.pedidoItem.findMany({ where: { imagem: { not: null } }, select: { imagem: true } })).map(i => i.imagem!),
  ]);
  const pastaProdutos = path.join(DIR_ARQUIVOS, 'produtos');
  let apagados = 0;
  for (const arq of await arquivosEm(pastaProdutos)) {
    const url = `${PREFIXO_URL}/${path.relative(DIR_ARQUIVOS, arq).split(path.sep).join('/')}`;
    if (!usados.has(url)) { await unlink(arq); apagados++; }
  }
  for (const pasta of await readdir(pastaProdutos).catch(() => [])) await rmdir(path.join(pastaProdutos, pasta)).catch(() => {});
  const restantes = await arquivosEm(pastaProdutos);
  const bytes = (await Promise.all(restantes.map(a => stat(a)))).reduce((s, x) => s + x.size, 0);

  console.log(`${produtos.length} produtos, ${linhas} fotos no banco, ${usados.size} arquivos distintos em uso.`);
  console.log(`Apagados do disco: ${apagados}. Restam ${restantes.length} arquivos (${(bytes / 1024 / 1024).toFixed(1)} MB).`);
  console.log('Reinicie o app (pm2 reload dcerutti) para o catálogo em memória pegar as novas fotos.');
}

main().catch(e => { console.error(e.message ?? e); process.exitCode = 1; }).finally(() => db.$disconnect());
