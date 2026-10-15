import 'server-only';
import type { Prisma, TipoAtividade } from '@prisma/client';
import { db } from '../db';
import { escopoVendedor, podeAcessar, type Usuario } from '../permissoes';
import { agruparVisitas, lerItensSacola, ranking, type FiltrosAtivos } from '@/lib/atividade';
import { diaDe } from '@/lib/datas';

/**
 * Histórico do cliente (docs/21): leituras do painel. O vendedor só vê as clientes dele; o gestor, todas (D-18: a linha
 * do tempo é completa para quem atende).
 */

const DIA = 86_400_000;
const desde = (dias: number, agora = new Date()) => new Date(agora.getTime() - dias * DIA);

type InfoProduto = { id: number; referencia: string; nome: string; marca: string; categoria: string; categoriaSlug: string; marcaSlug: string; genero: string; preco: number; precoCheio: number; imperdivel: boolean; ativo: boolean; imagem: string | null; disponivel: number };

/** Nome, foto, preço e estoque dos produtos (inclusive desativados: o histórico continua legível). */
async function produtosPorId(ids: number[]): Promise<Map<number, InfoProduto>> {
  if (!ids.length) return new Map();
  const ps = await db.produto.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: {
      id: true, referencia: true, nome: true, genero: true, preco: true, precoCheio: true, imperdivel: true, ativo: true,
      marca: { select: { nome: true, slug: true } }, categoria: { select: { nome: true, slug: true } },
      imagens: { select: { url: true }, orderBy: { ordem: 'asc' }, take: 1 },
      variantes: { select: { estoque: true, reservado: true } },
    },
  });
  return new Map(ps.map(p => [p.id, {
    id: p.id, referencia: p.referencia, nome: p.nome, marca: p.marca.nome, marcaSlug: p.marca.slug, categoria: p.categoria.nome,
    categoriaSlug: p.categoria.slug, genero: p.genero, preco: Number(p.preco), precoCheio: Number(p.precoCheio), imperdivel: p.imperdivel,
    ativo: p.ativo, imagem: p.imagens[0]?.url ?? null, disponivel: p.variantes.reduce((a, v) => a + Math.max(0, v.estoque - v.reservado), 0),
  }]));
}

async function clienteDaEquipe(u: Usuario, clienteId: string) {
  const c = await db.cliente.findUnique({ where: { id: clienteId }, select: { id: true, nome: true, telefone: true, vendedorId: true, userId: true, ultimoLoginEm: true, ultimoAcessoEm: true } });
  return c && podeAcessar(u, c) ? c : null;
}

/** Sacola guardada da cliente, com as peças como estão hoje. */
async function sacolaDe(clienteId: string) {
  const s = await db.sacolaCliente.findUnique({ where: { clienteId } });
  if (!s) return null;
  const itens = lerItensSacola(s.itens);
  const variantes = await db.variante.findMany({ where: { id: { in: itens.map(i => i.varianteId) } }, select: { id: true, tamanho: true, estoque: true, reservado: true, produtoId: true } });
  const porId = new Map(variantes.map(v => [v.id, v]));
  const produtos = await produtosPorId(variantes.map(v => v.produtoId));
  const linhas = itens.flatMap(i => {
    const v = porId.get(i.varianteId);
    const p = v && produtos.get(v.produtoId);
    return v && p ? [{ ...i, tamanho: v.tamanho, disponivel: Math.max(0, v.estoque - v.reservado), produto: p }] : [];
  });
  return { atualizadoEm: s.atualizadoEm, avisadoEm: s.avisadoEm, linhas, total: linhas.reduce((a, l) => a + l.produto.preco * l.quantidade, 0) };
}

