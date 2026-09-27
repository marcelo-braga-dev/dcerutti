'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '../db';
import { invalidarCatalogo } from '../catalogo';
import { exigirPapel } from '../permissoes';
import { posicaoTamanho } from '@/lib/catalogo';
import { lerValor } from '@/lib/dinheiro';
import { errosDoZod, falha, type EstadoForm } from '@/lib/formulario';

const slug = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const preco = (msg: string) => z.string().transform(lerValor).refine(v => v > 0 && v < 100_000, msg);
const linhas = (t: string) => t.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

const esquemaProduto = z.object({
  id: z.coerce.number().int().optional(),
  referencia: z.string().trim().toUpperCase().min(2, 'Informe a referência.').max(20),
  nome: z.string().trim().min(3, 'Informe o nome.').max(160),
  marcaId: z.coerce.number().int().positive('Escolha a marca.'),
  categoriaId: z.string(),
  novaCategoria: z.string().trim().max(60).optional(),
  subcategoria: z.string().trim().max(60).optional(),
  genero: z.enum(['feminino', 'masculino', 'unissex'], 'Escolha o gênero.'),
  estacao: z.enum(['', 'inverno', 'verao']).optional(),
  cor: z.string().trim().max(60).optional(),
  preco: preco('Informe o preço de venda.'),
  precoCheio: z.string().optional(),
  custo: z.string().optional(),
  descricao: z.string().trim().max(4000).optional(),
  composicao: z.string().trim().max(500).optional(),
  destaques: z.string().optional(),
  imagens: z.string().optional(),
});

export async function salvarProduto(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirPapel(['gestor']);
  const r = esquemaProduto.safeParse(Object.fromEntries(fd));
  if (!r.success) return falha(fd, errosDoZod(r.error));
  const d = r.data;

  const precoCheio = d.precoCheio?.trim() ? lerValor(d.precoCheio) : d.preco;
  if (!(precoCheio >= d.preco)) return falha(fd, { precoCheio: 'O preço cheio deve ser maior ou igual ao preço de venda.' });
  const custo = d.custo?.trim() ? lerValor(d.custo) : null;
  if (custo != null && !(custo >= 0)) return falha(fd, { custo: 'Custo inválido.' });
  const imagens = linhas(d.imagens ?? '');
  if (imagens.some(u => !/^https:\/\/\S+$/.test(u))) return falha(fd, { imagens: 'Cada linha deve ser um endereço https:// de imagem.' });

  const repetida = await db.produto.findUnique({ where: { referencia: d.referencia }, select: { id: true } });
  if (repetida && repetida.id !== d.id) return falha(fd, { referencia: 'Já existe um produto com esta referência.' });

  let categoriaId = Number(d.categoriaId);
  if (d.categoriaId === 'nova') {
    if (!d.novaCategoria) return falha(fd, { novaCategoria: 'Informe o nome da nova categoria.' });
    categoriaId = (await db.categoria.upsert({ where: { slug: slug(d.novaCategoria) }, create: { nome: d.novaCategoria, slug: slug(d.novaCategoria) }, update: {} })).id;
  } else if (!(categoriaId > 0)) return falha(fd, { categoriaId: 'Escolha a categoria.' });

  const dados = {
    referencia: d.referencia, nome: d.nome, marcaId: d.marcaId, categoriaId, subcategoria: d.subcategoria || null, genero: d.genero,
    estacao: d.estacao || null, cor: d.cor || null, preco: d.preco, precoCheio, descricao: d.descricao || null,
    composicao: d.composicao || null, destaques: linhas(d.destaques ?? ''),
    imperdivel: fd.get('imperdivel') === 'on', ativo: fd.get('ativo') === 'on',
  };
  const id = await db.$transaction(async tx => {
    const p = d.id ? await tx.produto.update({ where: { id: d.id }, data: dados }) : await tx.produto.create({ data: dados });
    await tx.produtoImagem.deleteMany({ where: { produtoId: p.id } });
    if (imagens.length) await tx.produtoImagem.createMany({ data: imagens.map((url, ordem) => ({ produtoId: p.id, url, ordem })) });
    if (custo == null) await tx.custo.deleteMany({ where: { produtoId: p.id } });
    else await tx.custo.upsert({ where: { produtoId: p.id }, create: { produtoId: p.id, valor: custo }, update: { valor: custo } });
    return p.id;
  });
  invalidarCatalogo();
  revalidatePath('/painel/produtos');
  if (!d.id) redirect(`/painel/produtos/${id}`);
  return { ok: true, mensagem: 'Produto salvo.' };
}

