/**
 * Camada de leitura (src/server/consultas) e relatórios: o escopo "vendedor só vê o que é dele" e os números
 * conferidos contra o banco por SQL independente.
 */
import { describe, expect, it } from 'vitest';
import { contarPendentes, listarPedidos, pedidoParaEquipe, PEDIDOS_POR_PAGINA } from '@/server/consultas/pedidos';
import { cepDoClienteLogado, clientesParaSelecao, fichaCliente, fichaDoClienteLogado, listarClientes, vendedoresParaFormCliente } from '@/server/consultas/clientes';
import { listarVendedores, vendedoresAtivos, vendedoresDoResumo, vendedorParaEdicao } from '@/server/consultas/equipe';
import { listarProdutos, produtoParaEdicao } from '@/server/consultas/produtos';
import { vendasDoMes, vendasRecentes } from '@/server/consultas/vendas';
import { corDaMeta, indicadoresEstoque, metasDoMes, resultados, vendidoPorVendedor } from '@/server/relatorios';
import { intervaloDoMes, mesDe, somarMeses } from '@/lib/datas';
import { TOM } from '@/lib/marca';
import { comoUsuario, db } from './suporte/ajuda';

const n = (x: unknown) => Number(x ?? 0);

describe('escopo do vendedor', () => {
  it('pedidos: vendedor só vê os dele; gestor vê todos; as contagens batem', async () => {
    const ana = await comoUsuario('ana@dcerutti.local');
    const gestor = await comoUsuario('gestor@dcerutti.local');
    const daAna = await db.pedido.count({ where: { vendedorId: ana.id } });
    const r = await listarPedidos(ana, { status: 'todos', q: '', pagina: 100 });
    expect(r.total).toBe(daAna);
    expect(r.pedidos.every(p => p.vendedorId === ana.id)).toBe(true);
    expect((await listarPedidos(gestor, { status: 'todos', q: '', pagina: 1 })).total).toBe(await db.pedido.count());
    expect(await contarPendentes(ana)).toBe(await db.pedido.count({ where: { vendedorId: ana.id, status: 'pendente' } }));
    expect(r.contagens.reduce((a, c) => a + c._count, 0)).toBe(daAna);
  });

  it('pedidos: filtro por status, busca por código e por nome, paginação de 50', async () => {
    const gestor = await comoUsuario('gestor@dcerutti.local');
    const conf = await listarPedidos(gestor, { status: 'confirmado', q: '', pagina: 1 });
    expect(conf.pedidos.every(p => p.status === 'confirmado')).toBe(true);
    expect(conf.pedidos.length).toBe(Math.min(PEDIDOS_POR_PAGINA, conf.total));
    const qualquer = await db.pedido.findFirstOrThrow({ orderBy: { criadoEm: 'asc' } });
    expect((await listarPedidos(gestor, { status: 'todos', q: qualquer.codigo, pagina: 1 })).pedidos.map(p => p.codigo)).toEqual([qualquer.codigo]);
    const porNome = await listarPedidos(gestor, { status: 'todos', q: 'Mariana', pagina: 10 });
    expect(porNome.total).toBeGreaterThan(0);
    expect(porNome.pedidos.every(p => p.nomeCliente.includes('Mariana'))).toBe(true);
    const ordem = conf.pedidos.map(p => p.criadoEm.getTime());
    expect([...ordem].sort((a, b) => b - a)).toEqual(ordem);
  });

  it('pedido de outro vendedor: null para o vendedor, visível ao gestor; marca produtos inativos', async () => {
    const carlos = await comoUsuario('carlos@dcerutti.local');
    const gestor = await comoUsuario('gestor@dcerutti.local');
    const daAna = await db.pedido.findFirstOrThrow({ where: { vendedor: { email: 'ana@dcerutti.local' } } });
    expect(await pedidoParaEquipe(carlos, daAna.id)).toBeNull();
    const visto = await pedidoParaEquipe(gestor, daAna.id);
    expect(visto?.id).toBe(daAna.id);
    expect(visto!.produtosAtivos).toBeInstanceOf(Set);
    expect(await pedidoParaEquipe(gestor, 'nao-existe')).toBeNull();
  });

  it('clientes: escopo, sem fichas removidas, busca em vários campos, ordem por nome', async () => {
    const ana = await comoUsuario('ana@dcerutti.local');
    const gestor = await comoUsuario('gestor@dcerutti.local');
    const r = await listarClientes(ana, '', 10);
    expect(r.total).toBe(await db.cliente.count({ where: { vendedorId: ana.id, NOT: { telefone: '' } } }));
    expect(r.clientes.every(c => c.vendedorId === ana.id && c.telefone !== '')).toBe(true);
    // Ordem alfabética pela collation do banco: cada nome é >= o anterior segundo o próprio MariaDB.
    const ordemBanco = await db.cliente.findMany({ where: { vendedorId: ana.id, NOT: { telefone: '' } }, orderBy: { nome: 'asc' }, select: { nome: true } });
    expect(r.clientes.map(c => c.nome)).toEqual(ordemBanco.map(c => c.nome));
    expect((await listarClientes(gestor, '', 10)).clientes.some(c => c.nome === 'Cliente removido')).toBe(false);
    expect((await listarClientes(gestor, 'São Miguel', 10)).clientes.every(c => c.cidade === 'São Miguel do Oeste')).toBe(true);
    expect((await listarClientes(gestor, '99811-2233', 1)).clientes.map(c => c.nome)).toContain('Roberto Lima');
    expect((await listarClientes(gestor, '99811-2233', 1)).clientes.every(c => c.telefone.includes('99811-2233'))).toBe(true);
    const soma = r.vendasPorCliente.get(r.clientes[0].id);
    if (soma) expect(n(soma._sum.valor)).toBe(n((await db.venda.aggregate({ where: { clienteId: r.clientes[0].id }, _sum: { valor: true } }))._sum.valor));
  });

  it('ficha do cliente: dono e gestor veem; outro vendedor não; gestor recebe a lista de vendedores', async () => {
    const juliana = await db.cliente.findFirstOrThrow({ where: { nome: 'Juliana Ferreira' } });
    expect(await fichaCliente(await comoUsuario('carlos@dcerutti.local'), juliana.id)).toBeNull();
    const daAna = await fichaCliente(await comoUsuario('ana@dcerutti.local'), juliana.id);
    expect(daAna?.cliente.id).toBe(juliana.id);
    expect(daAna?.vendedores).toBeUndefined();
    const doGestor = await fichaCliente(await comoUsuario('gestor@dcerutti.local'), juliana.id);
    expect(doGestor!.vendedores!.every(v => v.id)).toBe(true);
    expect(doGestor!.vendedores!.some(v => v.name === 'Fábio Inativo')).toBe(false);
  });

  it('seleção de clientes e lista de vendedores do formulário', async () => {
    const ana = await comoUsuario('ana@dcerutti.local');
    const sel = await clientesParaSelecao(ana);
    expect(sel.length).toBeGreaterThan(0);
    expect(sel.every(c => c.telefone !== '')).toBe(true);
    expect(await vendedoresParaFormCliente(ana)).toBeUndefined();
    const lista = await vendedoresParaFormCliente(await comoUsuario('gestor@dcerutti.local'));
    expect(lista!.map(v => v.name)).not.toContain('Fábio Inativo');
  });

  it('dados do cliente logado', async () => {
    const mariana = await comoUsuario('cliente@dcerutti.local');
    expect(await cepDoClienteLogado(mariana)).toBe('89874-000');
    expect(await cepDoClienteLogado(await comoUsuario('ana@dcerutti.local'))).toBeNull();
    const ficha = await fichaDoClienteLogado(mariana);
    expect(ficha!.vendedor.name).toBe('Ana Paula');
    expect(ficha!.pedidos.every(p => p.clienteId === ficha!.id)).toBe(true);
  });

  it('vendas do mês: escopo e período', async () => {
    const ana = await comoUsuario('ana@dcerutti.local');
    const mes = somarMeses(mesDe(), -1);
    const v = await vendasDoMes(ana, mes);
    expect(v.length).toBe(await db.venda.count({ where: { vendedorId: ana.id, data: intervaloDoMes(mes) } }));
    expect(v.every(x => mesDe(x.data) === mes)).toBe(true);
    expect((await vendasRecentes(ana, mes, 3)).length).toBeLessThanOrEqual(3);
  });
});