/** Card "Interesse e acesso" da ficha: resumo, peças mais vistas, sacola, preferências e buscas. */
export async function interesseDoCliente(u: Usuario, clienteId: string, agora = new Date()) {
  const c = await clienteDaEquipe(u, clienteId);
  if (!c) return null;
  const base = { clienteId };
  const [acessos, paginas30, vistos, tamanhos, sacolaEventos, buscas, sacola, pedidos] = await Promise.all([
    db.atividade.findMany({ where: { ...base, tipo: { in: ['acesso', 'login'] }, criadoEm: { gte: desde(90, agora) } }, select: { tipo: true, aparelho: true, criadoEm: true } }),
    db.atividade.aggregate({ where: { ...base, tipo: { in: ['pagina', 'produto', 'busca', 'filtro'] }, criadoEm: { gte: desde(30, agora) } }, _count: true, _sum: { duracaoSeg: true } }),
    db.atividade.groupBy({ by: ['produtoId'], where: { ...base, tipo: 'produto', produtoId: { not: null } }, _count: { _all: true }, _max: { criadoEm: true }, _sum: { duracaoSeg: true } }),
    db.atividade.findMany({ where: { ...base, tipo: 'tamanho' }, select: { produtoId: true, termo: true }, orderBy: { criadoEm: 'desc' }, take: 300 }),
    db.atividade.findMany({ where: { ...base, tipo: 'sacola' }, select: { produtoId: true, termo: true, dados: true }, take: 500, orderBy: { criadoEm: 'desc' } }),
    db.atividade.findMany({ where: { ...base, tipo: 'busca' }, select: { termo: true, dados: true, criadoEm: true }, orderBy: { criadoEm: 'desc' }, take: 15 }),
    sacolaDe(clienteId),
    db.pedidoItem.findMany({ where: { pedido: { clienteId, status: { not: 'cancelado' } } }, select: { produtoId: true, situacao: true, pedido: { select: { status: true } } } }),
  ]);

  const visitas = acessos.filter(a => a.tipo === 'acesso');
  const produtos = await produtosPorId(vistos.map(v => v.produtoId!));
  const adicionados = new Map<number, number>();
  for (const e of sacolaEventos) {
    const d = (e.dados as { delta?: number } | null)?.delta ?? 0;
    if (e.produtoId && d > 0) adicionados.set(e.produtoId, (adicionados.get(e.produtoId) ?? 0) + d);
  }
  const comprados = new Set(pedidos.filter(i => i.pedido.status === 'confirmado' && i.situacao !== 'devolvido').map(i => i.produtoId));
  const pedidos_ = new Set(pedidos.map(i => i.produtoId));
  const tamanhosPorProduto = new Map<number, string[]>();
  for (const t of tamanhos) if (t.produtoId && t.termo) {
    const l = tamanhosPorProduto.get(t.produtoId) ?? [];
    if (!l.includes(t.termo)) l.push(t.termo);
    tamanhosPorProduto.set(t.produtoId, l);
  }

  const pecas = vistos
    .flatMap(v => {
      const p = produtos.get(v.produtoId!);
      return p ? [{
        produto: p, vezes: v._count._all, ultimaVez: v._max.criadoEm!, tempo: v._sum.duracaoSeg ?? 0,
        tamanhos: tamanhosPorProduto.get(p.id) ?? [], naSacola: adicionados.get(p.id) ?? 0,
        situacao: comprados.has(p.id) ? 'comprou' as const : pedidos_.has(p.id) ? 'pediu' as const : null,
      }] : [];
    })
    .sort((a, b) => b.vezes - a.vezes || b.ultimaVez.getTime() - a.ultimaVez.getTime());

  // Preferências: o que ela mais olha (cada visualização conta 1) e os tamanhos que escolhe ou põe na sacola.
  const visto = pecas.flatMap(x => Array.from({ length: x.vezes }, () => x.produto));
  const preferencias = {
    categorias: ranking(visto, p => p.categoria).slice(0, 5),
    marcas: ranking(visto, p => p.marca).slice(0, 5),
    generos: ranking(visto, p => p.genero),
    tamanhos: ranking([...tamanhos.map(t => t.termo), ...sacolaEventos.filter(e => ((e.dados as { delta?: number } | null)?.delta ?? 0) > 0).map(e => e.termo)], t => t).slice(0, 5),
    promocao: visto.length ? visto.filter(p => p.imperdivel || p.preco < p.precoCheio).length / visto.length : null,
  };

  return {
    cliente: c,
    resumo: {
      ultimoLoginEm: c.ultimoLoginEm, ultimoAcessoEm: c.ultimoAcessoEm,
      visitas7: visitas.filter(v => v.criadoEm >= desde(7, agora)).length,
      visitas30: visitas.filter(v => v.criadoEm >= desde(30, agora)).length,
      paginas30: paginas30._count, tempo30: paginas30._sum.duracaoSeg ?? 0,
      aparelho: ranking(acessos, a => a.aparelho)[0]?.valor ?? null,
    },
    pecas: pecas.slice(0, 12),
    totalPecasVistas: pecas.length,
    sacola,
    preferencias,
    buscas: buscas.map(b => ({ termo: b.termo ?? '', resultados: (b.dados as { resultados?: number } | null)?.resultados ?? null, criadoEm: b.criadoEm })),
  };
}

