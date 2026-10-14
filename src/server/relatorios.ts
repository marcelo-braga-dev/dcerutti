import 'server-only';
import { Prisma } from '@prisma/client';
import { db } from './db';
import { intervaloDoMes } from '@/lib/datas';
import { TOM } from '@/lib/marca';

/** Meta vigente de cada vendedor no mês: a do próprio mês ou, se não houver, a mais recente anterior. */
export async function metasDoMes(vendedorIds: string[], mes: string) {
  const metas = await db.meta.findMany({ where: { vendedorId: { in: vendedorIds }, mes: { lte: mes } }, orderBy: { mes: 'desc' } });
  const m = new Map<string, number>();
  for (const x of metas) if (!m.has(x.vendedorId)) m.set(x.vendedorId, Number(x.valor));
  return m;
}

export async function vendidoPorVendedor(mes: string, vendedorId?: string) {
  const g = await db.venda.groupBy({
    by: ['vendedorId'],
    where: { data: intervaloDoMes(mes), ...(vendedorId ? { vendedorId } : {}) },
    _sum: { valor: true },
    _count: true,
  });
  return new Map(g.map(x => [x.vendedorId, { valor: Number(x._sum.valor ?? 0), n: x._count }]));
}

export const corDaMeta = (pct: number) => (pct >= 100 ? TOM.bom : pct >= 60 ? TOM.atencao : TOM.ruim);

export type Periodo = { rotulo: string; data?: { gte: Date; lt: Date } };

/** Resultados (RF-34). Receita e custo vêm das vendas; categorias e produtos, dos itens vendidos. */
export async function resultados(periodo: Periodo) {
  const [vendas, itens, usuarios] = await Promise.all([
    db.venda.findMany({ where: periodo.data ? { data: periodo.data } : {}, select: { vendedorId: true, valor: true, custo: true, pedidoId: true } }),
    db.pedidoItem.findMany({
      where: { situacao: 'vendido', pedido: { status: 'confirmado', ...(periodo.data ? { confirmadoEm: periodo.data } : {}) } },
      select: { produtoId: true, referencia: true, nome: true, marca: true, categoria: true, imagem: true, quantidade: true, precoUnitario: true, custoUnitario: true, descontoCupom: true },
    }),
    db.user.findMany({ where: { papel: { in: ['vendedor', 'gestor'] } }, select: { id: true, name: true } }),
  ]);

  const soma = (xs: Prisma.Decimal[]) => xs.reduce((a, x) => a + Number(x), 0);
  const receita = soma(vendas.map(v => v.valor));
  const comCusto = vendas.filter(v => v.custo != null);
  const receitaComCusto = soma(comCusto.map(v => v.valor));
  const custo = soma(comCusto.map(v => v.custo!));
  const manuais = vendas.filter(v => !v.pedidoId).length;

  type Grupo = { chave: string; nome: string; n: number; receita: number; receitaComCusto: number; custo: number; imagem?: string | null; extra?: string };
  const agrupar = <T,>(xs: T[], chave: (x: T) => string, base: (x: T) => Omit<Grupo, 'n' | 'receita' | 'receitaComCusto' | 'custo'>, soma: (g: Grupo, x: T) => void) => {
    const m = new Map<string, Grupo>();
    for (const x of xs) {
      const k = chave(x);
      const g = m.get(k) ?? { ...base(x), n: 0, receita: 0, receitaComCusto: 0, custo: 0 };
      soma(g, x);
      m.set(k, g);
    }
    return [...m.values()].map(g => ({ ...g, lucro: g.receitaComCusto - g.custo, margem: g.receitaComCusto ? (g.receitaComCusto - g.custo) / g.receitaComCusto : null }));
  };

  const nomeDe = new Map(usuarios.map(u => [u.id, u.name]));
  const porVendedor = agrupar(vendas, v => v.vendedorId, v => ({ chave: v.vendedorId, nome: nomeDe.get(v.vendedorId) ?? 'Sem vendedor' }), (g, v) => {
    g.n++; g.receita += Number(v.valor);
    if (v.custo != null) { g.receitaComCusto += Number(v.valor); g.custo += Number(v.custo); }
  }).sort((a, b) => b.receita - a.receita);

  const somaItem = (g: Grupo, i: (typeof itens)[number]) => {
    const r = Number(i.precoUnitario) * i.quantidade - Number(i.descontoCupom); // receita já sem o desconto do cupom
    g.n += i.quantidade; g.receita += r;
    if (i.custoUnitario != null) { g.receitaComCusto += r; g.custo += Number(i.custoUnitario) * i.quantidade; }
  };
  const porCategoria = agrupar(itens, i => i.categoria, i => ({ chave: i.categoria, nome: i.categoria }), somaItem).sort((a, b) => b.lucro - a.lucro);
  const porProduto = agrupar(itens, i => String(i.produtoId), i => ({ chave: i.referencia, nome: i.nome, imagem: i.imagem, extra: `${i.marca} · Ref. ${i.referencia}` }), somaItem)
    .sort((a, b) => b.lucro - a.lucro || b.receita - a.receita)
    .slice(0, 10);

  return {
    receita, custo, lucro: receitaComCusto - custo, margem: receitaComCusto ? (receitaComCusto - custo) / receitaComCusto : null,
    pecas: itens.reduce((a, i) => a + i.quantidade, 0), vendas: vendas.length, semCusto: vendas.length - comCusto.length, manuais,
    porVendedor, porCategoria, porProduto,
  };
}

