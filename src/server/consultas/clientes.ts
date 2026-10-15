import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from '../db';
import { escopoVendedor, podeAcessar, type Usuario } from '../permissoes';
import { vendedoresAtivos } from './equipe';
import { celularValido } from '@/lib/telefone';

/** B-11: ficha anonimizada (cliente que excluiu a conta) fica fora das listas; continua acessível pelos pedidos e vendas. */
const SEM_EXCLUIDOS: Prisma.ClienteWhereInput = { NOT: { telefone: '' } };

export const CLIENTES_POR_PAGINA = 60;

/** Filtros do histórico (docs/21): acessou nos últimos 7 dias, tem sacola aberta, ordem por último acesso. */
export type FiltroClientes = { recentes?: boolean; sacola?: boolean; ordem?: 'nome' | 'acesso' };

/** "Carregar mais": traz `CLIENTES_POR_PAGINA * pagina` clientes, o total do filtro e a soma de vendas de cada um. */
export async function listarClientes(u: Usuario, q: string, pagina = 1, f: FiltroClientes = {}) {
  const where: Prisma.ClienteWhereInput = {
    ...escopoVendedor(u),
    ...SEM_EXCLUIDOS,
    ...(q ? { OR: [{ nome: { contains: q } }, { telefone: { contains: q } }, { cidade: { contains: q } }, { endereco: { contains: q } }, { email: { contains: q } }] } : {}),
    ...(f.recentes ? { ultimoAcessoEm: { gte: new Date(Date.now() - 7 * 86_400_000) } } : {}),
    ...(f.sacola ? { sacola: { isNot: null } } : {}),
  };
  const ordem: Prisma.ClienteOrderByWithRelationInput[] = f.ordem === 'acesso' ? [{ ultimoAcessoEm: { sort: 'desc', nulls: 'last' } }, { nome: 'asc' }] : [{ nome: 'asc' }];
  const [clientes, total] = await Promise.all([
    db.cliente.findMany({ where, include: { vendedor: { select: { name: true } }, sacola: { select: { atualizadoEm: true } } }, orderBy: ordem, take: CLIENTES_POR_PAGINA * pagina }),
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
  return db.cliente.findMany({ where: { ...escopoVendedor(u), ...SEM_EXCLUIDOS }, select: { id: true, nome: true, telefone: true }, orderBy: { nome: 'asc' } });
}

/** Lista de vendedores do formulário de cliente: só o gestor escolhe. */
export async function vendedoresParaFormCliente(u: Usuario) {
  return u.papel === 'gestor' ? vendedoresAtivos() : undefined;
}

/**
 * Sacola: quem recebe o pedido da cliente logada, pela mesma regra do envio (RN-03): o vendedor dela, se ativo e com
 * WhatsApp válido; senão, a loja (`nome` null).
 */
export async function destinoDoPedido(u: Usuario): Promise<{ nome: string | null } | null> {
  if (u.papel !== 'cliente') return null;
  const c = await db.cliente.findUnique({ where: { userId: u.id }, select: { vendedor: { select: { name: true, telefone: true, ativo: true } } } });
  if (!c) return null;
  return { nome: c.vendedor.ativo && celularValido(c.vendedor.telefone) ? c.vendedor.name : null };
}

/** Faixa de resumo de Minha conta (D-22): último pedido, quantos pedidos e favoritos, e quem atende. */
export async function resumoDaConta(u: Usuario) {
  const c = await db.cliente.findUnique({
    where: { userId: u.id },
    select: {
      vendedor: { select: { name: true, telefone: true, ativo: true } },
      pedidos: { orderBy: { criadoEm: 'desc' }, take: 1, select: { codigo: true, tipo: true, status: true, criadoEm: true } },
      _count: { select: { pedidos: true, favoritos: true } },
    },
  });
  if (!c) return null;
  const v = c.vendedor;
  return {
    ultimoPedido: c.pedidos[0] ?? null, pedidos: c._count.pedidos, favoritos: c._count.favoritos,
    atendimento: v.ativo && v.telefone && celularValido(v.telefone) ? { nome: v.name, telefone: v.telefone } : null,
  };
}

/** Favoritos da cliente logada (D-22): ids das peças, do mais recente para o mais antigo. Vazio para equipe e visitante. */
export async function favoritosDoClienteLogado(u: Usuario | null): Promise<number[]> {
  if (u?.papel !== 'cliente') return [];
  const c = await db.cliente.findUnique({ where: { userId: u.id }, select: { favoritos: { select: { produtoId: true }, orderBy: { criadoEm: 'desc' } } } });
  return c?.favoritos.map(f => f.produtoId) ?? [];
}

/** Página do produto: o WhatsApp de quem atende a cliente logada (RN-03), ou null para usar o da loja. */
export async function atendimentoDoCliente(u: Usuario | null): Promise<{ nome: string; telefone: string } | null> {
  if (u?.papel !== 'cliente') return null;
  const c = await db.cliente.findUnique({ where: { userId: u.id }, select: { vendedor: { select: { name: true, telefone: true, ativo: true } } } });
  const v = c?.vendedor;
  return v && v.ativo && v.telefone && celularValido(v.telefone) ? { nome: v.name, telefone: v.telefone } : null;
}

/** CEP salvo na ficha do cliente logado (preenche o condicional, U-02). */
export async function cepDoClienteLogado(u: Usuario) {
  return u.papel === 'cliente' ? ((await db.cliente.findUnique({ where: { userId: u.id }, select: { cep: true } }))?.cep ?? null) : null;
}

/** "Minha conta": a ficha do próprio cliente logado. */
/** Minha conta: dados da ficha e quem atende, sem os pedidos. */
export function dadosDoClienteLogado(u: Usuario) {
  return db.cliente.findUnique({ where: { userId: u.id }, include: { vendedor: { select: { name: true, telefone: true } } } });
}

export function fichaDoClienteLogado(u: Usuario) {
  return db.cliente.findUnique({
    where: { userId: u.id },
    include: {
      vendedor: { select: { name: true, telefone: true } },
      pedidos: { orderBy: { criadoEm: 'desc' }, take: 50, include: { itens: true } },
    },
  });
}