export type ItemLinhaDoTempo =
  | { tipo: 'atividade'; id: string; criadoEm: Date; evento: Prisma.AtividadeGetPayload<object>; produto: InfoProduto | null }
  | { tipo: 'pedido'; id: string; criadoEm: Date; pedido: { id: string; codigo: string; tipo: string; status: string; origem: string; total: number } };

/** Filtros da linha do tempo: cada um junta alguns tipos de evento. */
export const FILTROS_LINHA = {
  pecas: { rotulo: 'Peças', tipos: ['produto', 'tamanho'] },
  buscas: { rotulo: 'Buscas e filtros', tipos: ['busca', 'filtro'] },
  sacola: { rotulo: 'Sacola e cupons', tipos: ['sacola', 'cupom'] },
  acessos: { rotulo: 'Acessos', tipos: ['login', 'acesso', 'whatsapp'] },
  pedidos: { rotulo: 'Pedidos', tipos: [] },
} as const satisfies Record<string, { rotulo: string; tipos: TipoAtividade[] }>;
export type FiltroLinha = keyof typeof FILTROS_LINHA;

/** Linha do tempo completa, mais nova primeiro, agrupada em visitas; os pedidos da cliente entram no meio. */
export async function linhaDoTempo(u: Usuario, clienteId: string, limite = 200, filtro?: FiltroLinha) {
  const c = await clienteDaEquipe(u, clienteId);
  if (!c) return null;
  const tipos = filtro ? [...FILTROS_LINHA[filtro].tipos] : null;
  const where: Prisma.AtividadeWhereInput = { clienteId, ...(tipos ? { tipo: { in: tipos } } : {}) };
  const [eventos, total, categorias, marcas] = await Promise.all([
    tipos?.length === 0 ? [] : db.atividade.findMany({ where, orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }], take: limite }),
    tipos?.length === 0 ? 0 : db.atividade.count({ where }),
    db.categoria.findMany({ select: { slug: true, nome: true } }),
    db.marca.findMany({ select: { slug: true, nome: true } }),
  ]);
  const maisAntigo = eventos.at(-1)?.criadoEm;
  const pedidos = !filtro || filtro === 'pedidos'
    ? await db.pedido.findMany({
        where: { clienteId, ...(maisAntigo && total > eventos.length ? { criadoEm: { gte: maisAntigo } } : {}) },
        select: { id: true, codigo: true, tipo: true, status: true, origem: true, total: true, criadoEm: true }, orderBy: { criadoEm: 'desc' }, take: 200,
      })
    : [];
  const produtos = await produtosPorId(eventos.flatMap(e => (e.produtoId ? [e.produtoId] : [])));
  const itens: ItemLinhaDoTempo[] = eventos.map(e => ({ tipo: 'atividade' as const, id: String(e.id), criadoEm: e.criadoEm, evento: e, produto: e.produtoId ? produtos.get(e.produtoId) ?? null : null }));
  for (const p of pedidos) itens.push({ tipo: 'pedido', id: p.id, criadoEm: p.criadoEm, pedido: { id: p.id, codigo: p.codigo, tipo: p.tipo, status: p.status, origem: p.origem, total: Number(p.total) } });
  itens.sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime());
  return {
    cliente: c, visitas: agruparVisitas(itens), total, mostrando: eventos.length,
    nomes: { categorias: new Map(categorias.map(x => [x.slug, x.nome])), marcas: new Map(marcas.map(x => [x.slug, x.nome])) },
  };
}

