import 'server-only';
import { cache } from 'react';
import { db } from '../db';
import type { Usuario } from '../permissoes';
import { exigirGestor } from './acesso';

/** Vendedores ativos (id e nome): cadastro de cliente, convite, configurações. */
export const vendedoresAtivos = cache(() =>
  db.user.findMany({ where: { papel: 'vendedor', ativo: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
);

/** Vendedores do resumo do painel: todos para o gestor, só o próprio para o vendedor. */
export function vendedoresDoResumo(u: Usuario) {
  return db.user.findMany({
    where: { papel: 'vendedor', ativo: true, ...(u.papel === 'gestor' ? {} : { id: u.id }) },
    select: { id: true, name: true, telefone: true, _count: { select: { clientes: true } } },
    orderBy: { name: 'asc' },
  });
}

export function listarVendedores(u: Usuario) {
  exigirGestor(u);
  return db.user.findMany({
    where: { papel: 'vendedor' },
    select: { id: true, name: true, email: true, telefone: true, ativo: true, _count: { select: { clientes: true } } },
    orderBy: [{ ativo: 'desc' }, { name: 'asc' }],
  });
}

/** Vendedor para edição + os outros ativos (destino da transferência de clientes). */
export async function vendedorParaEdicao(u: Usuario, id: string) {
  exigirGestor(u);
  const vendedor = await db.user.findFirst({
    where: { id, papel: 'vendedor' },
    select: { id: true, name: true, email: true, telefone: true, ativo: true, _count: { select: { clientes: true, pedidos: { where: { status: 'pendente' } } } }, metas: { orderBy: { mes: 'desc' }, take: 12 } },
  });
  if (!vendedor) return null;
  const outros = (await vendedoresAtivos()).filter(o => o.id !== id);
  return { vendedor, outros };
}

/**
 * Perfil do vendedor para o gestor: os números do mês, a carteira de clientes (melhores, nunca compraram, paradas há
 * 90 dias), os pedidos em aberto e as vendas recentes. Cada bloco tem link para a lista completa já filtrada.
 */
export async function perfilDoVendedor(u: Usuario, id: string, intervalo: { gte: Date; lt: Date }) {
  exigirGestor(u);
  const clientes = { vendedorId: id, NOT: { telefone: '' } };
  const [vendasMes, totais, nClientes, comAcesso, abertos, nAbertos, recentes] = await Promise.all([
    db.venda.aggregate({ where: { vendedorId: id, data: intervalo }, _sum: { valor: true }, _count: true }),
    db.venda.groupBy({ by: ['clienteId'], where: { clienteId: { not: null }, cliente: clientes }, _sum: { valor: true }, _max: { data: true } }),
    db.cliente.count({ where: clientes }),
    db.cliente.count({ where: { ...clientes, userId: { not: null } } }),
    db.pedido.findMany({
      where: { vendedorId: id, status: 'pendente' }, orderBy: { criadoEm: 'desc' }, take: 6,
      select: { id: true, codigo: true, tipo: true, nomeCliente: true, clienteId: true, total: true, criadoEm: true },
    }),
    db.pedido.count({ where: { vendedorId: id, status: 'pendente' } }),
    db.venda.findMany({ where: { vendedorId: id }, orderBy: { data: 'desc' }, take: 6, include: { cliente: { select: { id: true, nome: true } }, pedido: { select: { id: true, codigo: true } } } }),
  ]);
  const corte90 = Date.now() - 90 * 86_400_000;
  const melhores = [...totais].sort((a, b) => Number(b._sum.valor ?? 0) - Number(a._sum.valor ?? 0)).slice(0, 8);
  const nomes = new Map((await db.cliente.findMany({ where: { id: { in: melhores.map(m => m.clienteId!) } }, select: { id: true, nome: true, telefone: true } })).map(c => [c.id, c]));
  return {
    vendidoMes: Number(vendasMes._sum.valor ?? 0),
    vendasMes: vendasMes._count,
    clientes: nClientes,
    comAcesso,
    compraram: totais.length,
    nuncaCompraram: Math.max(0, nClientes - totais.length),
    paradas: totais.filter(t => t._max.data && t._max.data.getTime() < corte90).length,
    melhores: melhores.flatMap(m => { const c = nomes.get(m.clienteId!); return c ? [{ ...c, total: Number(m._sum.valor ?? 0), ultima: m._max.data }] : []; }),
    abertos, nAbertos, recentes,
  };
}
