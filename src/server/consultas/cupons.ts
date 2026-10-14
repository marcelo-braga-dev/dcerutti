import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from '../db';
import type { Usuario } from '../permissoes';
import { exigirGestor } from './acesso';
import { prazoAposCadastro, regraEmPalavras, situacaoCupom, type RegraCupom } from '@/lib/cupom';
import { lerConfig } from '../config';

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
    clientes: c.clientes.map(x => x.cliente.id), diasAposCadastro: c.diasAposCadastro,
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
  // Fora da lista: o modelo e os cupons pessoais da próxima compra (ficam na tela de campanhas e na ficha da cliente).
  const cupons = await db.cupom.findMany({ where: { modelo: false, origem: { not: 'proximaCompra' } }, include: COM_ALVOS, orderBy: [{ ativo: 'desc' }, { criadoEm: 'desc' }] });
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
    where: { ativo: true, modelo: false, origem: { not: 'proximaCompra' }, OR: [{ fimEm: null }, { fimEm: { gte: agora } }] },
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
  if (!cupom || cupom.modelo || cupom.origem !== 'manual') return null; // campanhas têm a tela própria
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

export type CupomDaCliente = {
  id: number; codigo: string; origem: 'manual' | 'primeiraCompra' | 'proximaCompra'; regra: string; quemAplica: 'cliente' | 'equipe' | 'ambos';
  inicioEm: Date; fimEm: Date | null; situacao: 'disponivel' | 'agendado' | 'usado' | 'expirado';
};

/**
 * Cupons de uma cliente (fase 4): primeira compra (se ainda pode usar), os pessoais de próxima compra e os criados só
 * para ela. Olha todas as fichas com o mesmo telefone. Sem os cupons ligados, lista vazia. Quem chama confere o acesso.
 */
export async function cuponsDaFicha(clienteId: string): Promise<CupomDaCliente[]> {
  if (!(await lerConfig()).cupons.ligados) return [];
  const cliente = await db.cliente.findUnique({ where: { id: clienteId }, select: { telefone: true, criadoEm: true } });
  if (!cliente) return [];
  const fichas = cliente.telefone
    ? [...new Set([clienteId, ...(await db.cliente.findMany({ where: { telefone: { in: [cliente.telefone, cliente.telefone.replace(/\D/g, '')] } }, select: { id: true } })).map(x => x.id)])]
    : [clienteId];
  const [cupons, jaComprou] = await Promise.all([
    db.cupom.findMany({
      where: { modelo: false, ativo: true, OR: [{ origem: 'primeiraCompra' }, { clientes: { some: { clienteId: { in: fichas } } } }] },
      include: COM_ALVOS, orderBy: [{ fimEm: 'asc' }, { criadoEm: 'desc' }],
    }),
    db.venda.count({ where: { clienteId: { in: fichas } } }).then(n => n > 0),
  ]);
  if (!cupons.length) return [];
  const [usosTotais, usosDela] = await Promise.all([
    usosDosCupons(cupons.map(c => c.id)),
    db.pedido.groupBy({ by: ['cupomId'], where: { cupomId: { in: cupons.map(c => c.id) }, clienteId: { in: fichas }, status: { not: 'cancelado' } }, _count: true })
      .then(g => new Map(g.map(x => [x.cupomId!, x._count]))),
  ]);
  const agora = new Date();
  const lista: CupomDaCliente[] = [];
  for (const c of cupons) {
    const dela = usosDela.get(c.id) ?? 0;
    const usado = c.limitePorCliente != null && dela >= c.limitePorCliente;
    if (c.origem === 'primeiraCompra' && jaComprou && !usado) continue; // não é mais para ela
    if (!usado && c.limiteTotal != null && (usosTotais.get(c.id)?.usos ?? 0) >= c.limiteTotal) continue; // esgotou para todos
    const prazo = c.origem === 'primeiraCompra' ? prazoAposCadastro({ diasAposCadastro: c.diasAposCadastro }, cliente.criadoEm) : null;
    const fimEm = prazo && (!c.fimEm || prazo < c.fimEm) ? prazo : c.fimEm;
    const situacao = usado ? 'usado' : fimEm && agora > fimEm ? 'expirado' : agora < c.inicioEm ? 'agendado' : 'disponivel';
    lista.push({ id: c.id, codigo: c.codigo, origem: c.origem, regra: regraEmPalavras(regraDe(c), nomesDosAlvos(c)), quemAplica: c.quemAplica, inicioEm: c.inicioEm, fimEm, situacao });
  }
  return lista;
}

/** Cupons da cliente logada (sacola e Minha conta). */
export async function cuponsDoClienteLogado(u: Usuario) {
  if (u.papel !== 'cliente') return [];
  const c = await db.cliente.findUnique({ where: { userId: u.id }, select: { id: true } });
  return c ? cuponsDaFicha(c.id) : [];
}

/** Tela de campanhas (gestor): o cupom de primeira compra, o modelo da próxima compra e os números de cada uma. */
export async function campanhasDeCupom(u: Usuario) {
  exigirGestor(u);
  const [primeira, modelo, cfg] = await Promise.all([
    db.cupom.findFirst({ where: { origem: 'primeiraCompra', modelo: false }, orderBy: { id: 'asc' } }),
    db.cupom.findFirst({ where: { origem: 'proximaCompra', modelo: true } }),
    lerConfig(),
  ]);
  const usosPrimeira = primeira ? (await usosDosCupons([primeira.id])).get(primeira.id) ?? { usos: 0, desconto: 0 } : { usos: 0, desconto: 0 };
  const gerados = modelo ? await db.cupom.findMany({ where: { modeloId: modelo.id }, select: { id: true } }) : [];
  const usosGerados = await usosDosCupons(gerados.map(g => g.id));
  const proxima = { gerados: gerados.length, usados: [...usosGerados.values()].reduce((a, x) => a + x.usos, 0), desconto: [...usosGerados.values()].reduce((a, x) => a + x.desconto, 0) };
  return { primeira, usosPrimeira, modelo, proxima, regras: cfg.proximaCompra, ligados: cfg.cupons.ligados };
}
