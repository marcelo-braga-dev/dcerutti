import 'server-only';
import { cache } from 'react';
import { db } from '../db';
import type { Usuario } from '../permissoes';
import { exigirGestor } from './acesso';
import type { Prisma } from '@prisma/client';
import { diaDe, inicioDoDia } from '@/lib/datas';
import { online, resumirEquipe, resumoVazio, type Acao } from '@/lib/equipe';

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

export async function listarVendedores(u: Usuario) {
  exigirGestor(u);
  const lista = await db.user.findMany({
    where: { papel: 'vendedor' },
    select: { id: true, name: true, email: true, telefone: true, ativo: true, ultimoAcessoEm: true, ultimoLoginEm: true, _count: { select: { clientes: true } } },
    orderBy: [{ ativo: 'desc' }, { name: 'asc' }],
  });
  // D-26: "online agora" calculado aqui (a página não lê o relógio ao renderizar).
  const agora = Date.now();
  return lista.map(v => ({ ...v, online: online(v.ultimoAcessoEm, agora) }));
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

export const PERIODOS_EQUIPE = { hoje: 'Hoje', '7d': 'Últimos 7 dias', '30d': 'Últimos 30 dias', mes: 'Este mês' } as const;
export type PeriodoEquipe = keyof typeof PERIODOS_EQUIPE;

/** Início do período e os dias que ele cobre (para a faixa de uso por dia). */
export function intervaloDoPeriodo(p: PeriodoEquipe, agora = new Date()) {
  const hoje = diaDe(agora);
  const n = p === 'hoje' ? 1 : p === '7d' ? 7 : p === '30d' ? 30 : Number(hoje.slice(8, 10));
  const dias = Array.from({ length: n }, (_, i) => diaDe(new Date(inicioDoDia(hoje).getTime() - (n - 1 - i) * 86_400_000 + 12 * 3_600_000)));
  return { gte: inicioDoDia(dias[0]), dias };
}

/**
 * Acompanhamento da equipe (D-26), só o gestor: cada vendedor com presença (último acesso, dias e tempo de uso),
 * as ações do período por grupo e as vendas creditadas a ele (tabela venda, a mesma das metas).
 */
export async function acompanhamentoDaEquipe(u: Usuario, periodo: PeriodoEquipe) {
  exigirGestor(u);
  const { gte, dias } = intervaloDoPeriodo(periodo);
  const [pessoas, sessoes, acoes, vendas, clientes] = await Promise.all([
    db.user.findMany({ where: { papel: 'vendedor', ativo: true }, select: { id: true, name: true, ultimoAcessoEm: true, ultimoLoginEm: true }, orderBy: { name: 'asc' } }),
    db.sessaoEquipe.findMany({ where: { fimEm: { gte } }, select: { usuarioId: true, inicioEm: true, segundos: true } }),
    db.atividadeEquipe.findMany({ where: { criadoEm: { gte } }, select: { usuarioId: true, tipo: true, criadoEm: true } }),
    db.venda.groupBy({ by: ['vendedorId'], where: { data: { gte } }, _sum: { valor: true }, _count: true }),
    db.cliente.groupBy({ by: ['vendedorId'], where: { NOT: { telefone: '' } }, _count: true }),
  ]);
  const resumo = resumirEquipe(sessoes, acoes, d => diaDe(d));
  const venda = new Map(vendas.map(v => [v.vendedorId, v]));
  const carteira = new Map(clientes.map(c => [c.vendedorId, c._count]));
  const agora = Date.now();
  return {
    dias,
    linhas: pessoas.map(p => ({
      ...p,
      resumo: resumo.get(p.id) ?? resumoVazio(),
      vendido: Number(venda.get(p.id)?._sum.valor ?? 0),
      vendas: venda.get(p.id)?._count ?? 0,
      carteira: carteira.get(p.id) ?? 0,
      online: online(p.ultimoAcessoEm, agora),
    })),
  };
}

export const ACOES_POR_PAGINA = 60;

/** Histórico de ações da equipe, mais recentes primeiro, com filtros por pessoa, tipo e período (só o gestor). */
export async function historicoDaEquipe(u: Usuario, f: { usuarioId?: string | null; tipo?: Acao | null; periodo: PeriodoEquipe; pagina: number }) {
  exigirGestor(u);
  const where: Prisma.AtividadeEquipeWhereInput = {
    criadoEm: { gte: intervaloDoPeriodo(f.periodo).gte },
    ...(f.usuarioId ? { usuarioId: f.usuarioId } : {}),
    ...(f.tipo ? { tipo: f.tipo } : {}),
  };
  const [acoes, total] = await Promise.all([
    db.atividadeEquipe.findMany({ where, orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }], take: ACOES_POR_PAGINA * f.pagina, include: { usuario: { select: { id: true, name: true, papel: true } } } }),
    db.atividadeEquipe.count({ where }),
  ]);
  return { acoes, total };
}

/** Últimas ações de uma pessoa e o último acesso e login dela (perfil do vendedor). */
export async function ultimasAcoes(u: Usuario, usuarioId: string, quantas = 12) {
  exigirGestor(u);
  const [acoes, acesso] = await Promise.all([
    db.atividadeEquipe.findMany({ where: { usuarioId }, orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }], take: quantas }),
    db.user.findUnique({ where: { id: usuarioId }, select: { ultimoAcessoEm: true, ultimoLoginEm: true } }),
  ]);
  return { acoes, acesso, online: online(acesso?.ultimoAcessoEm) };
}
