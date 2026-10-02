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
    select: { id: true, name: true, email: true, telefone: true, ativo: true, _count: { select: { clientes: true } }, metas: { orderBy: { mes: 'desc' }, take: 12 } },
  });
  if (!vendedor) return null;
  const outros = (await vendedoresAtivos()).filter(o => o.id !== id);
  return { vendedor, outros };
}
