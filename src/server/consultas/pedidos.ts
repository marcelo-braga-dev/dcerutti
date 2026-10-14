import 'server-only';
import type { Prisma, StatusPedido } from '@prisma/client';
import { db } from '../db';
import { escopoVendedor, podeAcessar, type Usuario } from '../permissoes';
import { catalogo } from '../catalogo';
import { COM_ALVOS } from './cupons';
import type { VarianteCatalogo } from '@/lib/catalogo';

export function contarPendentes(u: Usuario) {
  return db.pedido.count({ where: { status: 'pendente', ...escopoVendedor(u) } });
}

export const PEDIDOS_POR_PAGINA = 50;

/** "Carregar mais": traz `PEDIDOS_POR_PAGINA * pagina` pedidos e o total do filtro. */
export async function listarPedidos(u: Usuario, f: { status: StatusPedido | 'todos'; q: string; pagina: number }) {
  const where: Prisma.PedidoWhereInput = {
    ...escopoVendedor(u),
    ...(f.status === 'todos' ? {} : { status: f.status }),
    ...(f.q ? { OR: [{ codigo: { contains: f.q } }, { nomeCliente: { contains: f.q } }] } : {}),
  };
  const [pedidos, contagens, total] = await Promise.all([
    db.pedido.findMany({
      where, orderBy: { criadoEm: 'desc' }, take: PEDIDOS_POR_PAGINA * f.pagina,
      include: { vendedor: { select: { name: true } }, itens: { select: { id: true, imagem: true, nome: true, quantidade: true, situacao: true, precoUnitario: true, descontoCupom: true } } },
    }),
    db.pedido.groupBy({ by: ['status'], where: escopoVendedor(u), _count: true }),
    db.pedido.count({ where }),
  ]);
  return { pedidos, contagens, total };
}

/** Pedido com itens, cliente e venda, ou null se não existe ou não é do vendedor. */
export async function pedidoParaEquipe(u: Usuario, id: string) {
  const pedido = await db.pedido.findUnique({
    where: { id },
    include: {
      itens: { orderBy: { id: 'asc' } }, cliente: { select: { id: true, nome: true, endereco: true, cidade: true } }, venda: true, vendedor: { select: { name: true } },
      historico: { orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }] }, // mais recente primeiro
      cupom: { select: { tipo: true, valor: true, tetoDesconto: true, descricao: true } },
    },
  });
  if (!pedido || !podeAcessar(u, pedido)) return null;
  // Fase 4 dos cupons: o cupom de próxima compra que esta venda gerou, se houver.
  const cupomGerado = await db.cupom.findFirst({ where: { pedidoOrigemId: id }, include: COM_ALVOS });
  // Q-07: produto desativado não tem página na loja; o link do item vai para a edição (gestor) ou não existe.
  const ativos = new Set((await db.produto.findMany({ where: { id: { in: pedido.itens.map(i => i.produtoId) }, ativo: true }, select: { id: true } })).map(p => p.id));
  return { ...pedido, produtosAtivos: ativos, cupomGerado };
}

export type CorDoModelo = { id: number; referencia: string; nome: string; cor: string | null; preco: number; imagem: string | null; variantes: VarianteCatalogo[] };

/**
 * Cores do mesmo modelo de cada produto, para trocar no pedido. Cada cor é um produto; na Hering, o modelo são os
 * 4 primeiros caracteres da referência (mesma marca). Inclui tamanhos sem estoque: o servidor confere ao salvar.
 */
export async function coresDosModelos(produtoIds: number[]): Promise<Record<number, CorDoModelo[]>> {
  const todos = await catalogo();
  const r: Record<number, CorDoModelo[]> = {};
  for (const id of new Set(produtoIds)) {
    const base = todos.find(p => p.id === id);
    if (!base) { r[id] = []; continue; }
    const modelo = base.referencia.slice(0, 4).toUpperCase();
    const mesmos = base.referencia.length >= 6 ? todos.filter(p => p.marca === base.marca && p.referencia.toUpperCase().startsWith(modelo)) : [base];
    r[id] = mesmos
      .sort((a, b) => Number(b.id === id) - Number(a.id === id))
      .slice(0, 24)
      .map(p => ({ id: p.id, referencia: p.referencia, nome: p.nome, cor: p.cor, preco: p.preco, imagem: p.imagens[0] ?? null, variantes: p.variantes }));
  }
  return r;
}
