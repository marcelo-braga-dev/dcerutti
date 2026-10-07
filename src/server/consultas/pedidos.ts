import 'server-only';
import type { Prisma, StatusPedido } from '@prisma/client';
import { db } from '../db';
import { escopoVendedor, podeAcessar, type Usuario } from '../permissoes';

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
      include: { vendedor: { select: { name: true } }, itens: { select: { id: true, imagem: true, nome: true, quantidade: true, situacao: true, precoUnitario: true } } },
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
    include: { itens: { orderBy: { id: 'asc' } }, cliente: { select: { id: true, nome: true, endereco: true, cidade: true } }, venda: true, vendedor: { select: { name: true } } },
  });
  if (!pedido || !podeAcessar(u, pedido)) return null;
  // Q-07: produto desativado não tem página na loja; o link do item vai para a edição (gestor) ou não existe.
  const ativos = new Set((await db.produto.findMany({ where: { id: { in: pedido.itens.map(i => i.produtoId) }, ativo: true }, select: { id: true } })).map(p => p.id));
  return { ...pedido, produtosAtivos: ativos };
}
