import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from '../db';
import { escopoVendedor, podeAcessar, type Usuario } from '../permissoes';
import { vendedoresAtivos } from './equipe';

export const CLIENTES_POR_PAGINA = 60;

/** "Carregar mais": traz `CLIENTES_POR_PAGINA * pagina` clientes, o total do filtro e a soma de vendas de cada um. */
export async function listarClientes(u: Usuario, q: string, pagina = 1) {
  const where: Prisma.ClienteWhereInput = {
    ...escopoVendedor(u),
    ...(q ? { OR: [{ nome: { contains: q } }, { telefone: { contains: q } }, { cidade: { contains: q } }, { endereco: { contains: q } }, { email: { contains: q } }] } : {}),
  };
  const [clientes, total] = await Promise.all([
    db.cliente.findMany({ where, include: { vendedor: { select: { name: true } } }, orderBy: { nome: 'asc' }, take: CLIENTES_POR_PAGINA * pagina }),
    db.cliente.count({ where }),
  ]);
  const vendas = await db.venda.groupBy({ by: ['clienteId'], where: { clienteId: { in: clientes.map(c => c.id) } }, _sum: { valor: true }, _max: { data: true } });
  return { clientes, total, vendasPorCliente: new Map(vendas.map(v => [v.clienteId, v])) };
}

/** Ficha do cliente para a equipe, ou null se não existe ou é de outro vendedor. */
export async function fichaCliente(u: Usuario, id: string) {
  const cliente = await db.cliente.findUnique({
    where: { id },
    include: { pedidos: { orderBy: { criadoEm: 'desc' }, take: 20 }, vendas: { orderBy: { data: 'desc' }, take: 20 } },
  });
  if (!cliente || !podeAcessar(u, cliente)) return null;
  const [soma, vendedores] = await Promise.all([
    db.venda.aggregate({ where: { clienteId: cliente.id }, _sum: { valor: true } }),
    u.papel === 'gestor'
      ? db.user.findMany({ where: { papel: 'vendedor', OR: [{ ativo: true }, { id: cliente.vendedorId }] }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
      : undefined,
  ]);
  return { cliente, totalComprado: Number(soma._sum.valor ?? 0), vendedores };
}

/** Clientes que o usuário pode atender (seleção de peças). */
export function clientesParaSelecao(u: Usuario) {
  return db.cliente.findMany({ where: escopoVendedor(u), select: { id: true, nome: true, telefone: true }, orderBy: { nome: 'asc' } });
}

/** Lista de vendedores do formulário de cliente: só o gestor escolhe. */
export async function vendedoresParaFormCliente(u: Usuario) {
  return u.papel === 'gestor' ? vendedoresAtivos() : undefined;
}

/** "Minha conta": a ficha do próprio cliente logado. */
export function fichaDoClienteLogado(u: Usuario) {
  return db.cliente.findUnique({
    where: { userId: u.id },
    include: {
      vendedor: { select: { name: true, telefone: true } },
      pedidos: { orderBy: { criadoEm: 'desc' }, take: 50, include: { itens: true } },
    },
  });
}
