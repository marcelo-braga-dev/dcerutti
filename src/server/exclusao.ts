// Sem 'server-only' de propósito: também é usado por scripts de verificação, que rodam fora do Next.
import { rmdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { caminhoDoArquivo, PREFIXO_URL } from './arquivos';

/**
 * Apaga do disco as fotos (/arquivos/...) que nenhum produto nem pedido usa mais. O banco apaga as linhas em cascata,
 * mas não os arquivos: quem remove fotos chama isto depois do commit. Remove também a pasta do produto se ficar vazia.
 */
export async function removerArquivosSemUso(db: PrismaClient, urls: string[]) {
  const locais = [...new Set(urls.filter(u => u.startsWith(`${PREFIXO_URL}/`)))];
  if (!locais.length) return 0;
  const [emProdutos, emPedidos] = await Promise.all([
    db.produtoImagem.findMany({ where: { url: { in: locais } }, select: { url: true } }),
    db.pedidoItem.findMany({ where: { imagem: { in: locais } }, select: { imagem: true } }),
  ]);
  const emUso = new Set([...emProdutos.map(i => i.url), ...emPedidos.map(i => i.imagem)]);
  let removidos = 0;
  for (const url of locais) {
    if (emUso.has(url)) continue;
    const alvo = caminhoDoArquivo(url.slice(PREFIXO_URL.length + 1).split('/'));
    if (!alvo) continue;
    await unlink(alvo).then(() => removidos++, () => {});
    await rmdir(path.dirname(alvo)).catch(() => {}); // só sai se estiver vazia
  }
  return removidos;
}

export type ResultadoExclusao = { ok: true; referencia: string; arquivos: number } | { ok: false; erro: string };

/**
 * Exclui o produto e tudo que depende dele: fotos (linhas e arquivos), tamanhos, custo e histórico de estoque.
 * Produto que já entrou em pedido não é excluído (o histórico de vendas aponta para ele): desative no catálogo.
 */
export async function excluirProdutoDefinitivo(db: PrismaClient, produtoId: number): Promise<ResultadoExclusao> {
  const produto = await db.produto.findUnique({ where: { id: produtoId }, select: { referencia: true, imagens: { select: { url: true } } } });
  if (!produto) return { ok: false, erro: 'Produto não encontrado.' };
  const emPedidos = await db.pedidoItem.count({ where: { OR: [{ produtoId }, { variante: { produtoId } }] } });
  if (emPedidos) return { ok: false, erro: `Este produto aparece em ${emPedidos} item(ns) de pedido e não pode ser excluído. Desmarque "Ativo no catálogo" para escondê-lo.` };
  // Cascata no banco: produto_imagem, variante (e movimento_estoque), custo.
  await db.produto.delete({ where: { id: produtoId } });
  const arquivos = await removerArquivosSemUso(db, produto.imagens.map(i => i.url));
  return { ok: true, referencia: produto.referencia, arquivos };
}

