import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from '../db';
import { escopoVendedor, podeAcessar, type Usuario } from '../permissoes';
import { vendedoresAtivos } from './equipe';
import { celularValido } from '@/lib/telefone';

/** B-11: ficha anonimizada (cliente que excluiu a conta) fica fora das listas; continua acessível pelos pedidos e vendas. */
const SEM_EXCLUIDOS: Prisma.ClienteWhereInput = { NOT: { telefone: '' } };

export const CLIENTES_POR_PAGINA = 60;

/**
 * Filtros da lista de clientes. Histórico (docs/21): acessou nos últimos 7 dias, sacola aberta. Compra: nunca comprou,
 * comprou nos últimos 30 dias, parada (comprou, mas não há 90 dias ou mais). Só o gestor filtra por vendedor.
 */
export type FiltroClientes = {
  vendedor?: string | null;
  compra?: 'nunca' | 'recente' | 'parada' | null;
  acesso?: 'com' | 'sem' | null;
  recentes?: boolean;
  sacola?: boolean;
  ordem?: 'nome' | 'acesso' | 'total' | 'compra';
};

const DIA = 86_400_000;

/**
 * "Carregar mais": traz `CLIENTES_POR_PAGINA * pagina` clientes, o total do filtro, a soma de vendas de cada um e a
 * contagem por vendedor (para o filtro do gestor, respeitando os outros filtros). As somas de vendas vêm de um
 * agrupamento só, e por isso a ordem por total comprado ou última compra é feita aqui (algumas centenas de fichas).
 */
export async function listarClientes(u: Usuario, q: string, pagina = 1, f: FiltroClientes = {}) {
  const gestor = u.papel === 'gestor';
  const base: Prisma.ClienteWhereInput = {
    ...escopoVendedor(u),
    ...SEM_EXCLUIDOS,
    ...(q ? { OR: [{ nome: { contains: q } }, { telefone: { contains: q } }, { cpf: { contains: q } }, { cidade: { contains: q } }, { endereco: { contains: q } }, { email: { contains: q } }] } : {}),
    ...(f.recentes ? { ultimoAcessoEm: { gte: new Date(Date.now() - 7 * DIA) } } : {}),
    ...(f.sacola ? { sacola: { isNot: null } } : {}),
    ...(f.acesso === 'com' ? { userId: { not: null } } : f.acesso === 'sem' ? { userId: null } : {}),
  };
  const vendas = await db.venda.groupBy({ by: ['clienteId'], where: { clienteId: { not: null }, cliente: base }, _sum: { valor: true }, _max: { data: true }, _count: true });
  const porCliente = new Map(vendas.map(v => [v.clienteId!, v]));
  const compradores = vendas.map(v => v.clienteId!);
  const corte30 = new Date(Date.now() - 30 * DIA), corte90 = new Date(Date.now() - 90 * DIA);
  const porCompra: Prisma.ClienteWhereInput =
    f.compra === 'nunca' ? { id: { notIn: compradores } }
    : f.compra === 'recente' ? { id: { in: vendas.filter(v => v._max.data && v._max.data >= corte30).map(v => v.clienteId!) } }
    : f.compra === 'parada' ? { id: { in: vendas.filter(v => v._max.data && v._max.data < corte90).map(v => v.clienteId!) } }
    : {};
  const semVendedor: Prisma.ClienteWhereInput = { AND: [base, porCompra] };
  const where: Prisma.ClienteWhereInput = gestor && f.vendedor ? { AND: [semVendedor, { vendedorId: f.vendedor }] } : semVendedor;

  const emMemoria = f.ordem === 'total' || f.ordem === 'compra';
  const ordem: Prisma.ClienteOrderByWithRelationInput[] = f.ordem === 'acesso' ? [{ ultimoAcessoEm: { sort: 'desc', nulls: 'last' } }, { nome: 'asc' }] : [{ nome: 'asc' }];
  const [lista, total, contagem] = await Promise.all([
    db.cliente.findMany({
      where, orderBy: ordem, ...(emMemoria ? {} : { take: CLIENTES_POR_PAGINA * pagina }),
      include: { vendedor: { select: { id: true, name: true } }, sacola: { select: { atualizadoEm: true } }, _count: { select: { pedidos: { where: { status: 'pendente' } } } } },
    }),
    db.cliente.count({ where }),
    gestor ? db.cliente.groupBy({ by: ['vendedorId'], where: semVendedor, _count: true }) : Promise.resolve([]),
  ]);
  const valor = (id: string) => Number(porCliente.get(id)?._sum.valor ?? 0);
  const ultima = (id: string) => porCliente.get(id)?._max.data?.getTime() ?? 0;
  const clientes = emMemoria
    ? [...lista].sort((a, b) => (f.ordem === 'total' ? valor(b.id) - valor(a.id) : ultima(b.id) - ultima(a.id)) || a.nome.localeCompare(b.nome, 'pt-BR')).slice(0, CLIENTES_POR_PAGINA * pagina)
    : lista;
  return { clientes, total, vendasPorCliente: porCliente, porVendedor: new Map(contagem.map(c => [c.vendedorId, c._count])) };
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

/** Nome do cliente para o filtro "Pedidos de …", ou null se não existe ou é de outro vendedor. */
export async function clienteDoFiltro(u: Usuario, id: string | null | undefined) {
  if (!id) return null;
  const c = await db.cliente.findUnique({ where: { id }, select: { id: true, nome: true, vendedorId: true } });
  return c && podeAcessar(u, c) ? c : null;
}
