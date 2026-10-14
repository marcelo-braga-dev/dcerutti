import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from '../db';
import type { Usuario } from '../permissoes';
import { exigirGestor } from './acesso';
import { situacaoCupom, type RegraCupom } from '@/lib/cupom';

export const COM_ALVOS = {
  categorias: { select: { categoria: { select: { id: true, nome: true } } } },
  marcas: { select: { marca: { select: { id: true, nome: true } } } },
  produtos: { select: { produto: { select: { id: true, referencia: true, nome: true } } } },
  clientes: { select: { cliente: { select: { id: true, nome: true, vendedorId: true } } } },
} satisfies Prisma.CupomInclude;

type CupomComAlvos = Prisma.CupomGetPayload<{ include: typeof COM_ALVOS }>;

/** Cupom do banco no formato de `lib/cupom` (números em vez de Decimal, alvos como listas de ids). */
export function regraDe(c: CupomComAlvos): RegraCupom {
  const n = (v: Prisma.Decimal | null) => (v == null ? null : Number(v));
  return {
    codigo: c.codigo, tipo: c.tipo, valor: n(c.valor), tetoDesconto: n(c.tetoDesconto), minimoCompra: n(c.minimoCompra),
    inicioEm: c.inicioEm, fimEm: c.fimEm, limiteTotal: c.limiteTotal, limitePorCliente: c.limitePorCliente,
    somentePrimeiraCompra: c.somentePrimeiraCompra, valePromocao: c.valePromocao, quemAplica: c.quemAplica, ativo: c.ativo,
    categorias: c.categorias.map(x => x.categoria.id), marcas: c.marcas.map(x => x.marca.id), produtos: c.produtos.map(x => x.produto.id),
    clientes: c.clientes.map(x => x.cliente.id),
  };
}

/** Nomes da abrangência, para a regra em palavras. */
export const nomesDosAlvos = (c: CupomComAlvos) => [
  ...c.categorias.map(x => x.categoria.nome), ...c.marcas.map(x => x.marca.nome), ...c.produtos.map(x => `${x.produto.nome} (${x.produto.referencia})`),
];

/** Usos (pedidos não cancelados) e desconto concedido de cada cupom. */
export async function usosDosCupons(ids: number[]) {
  if (!ids.length) return new Map<number, { usos: number; desconto: number }>();
  const g = await db.pedido.groupBy({ by: ['cupomId'], where: { cupomId: { in: ids }, status: { not: 'cancelado' } }, _count: true, _sum: { descontoCupom: true } });
  return new Map(g.map(x => [x.cupomId!, { usos: x._count, desconto: Number(x._sum.descontoCupom ?? 0) }]));
}

/** Lista completa do gestor, com situação, usos e desconto concedido. */
export async function listarCupons(u: Usuario) {
  exigirGestor(u);
  const cupons = await db.cupom.findMany({ include: COM_ALVOS, orderBy: [{ ativo: 'desc' }, { criadoEm: 'desc' }] });
  const usos = await usosDosCupons(cupons.map(c => c.id));
  const agora = new Date();
  return cupons.map(c => {
    const u = usos.get(c.id) ?? { usos: 0, desconto: 0 };
    return { cupom: c, regra: regraDe(c), nomes: nomesDosAlvos(c), ...u, situacao: situacaoCupom(regraDe(c), u.usos, agora) };
  });
}

/**
 * Cupons que o vendedor pode divulgar (P-13): ativos e agendados. Os de clientes específicos só aparecem se algum
 * cliente da carteira dele estiver na lista. Sem números de uso, desconto ou receita (só para o gestor).
 */
export async function cuponsParaDivulgar(u: Usuario) {
  const agora = new Date();
  const cupons = await db.cupom.findMany({
    where: { ativo: true, OR: [{ fimEm: null }, { fimEm: { gte: agora } }] },
    include: COM_ALVOS, orderBy: [{ inicioEm: 'asc' }, { codigo: 'asc' }],
  });
  const usos = await usosDosCupons(cupons.map(c => c.id));
  return cupons
    .map(c => {
      const situacao = situacaoCupom(regraDe(c), usos.get(c.id)?.usos ?? 0, agora);
      const meus = u.papel === 'gestor' ? c.clientes.map(x => x.cliente) : c.clientes.map(x => x.cliente).filter(x => x.vendedorId === u.id);
      return {
        id: c.id, codigo: c.codigo, descricao: c.descricao, tipo: c.tipo, quemAplica: c.quemAplica, inicioEm: c.inicioEm, fimEm: c.fimEm,
        temLimite: c.limiteTotal != null, regra: regraDe(c), nomes: nomesDosAlvos(c), situacao,
        especifico: c.clientes.length > 0, clientes: meus.map(x => ({ id: x.id, nome: x.nome })),
      };
    })
    .filter(c => (c.situacao === 'ativo' || c.situacao === 'agendado') && (!c.especifico || c.clientes.length > 0));
}

/** Cupom para o formulário do gestor, com os usos (cupom usado tem campos travados). */
export async function cupomParaEdicao(u: Usuario, id: number) {
  exigirGestor(u);
  const cupom = await db.cupom.findUnique({ where: { id }, include: COM_ALVOS });
  if (!cupom) return null;
  const usos = (await usosDosCupons([id])).get(id) ?? { usos: 0, desconto: 0 };
  const pedidos = await db.pedido.findMany({
    where: { cupomId: id }, orderBy: { criadoEm: 'desc' }, take: 50,
    select: { id: true, codigo: true, nomeCliente: true, status: true, criadoEm: true, descontoCupom: true, freteCupom: true, total: true, vendedor: { select: { name: true } } },
  });
  return { cupom, ...usos, pedidos };
}

/** Opções do formulário: categorias, marcas e clientes (sem fichas anonimizadas). */
export async function opcoesDoCupom(u: Usuario) {
  exigirGestor(u);
  const [categorias, marcas, clientes] = await Promise.all([
    db.categoria.findMany({ select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
    db.marca.findMany({ select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
    db.cliente.findMany({ where: { NOT: { telefone: '' } }, select: { id: true, nome: true, telefone: true }, orderBy: { nome: 'asc' } }),
  ]);
  return { categorias, marcas, clientes };
}