/** Painel: clientes que mostraram interesse nos últimos 7 dias (sacola aberta ou a mesma peça vista 3 vezes ou mais). */
export async function interessadosAgora(u: Usuario, agora = new Date()) {
  const semana = desde(7, agora);
  const ativos = await db.cliente.findMany({
    where: { ...escopoVendedor(u), ultimoAcessoEm: { gte: semana }, NOT: { telefone: '' } },
    select: { id: true, nome: true, telefone: true, ultimoAcessoEm: true, vendedor: { select: { name: true } } },
    orderBy: { ultimoAcessoEm: 'desc' }, take: 300,
  });
  if (!ativos.length) return [];
  const ids = ativos.map(c => c.id);
  const [sacolas, repetidos] = await Promise.all([
    db.sacolaCliente.findMany({ where: { clienteId: { in: ids } }, select: { clienteId: true, itens: true, atualizadoEm: true } }),
    db.atividade.groupBy({
      by: ['clienteId', 'produtoId'], where: { clienteId: { in: ids }, tipo: 'produto', criadoEm: { gte: semana } },
      _count: { _all: true }, having: { produtoId: { _count: { gte: 3 } } },
    }),
  ]);
  const produtos = await produtosPorId(repetidos.map(r => r.produtoId!).filter(Boolean));
  const sacolaPor = new Map(sacolas.map(s => [s.clienteId, s]));
  return ativos.flatMap(c => {
    const motivos: string[] = [];
    const s = sacolaPor.get(c.id);
    const pecas = s ? lerItensSacola(s.itens).reduce((a, i) => a + i.quantidade, 0) : 0;
    if (pecas) motivos.push(`${pecas} ${pecas === 1 ? 'peça' : 'peças'} na sacola`);
    for (const r of repetidos.filter(r => r.clienteId === c.id).sort((a, b) => b._count._all - a._count._all).slice(0, 2)) {
      const p = r.produtoId ? produtos.get(r.produtoId) : null;
      if (p) motivos.push(`viu ${r._count._all}× ${p.nome}`);
    }
    return motivos.length ? [{ ...c, motivos, sacola: pecas > 0 }] : [];
  }).slice(0, 10);
}

/** Ids das clientes que o usuário atende (null = todas, para o gestor). */
async function clientesDoEscopo(u: Usuario) {
  if (u.papel === 'gestor') return null;
  return (await db.cliente.findMany({ where: escopoVendedor(u), select: { id: true } })).map(c => c.id);
}

