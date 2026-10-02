import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from '../db';
import type { Usuario } from '../permissoes';
import { exigirGestor } from './acesso';

export type FiltroProdutos = '' | 'sem-foto' | 'sem-custo' | 'esgotados' | 'inativos';

/** Lista de produtos do gestor (com custo). "Carregar mais" traz `porPagina * pagina` itens. */
export async function listarProdutos(u: Usuario, f: { q: string; filtro: string; pagina: number; porPagina: number }) {
  exigirGestor(u);
  const where: Prisma.ProdutoWhereInput = {
    ...(f.q ? { OR: [{ nome: { contains: f.q } }, { referencia: { contains: f.q } }, { variantes: { some: { codigoInterno: f.q } } }] } : {}),
    ...(f.filtro === 'sem-foto' ? { imagens: { none: {} } } : {}),
    ...(f.filtro === 'sem-custo' ? { custo: { is: null } } : {}),
    ...(f.filtro === 'esgotados' ? { variantes: { none: { estoque: { gt: 0 } } } } : {}),
    ...(f.filtro === 'inativos' ? { ativo: false } : {}),
  };
  const [total, produtos] = await Promise.all([
    db.produto.count({ where }),
    db.produto.findMany({
      where, orderBy: [{ ativo: 'desc' }, { nome: 'asc' }], take: f.porPagina * f.pagina,
      include: { marca: true, categoria: true, custo: true, imagens: { take: 1, orderBy: { ordem: 'asc' } }, variantes: true },
    }),
  ]);
  return { total, produtos };
}

export async function marcasECategorias(u: Usuario) {
  exigirGestor(u);
  const [marcas, categorias] = await Promise.all([db.marca.findMany({ orderBy: { nome: 'asc' } }), db.categoria.findMany({ orderBy: { nome: 'asc' } })]);
  return { marcas, categorias };
}

/** Produto para edição, com tamanhos, histórico de estoque (30 últimos) e quem movimentou. */
export async function produtoParaEdicao(u: Usuario, id: number) {
  exigirGestor(u);
  const [produto, listas] = await Promise.all([
    db.produto.findUnique({ where: { id }, include: { imagens: { orderBy: { ordem: 'asc' } }, custo: true, variantes: { include: { _count: { select: { itens: true } } } } } }),
    marcasECategorias(u),
  ]);
  if (!produto) return null;
  const movimentos = await db.movimentoEstoque.findMany({
    where: { varianteId: { in: produto.variantes.map(v => v.id) } }, orderBy: { criadoEm: 'desc' }, take: 30,
    include: { usuario: { select: { name: true } } },
  });
  return { produto, ...listas, movimentos };
}