const esquemaVariante = z.object({
  produtoId: z.coerce.number().int(),
  tamanho: z.string().trim().toUpperCase().min(1, 'Informe o tamanho.').max(5),
  codigoInterno: z.string().trim().max(20).optional(),
  ean: z.string().trim().regex(/^\d{0,14}$/, 'EAN só com números.').optional(),
  estoque: z.coerce.number().int().min(0, 'Estoque inválido.').max(10_000),
});

export async function adicionarVariante(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const u = await exigirPapel(['gestor']);
  const r = esquemaVariante.safeParse(Object.fromEntries(fd));
  if (!r.success) return falha(fd, errosDoZod(r.error));
  const d = r.data;
  if (await db.variante.findUnique({ where: { produtoId_tamanho: { produtoId: d.produtoId, tamanho: d.tamanho } } }))
    return falha(fd, { tamanho: 'Este tamanho já existe no produto.' });
  if (d.codigoInterno && (await db.variante.findUnique({ where: { codigoInterno: d.codigoInterno } })))
    return falha(fd, { codigoInterno: 'Código interno já usado em outra peça.' });
  await db.$transaction(async tx => {
    const v = await tx.variante.create({
      data: { produtoId: d.produtoId, tamanho: d.tamanho, codigoInterno: d.codigoInterno || null, ean: d.ean || null, estoque: d.estoque, ordem: posicaoTamanho(d.tamanho) },
    });
    if (d.estoque) await tx.movimentoEstoque.create({ data: { varianteId: v.id, delta: d.estoque, motivo: 'entrada', usuarioId: u.id, observacao: 'Estoque inicial' } });
  });
  invalidarCatalogo();
  revalidatePath(`/painel/produtos/${d.produtoId}`);
  return { ok: true, mensagem: `Tamanho ${d.tamanho} adicionado.` };
}

const esquemaAjuste = z.object({
  varianteId: z.coerce.number().int().positive('Escolha o tamanho.'),
  tipo: z.enum(['entrada', 'ajuste']),
  quantidade: z.coerce.number().int('Use números inteiros.').min(0, 'Quantidade inválida.').max(10_000),
  observacao: z.string().trim().max(120).optional(),
});

/** Entrada soma ao estoque; ajuste define a quantidade contada. Tudo fica no histórico (movimento_estoque). */
export async function ajustarEstoque(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const u = await exigirPapel(['gestor']);
  const r = esquemaAjuste.safeParse(Object.fromEntries(fd));
  if (!r.success) return falha(fd, errosDoZod(r.error));
  const d = r.data;
  if (d.tipo === 'entrada' && d.quantidade === 0) return falha(fd, { quantidade: 'Informe quantas peças entraram.' });
  const produtoId = await db.$transaction(async tx => {
    const v = await tx.variante.findUniqueOrThrow({ where: { id: d.varianteId } });
    const novo = d.tipo === 'entrada' ? v.estoque + d.quantidade : d.quantidade;
    if (novo < v.reservado) throw new Error(`Há ${v.reservado} peça(s) reservadas em condicionais; o estoque não pode ficar abaixo disso.`);
    const delta = novo - v.estoque;
    if (delta !== 0) {
      await tx.variante.update({ where: { id: v.id }, data: { estoque: novo } });
      await tx.movimentoEstoque.create({ data: { varianteId: v.id, delta, motivo: d.tipo, usuarioId: u.id, observacao: d.observacao || null } });
    }
    return v.produtoId;
  }).catch((e: Error) => e);
  if (produtoId instanceof Error) return falha(fd, {}, produtoId.message);
  invalidarCatalogo();
  revalidatePath(`/painel/produtos/${produtoId}`);
  return { ok: true, mensagem: 'Estoque atualizado.' };
}

export async function removerVariante(varianteId: number) {
  await exigirPapel(['gestor']);
  const v = await db.variante.findUnique({ where: { id: varianteId }, include: { _count: { select: { itens: true } } } });
  if (!v || v._count.itens > 0 || v.reservado > 0) return; // com histórico de pedidos não se apaga: zere o estoque
  await db.variante.delete({ where: { id: varianteId } });
  invalidarCatalogo();
  revalidatePath(`/painel/produtos/${v.produtoId}`);
}
