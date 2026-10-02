import 'server-only';
import { intervaloDoMes } from '@/lib/datas';
import { db } from '../db';
import { escopoVendedor, type Usuario } from '../permissoes';

export function vendasDoMes(u: Usuario, mes: string) {
  return db.venda.findMany({
    where: { data: intervaloDoMes(mes), ...escopoVendedor(u) },
    orderBy: { data: 'desc' },
    include: { cliente: { select: { id: true, nome: true } }, pedido: { select: { id: true, codigo: true } }, vendedor: { select: { name: true } } },
  });
}

export function vendasRecentes(u: Usuario, mes: string, quantas = 8) {
  return db.venda.findMany({
    where: { data: intervaloDoMes(mes), ...escopoVendedor(u) },
    orderBy: { data: 'desc' },
    take: quantas,
    include: { cliente: { select: { nome: true } } },
  });
}