describe('equipe e produtos (só gestor)', () => {
  it('consultas de gestor recusam vendedor', async () => {
    const ana = await comoUsuario('ana@dcerutti.local');
    expect(() => listarVendedores(ana)).toThrow('restrita ao gestor');
    await expect(listarProdutos(ana, { q: '', filtro: '', pagina: 1, porPagina: 10 })).rejects.toThrow('restrita ao gestor');
    await expect(produtoParaEdicao(ana, 1)).rejects.toThrow('restrita ao gestor');
    await expect(vendedorParaEdicao(ana, ana.id)).rejects.toThrow('restrita ao gestor');
  });

  it('vendedores: ativos primeiro; inativo aparece só na lista do gestor; resumo do vendedor só ele', async () => {
    const gestor = await comoUsuario('gestor@dcerutti.local');
    const lista = await listarVendedores(gestor);
    expect(lista.at(-1)!.ativo).toBe(false);
    expect((await vendedoresAtivos()).map(v => v.name)).not.toContain('Fábio Inativo');
    const ana = await comoUsuario('ana@dcerutti.local');
    expect((await vendedoresDoResumo(ana)).map(v => v.id)).toEqual([ana.id]);
    const ed = await vendedorParaEdicao(gestor, ana.id);
    expect(ed!.vendedor._count.pedidos).toBe(await db.pedido.count({ where: { vendedorId: ana.id, status: 'pendente' } }));
    expect(ed!.outros.map(o => o.id)).not.toContain(ana.id);
    expect(await vendedorParaEdicao(gestor, gestor.id), 'gestor não é vendedor').toBeNull();
  });

  it('produtos: filtros sem foto, sem custo, esgotados, inativos e busca por código interno', async () => {
    const gestor = await comoUsuario('gestor@dcerutti.local');
    const f = (filtro: string, q = '') => listarProdutos(gestor, { q, filtro, pagina: 100, porPagina: 50 });
    expect((await f('sem-foto')).produtos.every(p => p.imagens.length === 0)).toBe(true);
    expect((await f('sem-foto')).total).toBe(await db.produto.count({ where: { imagens: { none: {} } } }));
    expect((await f('sem-custo')).produtos.every(p => p.custo === null)).toBe(true);
    expect((await f('esgotados')).produtos.every(p => p.variantes.every(v => v.estoque <= 0))).toBe(true);
    expect((await f('inativos')).produtos.every(p => !p.ativo)).toBe(true);
    const codigo = (await db.variante.findFirstOrThrow({ where: { produto: { referencia: 'FIX-PROMO' } } })).codigoInterno!;
    expect((await f('', codigo)).produtos.map(p => p.referencia)).toEqual(['FIX-PROMO']);
    expect((await f('', 'fix-promo')).produtos.map(p => p.referencia)).toContain('FIX-PROMO');
  });

  it('produto para edição traz histórico (no máximo 30, mais novo primeiro) e quem movimentou', async () => {
    const gestor = await comoUsuario('gestor@dcerutti.local');
    const p = await db.produto.findFirstOrThrow({ where: { referencia: 'FIX-ESTOQUE' } });
    const r = await produtoParaEdicao(gestor, p.id);
    expect(r!.movimentos.length).toBeGreaterThan(0);
    expect(r!.movimentos.length).toBeLessThanOrEqual(30);
    expect(r!.movimentos[0].usuario?.name).toBeTruthy();
    expect(await produtoParaEdicao(gestor, 999_999)).toBeNull();
  });
});