/** Página "Interesse": o que as clientes procuram e veem no período (últimos `dias`). */
export async function relatorioInteresse(u: Usuario, dias: number, agora = new Date()) {
  const ids = await clientesDoEscopo(u);
  const deCliente = ids ? { clienteId: { in: ids } } : {};
  const periodo = { gte: desde(dias, agora) };
  const w = (tipo: Prisma.AtividadeWhereInput['tipo']): Prisma.AtividadeWhereInput => ({ ...deCliente, tipo, criadoEm: periodo });

  const [ativas, visitas, vistos, vistosPorCliente, adicionados, buscas, sacolasAbertas, maisAtivas, totalVistas] = await Promise.all([
    db.atividade.groupBy({ by: ['clienteId'], where: { ...deCliente, criadoEm: periodo } }),
    db.atividade.findMany({ where: w('acesso'), select: { criadoEm: true, aparelho: true, clienteId: true } }),
    db.atividade.groupBy({ by: ['produtoId'], where: { ...w('produto'), produtoId: { not: null } }, _count: { _all: true }, orderBy: { _count: { produtoId: 'desc' } }, take: 20 }),
    db.atividade.groupBy({ by: ['produtoId', 'clienteId'], where: { ...w('produto'), produtoId: { not: null } } }),
    db.atividade.findMany({ where: w('sacola'), select: { produtoId: true, dados: true } }),
    db.atividade.findMany({ where: w('busca'), select: { termo: true, dados: true }, take: 5000 }),
    db.sacolaCliente.count({ where: ids ? { clienteId: { in: ids } } : {} }),
    db.atividade.groupBy({ by: ['clienteId'], where: { ...deCliente, criadoEm: periodo, tipo: { in: ['pagina', 'produto', 'busca', 'filtro'] } }, _count: { _all: true }, orderBy: { _count: { clienteId: 'desc' } }, take: 10 }),
    db.atividade.count({ where: w('produto') }),
  ]);

  const produtoIds = vistos.map(v => v.produtoId!);
  const [produtos, pedidos, nomes] = await Promise.all([
    produtosPorId(produtoIds),
    db.pedidoItem.groupBy({
      by: ['produtoId'],
      where: { produtoId: { in: produtoIds }, pedido: { criadoEm: periodo, status: { not: 'cancelado' }, ...(ids ? { clienteId: { in: ids } } : {}) } },
      _sum: { quantidade: true },
    }),
    db.cliente.findMany({ where: { id: { in: maisAtivas.map(m => m.clienteId) } }, select: { id: true, nome: true, ultimoAcessoEm: true, vendedor: { select: { name: true } } } }),
  ]);
  const clientesPorProduto = new Map<number, number>();
  for (const v of vistosPorCliente) if (v.produtoId) clientesPorProduto.set(v.produtoId, (clientesPorProduto.get(v.produtoId) ?? 0) + 1);
  const sacolaPorProduto = new Map<number, number>();
  for (const a of adicionados) {
    const d = (a.dados as { delta?: number } | null)?.delta ?? 0;
    if (a.produtoId && d > 0) sacolaPorProduto.set(a.produtoId, (sacolaPorProduto.get(a.produtoId) ?? 0) + d);
  }
  const pedidosPorProduto = new Map(pedidos.map(p => [p.produtoId, p._sum.quantidade ?? 0]));

  const semResultado = ranking(buscas.filter(b => (b.dados as { resultados?: number } | null)?.resultados === 0), b => b.termo?.toLowerCase()).slice(0, 15);
  const maisBuscadas = ranking(buscas, b => b.termo?.toLowerCase()).slice(0, 15);
  const porDia = ranking(visitas, v => diaDe(v.criadoEm)).sort((a, b) => a.valor.localeCompare(b.valor));
  const nomePor = new Map(nomes.map(n => [n.id, n]));

  let porVendedor: { valor: string; n: number; parte: number }[] = [];
  if (!ids) {
    const cs = await db.cliente.findMany({ where: { id: { in: ativas.map(a => a.clienteId) } }, select: { vendedor: { select: { name: true } } } });
    porVendedor = ranking(cs, c => c.vendedor.name);
  }

  return {
    kpis: { clientesAtivas: ativas.length, visitas: visitas.length, vistas: totalVistas, sacolasAbertas },
    produtos: vistos.flatMap(v => {
      const p = produtos.get(v.produtoId!);
      return p ? [{ produto: p, vistas: v._count._all, clientes: clientesPorProduto.get(p.id) ?? 0, sacola: sacolaPorProduto.get(p.id) ?? 0, pedidas: pedidosPorProduto.get(p.id) ?? 0 }] : [];
    }),
    semResultado, maisBuscadas, porDia,
    aparelhos: ranking(visitas, v => v.aparelho),
    porVendedor,
    maisAtivas: maisAtivas.flatMap(m => {
      const c = nomePor.get(m.clienteId);
      return c ? [{ id: c.id, nome: c.nome, vendedor: c.vendedor.name, ultimoAcessoEm: c.ultimoAcessoEm, paginas: m._count._all }] : [];
    }),
  };
}

export type { FiltrosAtivos };
