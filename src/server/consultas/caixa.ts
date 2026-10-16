import 'server-only';
import { db } from '../db';
import { catalogo } from '../catalogo';
import { escopoVendedor, type Usuario } from '../permissoes';
import type { ProdutoCaixa } from '@/lib/caixa';
import { diaDe, fimDoDia, inicioDoDia } from '@/lib/datas';

/**
 * Caixa da loja física (D-23): o que a tela precisa. O catálogo vai inteiro para o navegador (algumas centenas de
 * peças): a busca e os filtros respondem na hora, sem ida ao servidor a cada tecla. O servidor confere tudo ao gravar.
 */

export async function produtosDoCaixa(): Promise<ProdutoCaixa[]> {
  const desde = new Date(Date.now() - 90 * 86_400_000);
  const [lista, eans, vendidos] = await Promise.all([
    catalogo(),
    db.variante.findMany({ where: { produto: { ativo: true } }, select: { id: true, ean: true } }),
    db.pedidoItem.groupBy({ by: ['produtoId'], where: { pedido: { status: 'confirmado', confirmadoEm: { gte: desde } }, situacao: { not: 'devolvido' } }, _sum: { quantidade: true } }),
  ]);
  const ean = new Map(eans.map(v => [v.id, v.ean]));
  const vendas = new Map(vendidos.map(v => [v.produtoId, v._sum.quantidade ?? 0]));
  return lista.map(p => ({
    id: p.id, referencia: p.referencia, nome: p.nome, marca: p.marca, marcaSlug: p.marcaSlug, categoria: p.categoria, categoriaSlug: p.categoriaSlug,
    genero: p.genero, corNome: p.corNome ?? p.cor, preco: p.preco, precoCheio: p.precoCheio, imperdivel: p.imperdivel, imagem: p.imagens[0] ?? null,
    variantes: p.variantes.map(v => ({ ...v, ean: ean.get(v.id) ?? null })), vendidos: vendas.get(p.id) ?? 0, modelo: p.modelo,
  }));
}

/** Intervalo do dia (São Paulo). `dia` no formato 2026-10-16; padrão, hoje. */
const intervalo = (dia?: string) => {
  const d = dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : diaDe();
  return { dia: d, gte: inicioDoDia(d), lte: fimDoDia(d) };
};

/** Total e quantidade das vendas do caixa de hoje (topo da tela). O vendedor vê as dele. */
export async function resumoDoCaixa(u: Usuario) {
  const { gte, lte } = intervalo();
  const r = await db.pedido.aggregate({ where: { ...escopoVendedor(u), origem: 'balcao', status: 'confirmado', confirmadoEm: { gte, lte } }, _sum: { total: true }, _count: true });
  return { total: Number(r._sum.total ?? 0), vendas: r._count };
}

/** Vendas do caixa do dia, com pagamentos, e os totais para o fechamento (por forma e por vendedor). */
export async function vendasDoCaixa(u: Usuario, dia?: string) {
  const { dia: d, gte, lte } = intervalo(dia);
  const pedidos = await db.pedido.findMany({
    // Confirmadas e as desfeitas depois de confirmadas; as que o caixa cancelou antes de confirmar (pagamento não conferiu) ficam fora.
    where: { ...escopoVendedor(u), origem: 'balcao', criadoEm: { gte, lte }, OR: [{ status: 'confirmado' }, { status: 'cancelado', confirmadoEm: { not: null } }] },
    orderBy: { criadoEm: 'desc' },
    select: {
      id: true, codigo: true, status: true, criadoEm: true, total: true, nomeCliente: true, telefoneCliente: true, codigoCupom: true, motivoCancelamento: true,
      vendedor: { select: { name: true } },
      itens: { select: { quantidade: true, nome: true, tamanho: true, imagem: true } },
      pagamentos: { select: { forma: true, valor: true, parcelas: true, recebido: true } },
    },
  });
  const validas = pedidos.filter(p => p.status === 'confirmado');
  const porForma = new Map<string, { valor: number; n: number }>();
  const porVendedor = new Map<string, { valor: number; n: number }>();
  let troco = 0;
  for (const p of validas) {
    for (const g of p.pagamentos) {
      const x = porForma.get(g.forma) ?? { valor: 0, n: 0 };
      x.valor += Number(g.valor); x.n++;
      porForma.set(g.forma, x);
      if (g.forma === 'dinheiro' && g.recebido != null) troco += Math.max(0, Number(g.recebido) - Number(g.valor));
    }
    const v = porVendedor.get(p.vendedor.name) ?? { valor: 0, n: 0 };
    v.valor += Number(p.total); v.n++;
    porVendedor.set(p.vendedor.name, v);
  }
  const total = validas.reduce((a, p) => a + Number(p.total), 0);
  const pecas = validas.reduce((a, p) => a + p.itens.reduce((b, i) => b + i.quantidade, 0), 0);
  return {
    dia: d, pedidos, total, vendas: validas.length, pecas, ticketMedio: validas.length ? total / validas.length : 0, troco,
    porForma: [...porForma.entries()].map(([forma, x]) => ({ forma, ...x })).sort((a, b) => b.valor - a.valor),
    porVendedor: [...porVendedor.entries()].map(([nome, x]) => ({ nome, ...x })).sort((a, b) => b.valor - a.valor),
    desfeitas: pedidos.filter(p => p.status === 'cancelado').length,
  };
}
