/**
 * Invariantes do banco depois do seed completo, que foi gerado pelas regras do próprio sistema
 * (criarPedido, confirmarPedido, cancelarPedido, movimentar). Se uma regra quebrar, os números param de bater.
 * Roda primeiro (tests/integracao/suporte/ordem.ts), com o banco recém-semeado; pulado com INTEGRACAO_SEM_PREPARO=1.
 * As regras que valem em qualquer momento são conferidas de novo no fim, em zz-invariantes-finais.test.ts.
 */
import { describe as describeBase, expect, it } from 'vitest';

const describe = describeBase.skipIf(process.env.INTEGRACAO_SEM_PREPARO === '1');
import { db } from './suporte/ajuda';
import { lerConfig, CONFIG_PADRAO } from '@/server/config';

const n = (x: unknown) => Number(x ?? 0);
const centavos = (x: number) => Math.round(x * 100);

describe('seed completo: cobertura', () => {
  it('todas as tabelas têm dados', async () => {
    const contagens = {
      user: await db.user.count(), account: await db.account.count(), cliente: await db.cliente.count(), meta: await db.meta.count(),
      marca: await db.marca.count(), categoria: await db.categoria.count(), produto: await db.produto.count(), imagem: await db.produtoImagem.count(),
      variante: await db.variante.count(), custo: await db.custo.count(), movimento: await db.movimentoEstoque.count(), pedido: await db.pedido.count(),
      item: await db.pedidoItem.count(), venda: await db.venda.count(), configuracao: await db.configuracao.count(), contador: await db.contador.count(),
    };
    for (const [tabela, total] of Object.entries(contagens)) expect(total, tabela).toBeGreaterThan(0);
    expect(contagens.produto).toBeGreaterThanOrEqual(200);
    expect(contagens.pedido).toBeGreaterThanOrEqual(300);
    expect(contagens.cliente).toBeGreaterThanOrEqual(150);
  });

  it('todas as combinações de tipo, origem e status de pedido existem', async () => {
    const g = await db.pedido.groupBy({ by: ['tipo', 'status'], _count: true });
    for (const tipo of ['compra', 'condicional'] as const)
      for (const status of ['pendente', 'confirmado', 'cancelado'] as const)
        expect(g.find(x => x.tipo === tipo && x.status === status)?._count ?? 0, `${tipo}/${status}`).toBeGreaterThan(0);
    const origens = await db.pedido.groupBy({ by: ['origem'], _count: true });
    expect(origens.map(o => o.origem).sort()).toEqual(['balcao', 'loja', 'vendedor']);
    const motivos = await db.pedido.groupBy({ by: ['motivoCancelamento'], where: { status: 'cancelado' }, _count: true });
    expect(motivos.map(m => m.motivoCancelamento).sort()).toEqual(['cliente', 'equipe', 'expirado']);
  });

  it('variações do catálogo e da equipe existem', async () => {
    expect(await db.produto.count({ where: { ativo: false } })).toBeGreaterThan(0);
    expect(await db.produto.count({ where: { imagens: { none: {} } } })).toBeGreaterThan(0);
    expect(await db.produto.count({ where: { custo: { is: null } } })).toBeGreaterThan(0);
    expect(await db.produto.count({ where: { variantes: { none: { estoque: { gt: 0 } } } } })).toBeGreaterThan(0);
    expect(await db.produto.count({ where: { imperdivel: true } })).toBeGreaterThan(0);
    const promo = await db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) n FROM produto WHERE precoCheio > preco`;
    expect(Number(promo[0].n)).toBeGreaterThan(0);
    for (const g of ['feminino', 'masculino', 'unissex'] as const) expect(await db.produto.count({ where: { genero: g } })).toBeGreaterThan(0);
    for (const e of ['inverno', 'verao', null] as const) expect(await db.produto.count({ where: { estacao: e } })).toBeGreaterThan(0);
    expect(await db.user.count({ where: { papel: 'vendedor', ativo: false } })).toBeGreaterThan(0);
    expect(await db.user.count({ where: { papel: 'gestor' } })).toBeGreaterThanOrEqual(2);
    expect(await db.user.count({ where: { papel: 'cliente', aceitouPrivacidadeEm: null } })).toBeGreaterThan(0);
    expect(await db.cliente.count({ where: { telefone: '' } })).toBeGreaterThan(0);
    expect(await db.venda.count({ where: { pedidoId: null } })).toBeGreaterThan(0);
    expect(await db.movimentoEstoque.count({ where: { motivo: 'ajuste' } })).toBeGreaterThan(0);
  });
});

describe('invariantes de estoque', () => {
  it('estoque e reserva nunca negativos, e a reserva nunca passa do estoque', async () => {
    const ruins = await db.$queryRaw<{ id: number }[]>`SELECT id FROM variante WHERE estoque < 0 OR reservado < 0 OR reservado > estoque`;
    expect(ruins).toEqual([]);
  });

  it('a reserva de cada tamanho é exatamente o que está em condicionais pendentes', async () => {
    const diferentes = await db.$queryRaw<{ id: number; reservado: number; emAberto: number }[]>`
      SELECT v.id, v.reservado, COALESCE(SUM(CASE WHEN p.status = 'pendente' AND p.tipo = 'condicional' THEN i.quantidade END), 0) AS emAberto
      FROM variante v
      LEFT JOIN pedido_item i ON i.varianteId = v.id
      LEFT JOIN pedido p ON p.id = i.pedidoId
      GROUP BY v.id, v.reservado
      HAVING v.reservado <> emAberto`;
    expect(diferentes).toEqual([]);
  });

  it('o estoque de cada tamanho é a soma do seu histórico de movimentos', async () => {
    const diferentes = await db.$queryRaw<{ id: number }[]>`
      SELECT v.id FROM variante v LEFT JOIN movimento_estoque m ON m.varianteId = v.id
      GROUP BY v.id, v.estoque HAVING v.estoque <> COALESCE(SUM(m.delta), 0)`;
    expect(diferentes).toEqual([]);
  });

  it('movimentos de venda são negativos e apontam para um pedido confirmado', async () => {
    const vendas = await db.movimentoEstoque.findMany({ where: { motivo: 'venda' }, include: { pedido: { select: { status: true } } } });
    expect(vendas.length).toBeGreaterThan(0);
    for (const m of vendas) {
      expect(m.delta).toBeLessThan(0);
      expect(m.pedido?.status).toBe('confirmado');
    }
  });
});

describe('invariantes de pedidos e vendas', () => {
  it('datas e motivo batem com o status', async () => {
    for (const p of await db.pedido.findMany({ select: { status: true, confirmadoEm: true, canceladoEm: true, motivoCancelamento: true, codigo: true } })) {
      if (p.status === 'pendente') expect([p.confirmadoEm, p.canceladoEm, p.motivoCancelamento], p.codigo).toEqual([null, null, null]);
      if (p.status === 'confirmado') expect(p.confirmadoEm, p.codigo).not.toBeNull();
      if (p.status === 'cancelado') {
        expect(p.canceladoEm, p.codigo).not.toBeNull();
        expect(['equipe', 'cliente', 'expirado']).toContain(p.motivoCancelamento);
      }
    }
  });

  it('códigos seguem o padrão do tipo, são únicos e o contador está à frente', async () => {
    const pedidos = await db.pedido.findMany({ select: { codigo: true, tipo: true } });
    for (const p of pedidos) expect(p.codigo).toMatch(p.tipo === 'condicional' ? /^COND-\d{6}$/ : /^PED-\d{6}$/);
    expect(new Set(pedidos.map(p => p.codigo)).size).toBe(pedidos.length);
    for (const nome of ['PED', 'COND']) {
      const maior = Math.max(...pedidos.filter(p => p.codigo.startsWith(`${nome}-`)).map(p => Number(p.codigo.slice(-6))));
      expect((await db.contador.findUniqueOrThrow({ where: { nome } })).valor).toBeGreaterThanOrEqual(maior);
    }
  });

  it('o total do pedido é a soma das linhas (inclusive depois de dividir um condicional parcial)', async () => {
    const pedidos = await db.pedido.findMany({ include: { itens: true } });
    for (const p of pedidos) {
      const soma = p.itens.reduce((a, i) => a + n(i.precoUnitario) * i.quantidade, 0);
      expect(centavos(soma), p.codigo).toBe(centavos(n(p.total)));
    }
  });

  it('situação dos itens bate com o status do pedido', async () => {
    const pedidos = await db.pedido.findMany({ include: { itens: { select: { situacao: true } } } });
    for (const p of pedidos) {
      const s = new Set(p.itens.map(i => i.situacao));
      if (p.status === 'pendente' || p.status === 'cancelado') expect([...s], p.codigo).toEqual(['pendente']);
      if (p.status === 'confirmado') expect(s.has('pendente'), p.codigo).toBe(false);
      if (p.status === 'confirmado' && p.tipo === 'compra') expect([...s], p.codigo).toEqual(['vendido']);
    }
  });

  it('cada pedido confirmado com peças vendidas tem uma venda com o valor e o custo das peças', async () => {
    const pedidos = await db.pedido.findMany({ where: { status: 'confirmado' }, include: { itens: true, venda: true } });
    let parciais = 0;
    for (const p of pedidos) {
      const vendidos = p.itens.filter(i => i.situacao === 'vendido');
      if (p.itens.some(i => i.situacao === 'devolvido') && vendidos.length) parciais++;
      if (!vendidos.length) {
        expect(p.venda, `${p.codigo} sem peças vendidas não gera venda`).toBeNull();
        continue;
      }
      expect(p.venda, p.codigo).not.toBeNull();
      expect(centavos(n(p.venda!.valor)), p.codigo).toBe(centavos(vendidos.reduce((a, i) => a + n(i.precoUnitario) * i.quantidade, 0)));
      expect(p.venda!.vendedorId).toBe(p.vendedorId);
      expect(p.venda!.clienteId).toBe(p.clienteId);
      const comCusto = vendidos.filter(i => i.custoUnitario != null);
      if (!comCusto.length) expect(p.venda!.custo, p.codigo).toBeNull();
      else expect(centavos(n(p.venda!.custo)), p.codigo).toBe(centavos(comCusto.reduce((a, i) => a + n(i.custoUnitario) * i.quantidade, 0)));
    }
    expect(parciais, 'há condicionais fechados com parte das peças').toBeGreaterThan(0);
  });

  it('pedidos não confirmados nunca têm venda', async () => {
    expect(await db.venda.count({ where: { pedido: { status: { not: 'confirmado' } } } })).toBe(0);
  });

  it('frete: condicional e seleção do vendedor ficam a combinar; compra da loja segue a regra', async () => {
    expect(await db.pedido.count({ where: { tipo: 'condicional', NOT: { frete: null } } })).toBe(0);
    expect(await db.pedido.count({ where: { origem: { in: ['vendedor', 'balcao'] }, NOT: { frete: null } } })).toBe(0);
    const comRegra = await db.pedido.findMany({ where: { origem: 'loja', tipo: 'compra', NOT: { frete: null } } });
    expect(comRegra.length).toBeGreaterThan(0);
    for (const p of comRegra) expect(n(p.frete), p.codigo).toBe(n(p.total) >= 299 ? 0 : 24.9);
  });

  it('o pedido guarda o nome e o telefone do cliente, e o vendedor é da equipe', async () => {
    const pedidos = await db.pedido.findMany({ include: { cliente: true, vendedor: true } });
    for (const p of pedidos) {
      expect(p.nomeCliente, p.codigo).toBe(p.cliente.nome);
      expect(['vendedor', 'gestor']).toContain(p.vendedor.papel);
    }
  });
});

describe('invariantes de cadastro', () => {
  it('todo cliente é atendido por um vendedor (nunca por gestor ou cliente)', async () => {
    const clientes = await db.cliente.findMany({ include: { vendedor: { select: { papel: true } } } });
    for (const c of clientes) expect(c.vendedor.papel, c.nome).toBe('vendedor');
  });

  it('toda conta tem credencial e e-mail em minúsculas', async () => {
    for (const u of await db.user.findMany({ include: { accounts: true } })) {
      expect(u.email).toBe(u.email.toLowerCase());
      expect(u.accounts.filter(a => a.providerId === 'credential'), u.email).toHaveLength(1);
    }
  });

  it('as configurações gravadas são válidas (nenhuma cai no padrão por erro)', async () => {
    const cfg = await lerConfig();
    expect(cfg.whatsappLoja).toMatch(/^\d{10,13}$/);
    expect(cfg.cepsCondicional.length).toBeGreaterThan(0);
    expect(cfg.diasExpiracao).toBe(7);
    expect(cfg.frete).toBeNull();
    expect(cfg.vendedorPadraoId).not.toBe(CONFIG_PADRAO.vendedorPadraoId);
  });
});