/** Indicadores do estoque (RF-33): a custo, a preço de venda e lucro potencial. Só gestor. */
export async function indicadoresEstoque() {
  const produtos = await db.produto.findMany({
    where: { ativo: true },
    select: { preco: true, custo: { select: { valor: true } }, variantes: { select: { estoque: true } }, _count: { select: { imagens: true } } },
  });
  let pecas = 0, aCusto = 0, aVenda = 0, semCusto = 0, semFoto = 0;
  for (const p of produtos) {
    const q = p.variantes.reduce((a, v) => a + Math.max(0, v.estoque), 0);
    pecas += q;
    aVenda += q * Number(p.preco);
    if (p.custo) aCusto += q * Number(p.custo.valor); else semCusto++;
    if (!p._count.imagens) semFoto++;
  }
  return { modelos: produtos.length, pecas, aCusto, aVenda, lucro: aVenda - aCusto, margem: aVenda ? (aVenda - aCusto) / aVenda : 0, semCusto, semFoto };
}

/**
 * Cupons em Resultados (docs/20-cupons.md, fase 5). Por cupom: pedidos confirmados no período, desconto dado, fretes
 * zerados, receita, lucro e margem (das vendas com custo). Os cupons pessoais de próxima compra entram somados numa
 * linha só. Próxima compra: quantos cupons o período gerou e quantos já voltaram como venda (em qualquer data).
 */
export async function resultadosCupons(periodo: Periodo) {
  const noPeriodo = periodo.data ? { confirmadoEm: periodo.data } : {};
  const [pedidos, totalPedidos, gerados] = await Promise.all([
    db.pedido.findMany({
      where: { status: 'confirmado', codigoCupom: { not: null }, ...noPeriodo },
      select: { codigoCupom: true, descontoCupom: true, freteCupom: true, cupom: { select: { origem: true, descricao: true } }, venda: { select: { valor: true, custo: true } } },
    }),
    db.pedido.count({ where: { status: 'confirmado', venda: { isNot: null }, ...noPeriodo } }),
    db.cupom.findMany({
      where: { origem: 'proximaCompra', modelo: false, ...(periodo.data ? { criadoEm: periodo.data } : {}) },
      select: { id: true, pedidos: { where: { status: 'confirmado' }, select: { venda: { select: { valor: true } } } } },
    }),
  ]);

  type Linha = { chave: string; nome: string; origem: string; pedidos: number; desconto: number; fretes: number; receita: number; receitaComCusto: number; custo: number };
  const m = new Map<string, Linha>();
  for (const p of pedidos) {
    const pessoal = p.cupom?.origem === 'proximaCompra';
    const chave = pessoal ? 'proximaCompra' : p.codigoCupom!;
    const l = m.get(chave) ?? { chave, nome: pessoal ? 'Próxima compra (cupons pessoais)' : p.codigoCupom!, origem: p.cupom?.origem ?? 'manual', pedidos: 0, desconto: 0, fretes: 0, receita: 0, receitaComCusto: 0, custo: 0 };
    l.pedidos++;
    l.desconto += Number(p.descontoCupom);
    if (p.freteCupom) l.fretes++;
    const valor = Number(p.venda?.valor ?? 0);
    l.receita += valor;
    if (p.venda?.custo != null) { l.receitaComCusto += valor; l.custo += Number(p.venda.custo); }
    m.set(chave, l);
  }
  const porCupom = [...m.values()]
    .map(l => ({ ...l, lucro: l.receitaComCusto - l.custo, margem: l.receitaComCusto ? (l.receitaComCusto - l.custo) / l.receitaComCusto : null }))
    .sort((a, b) => b.receita - a.receita);
  const voltaram = gerados.filter(g => g.pedidos.some(p => p.venda));
  return {
    pedidos: pedidos.length, totalPedidos,
    desconto: porCupom.reduce((a, l) => a + l.desconto, 0),
    receita: porCupom.reduce((a, l) => a + l.receita, 0),
    fretes: porCupom.reduce((a, l) => a + l.fretes, 0),
    porCupom,
    proxima: { gerados: gerados.length, voltaram: voltaram.length, receita: voltaram.reduce((a, g) => a + g.pedidos.reduce((s, p) => s + Number(p.venda?.valor ?? 0), 0), 0) },
  };
}