describe('relatórios', () => {
  it('meta vigente: a do mês, ou a mais recente anterior; sem meta = ausente', async () => {
    const ids = Object.fromEntries((await db.user.findMany({ where: { papel: 'vendedor' } })).map(u => [u.email.split('@')[0], u.id]));
    const mes = mesDe();
    const m = await metasDoMes(Object.values(ids), mes);
    const doMes = await db.meta.findUniqueOrThrow({ where: { vendedorId_mes: { vendedorId: ids.ana, mes } } });
    expect(m.get(ids.ana)).toBe(n(doMes.valor));
    expect(m.has(ids.diego), 'Diego nunca teve meta').toBe(false);
    const antiga = await db.meta.findFirstOrThrow({ where: { vendedorId: ids.elisa }, orderBy: { mes: 'desc' } });
    expect(antiga.mes < mes).toBe(true);
    expect(m.get(ids.elisa), 'Elisa usa a meta antiga').toBe(n(antiga.valor));
    expect(m.get(ids.beatriz)).toBe(0);
  });

  it('vendido por vendedor no mês confere com SQL', async () => {
    for (const k of [0, -1, -2]) {
      const mes = somarMeses(mesDe(), k);
      const r = await vendidoPorVendedor(mes);
      const { gte, lt } = intervaloDoMes(mes);
      const sql = await db.$queryRaw<{ vendedorId: string; total: unknown; n: bigint }[]>`SELECT vendedorId, SUM(valor) total, COUNT(*) n FROM venda WHERE data >= ${gte} AND data < ${lt} GROUP BY vendedorId`;
      for (const s of sql) expect(r.get(s.vendedorId), mes).toEqual({ valor: n(s.total), n: Number(s.n) });
      expect(r.size).toBe(sql.length);
    }
  });

  it('cor da meta', () => {
    expect(corDaMeta(100)).toBe(TOM.bom);
    expect(corDaMeta(60)).toBe(TOM.atencao);
    expect(corDaMeta(59.9)).toBe(TOM.ruim);
  });

  it('resultados de todo o período conferem com o banco', async () => {
    const r = await resultados({ rotulo: 'tudo' });
    const vendas = await db.venda.findMany();
    expect(r.vendas).toBe(vendas.length);
    expect(r.receita).toBeCloseTo(vendas.reduce((a, v) => a + n(v.valor), 0), 2);
    expect(r.manuais).toBe(vendas.filter(v => !v.pedidoId).length);
    expect(r.semCusto).toBe(vendas.filter(v => v.custo == null).length);
    const comCusto = vendas.filter(v => v.custo != null);
    expect(r.custo).toBeCloseTo(comCusto.reduce((a, v) => a + n(v.custo), 0), 2);
    expect(r.lucro).toBeCloseTo(comCusto.reduce((a, v) => a + n(v.valor) - n(v.custo), 0), 2);
    const vendidos = await db.pedidoItem.aggregate({ where: { situacao: 'vendido', pedido: { status: 'confirmado' } }, _sum: { quantidade: true } });
    expect(r.pecas).toBe(vendidos._sum.quantidade);
    expect(r.porVendedor.reduce((a, g) => a + g.receita, 0)).toBeCloseTo(r.receita, 2);
    expect(r.porCategoria.reduce((a, g) => a + g.n, 0)).toBe(r.pecas);
    expect(r.porProduto.length).toBeLessThanOrEqual(10);
    expect(r.porVendedor.some(g => g.nome === 'Fábio Inativo'), 'vendedor que saiu continua no histórico').toBe(true);
    const lucros = r.porCategoria.map(g => g.lucro);
    expect([...lucros].sort((a, b) => b - a)).toEqual(lucros);
  });

  it('resultados de um mês só contam aquele mês', async () => {
    const mes = somarMeses(mesDe(), -1);
    const r = await resultados({ rotulo: mes, data: intervaloDoMes(mes) });
    expect(r.vendas).toBe(await db.venda.count({ where: { data: intervaloDoMes(mes) } }));
  });

  it('indicadores do estoque conferem com o banco', async () => {
    const r = await indicadoresEstoque();
    const prods = await db.produto.findMany({ where: { ativo: true }, include: { variantes: true, custo: true, imagens: true } });
    let pecas = 0, aVenda = 0, aCusto = 0;
    for (const p of prods) {
      const q = p.variantes.reduce((a, v) => a + Math.max(0, v.estoque), 0);
      pecas += q; aVenda += q * n(p.preco); if (p.custo) aCusto += q * n(p.custo.valor);
    }
    expect(r.modelos).toBe(prods.length);
    expect(r.pecas).toBe(pecas);
    expect(r.aVenda).toBeCloseTo(aVenda, 2);
    expect(r.aCusto).toBeCloseTo(aCusto, 2);
    expect(r.semCusto).toBe(prods.filter(p => !p.custo).length);
    expect(r.semFoto).toBe(prods.filter(p => !p.imagens.length).length);
  });
});
