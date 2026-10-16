import 'server-only';
import { intervaloDoMes } from '@/lib/datas';
import { db } from '../db';
import { escopoVendedor, type Usuario } from '../permissoes';

/** Vendas do mês; o gestor pode filtrar por vendedor. */
export function vendasDoMes(u: Usuario, mes: string, vendedorId?: string | null) {
  return db.venda.findMany({
    where: { data: intervaloDoMes(mes), ...escopoVendedor(u), ...(u.papel === 'gestor' && vendedorId ? { vendedorId } : {}) },
    orderBy: { data: 'desc' },
    include: { cliente: { select: { id: true, nome: true } }, pedido: { select: { id: true, codigo: true } }, vendedor: { select: { id: true, name: true } } },
  });
}

export function vendasRecentes(u: Usuario, mes: string, quantas = 8) {
  return db.venda.findMany({
    where: { data: intervaloDoMes(mes), ...escopoVendedor(u) },
    orderBy: { data: 'desc' },
    take: quantas,
    include: { cliente: { select: { id: true, nome: true } }, vendedor: { select: { name: true } } },
  });
}
