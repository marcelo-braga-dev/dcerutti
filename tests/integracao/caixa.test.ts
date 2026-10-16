/** Caixa da loja física (D-23): venda no balcão com e sem cliente, descontos, pagamentos, cadastro rápido e fechamento. */
import { beforeEach, describe, expect, it } from 'vitest';
import { cadastrarClienteCaixa, registrarVendaCaixa } from '@/server/acoes/caixa';
import { vendasDoCaixa } from '@/server/consultas/caixa';
import { clientePorEmail, comoUsuario, db, entrarComo, produtoDeTeste, usuarioPorEmail, variante } from './suporte/ajuda';
import { depoisDaResposta } from './suporte/next';

beforeEach(() => entrarComo(null));

const unico = () => `9${String(Date.now()).slice(-8)}`;

describe('venda no caixa', () => {
  it('sem cliente: vai para "Consumidor final", confirma, baixa o estoque e grava os pagamentos', async () => {
    await entrarComo('ana@dcerutti.local');
    const { v } = await produtoDeTeste({ estoque: { M: 5 }, preco: 100 });
    const r = await registrarVendaCaixa({ linhas: [{ varianteId: v.M, quantidade: 2 }], pagamentos: [{ forma: 'pix', valor: 120 }, { forma: 'dinheiro', valor: 80, recebido: 100 }] });
    expect(r).toMatchObject({ ok: true, total: 200, troco: 20, telefone: null });
    if (!r.ok) return;
    const p = await db.pedido.findUniqueOrThrow({ where: { id: r.pedidoId }, include: { pagamentos: true, venda: true, cliente: true } });
    expect(p).toMatchObject({ origem: 'balcao', status: 'confirmado', nomeCliente: 'Consumidor final', telefoneCliente: '' });
    expect(p.cliente.telefone).toBe('');
    expect(p.pagamentos.map(g => [g.forma, Number(g.valor), g.recebido == null ? null : Number(g.recebido)])).toEqual([['pix', 120, null], ['dinheiro', 80, 100]]);
    expect(p.venda).toMatchObject({ vendedorId: (await usuarioPorEmail('ana@dcerutti.local')).id, observacao: 'Caixa da loja' });
    expect((await variante(v.M)).estoque).toBe(3);
    expect(r.comprovante).toContain(`Comprovante ${r.codigo}`);
    await depoisDaResposta();
  });

  it('desconto do vendedor: dentro do limite passa e vai para o preço da linha; acima, só o gestor', async () => {
    const { v } = await produtoDeTeste({ estoque: { M: 5 }, preco: 100 });
    await entrarComo('ana@dcerutti.local');
    const ok = await registrarVendaCaixa({ linhas: [{ varianteId: v.M, quantidade: 1, precoCombinado: 90 }], pagamentos: [{ forma: 'debito', valor: 90 }] });
    expect(ok).toMatchObject({ ok: true, total: 90 });
    const item = ok.ok ? await db.pedidoItem.findFirstOrThrow({ where: { pedidoId: ok.pedidoId } }) : null;
    expect(Number(item?.precoUnitario)).toBe(90);
    expect(Number(item?.precoTabela)).toBe(100);

    const acima = await registrarVendaCaixa({ linhas: [{ varianteId: v.M, quantidade: 1 }], descontoGeral: { tipo: 'percentual', valor: 25 }, pagamentos: [{ forma: 'pix', valor: 75 }] });
    expect(acima).toMatchObject({ ok: false, erro: expect.stringMatching(/só o gestor/) });

    await entrarComo('gestor@dcerutti.local');
    expect(await registrarVendaCaixa({ linhas: [{ varianteId: v.M, quantidade: 1 }], descontoGeral: { tipo: 'percentual', valor: 25 }, pagamentos: [{ forma: 'pix', valor: 75 }] }))
      .toMatchObject({ ok: false, erro: expect.stringMatching(/Vendido por/) });
    const ana = await usuarioPorEmail('ana@dcerutti.local');
    expect(await registrarVendaCaixa({ linhas: [{ varianteId: v.M, quantidade: 1 }], descontoGeral: { tipo: 'percentual', valor: 25 }, pagamentos: [{ forma: 'pix', valor: 75 }], vendedorId: ana.id }))
      .toMatchObject({ ok: true, total: 75 });
    await depoisDaResposta();
  });

  it('pagamento que não fecha o total: nada é confirmado e o estoque fica como estava', async () => {
    await entrarComo('ana@dcerutti.local');
    const { v } = await produtoDeTeste({ estoque: { M: 2 }, preco: 100 });
    const r = await registrarVendaCaixa({ linhas: [{ varianteId: v.M, quantidade: 1 }], pagamentos: [{ forma: 'pix', valor: 50 }] });
    expect(r).toMatchObject({ ok: false, total: 100 });
    expect((await variante(v.M)).estoque).toBe(2);
    expect(await db.pedido.count({ where: { itens: { some: { varianteId: v.M } }, status: 'confirmado' } })).toBe(0);
  });

  it('recusas: crédito acima das parcelas, peça sem estoque e cliente de outro vendedor', async () => {
    await entrarComo('ana@dcerutti.local');
    const { v } = await produtoDeTeste({ estoque: { M: 1 }, preco: 60 });
    expect(await registrarVendaCaixa({ linhas: [{ varianteId: v.M, quantidade: 1 }], pagamentos: [{ forma: 'credito', valor: 60, parcelas: 13 }] })).toMatchObject({ ok: false, erro: expect.stringMatching(/até 6x/) });
    expect(await registrarVendaCaixa({ linhas: [{ varianteId: v.M, quantidade: 2 }], pagamentos: [{ forma: 'pix', valor: 120 }] })).toMatchObject({ ok: false });
    const deCarlos = await clientePorEmail('cliente.carlos@dcerutti.local');
    expect(await registrarVendaCaixa({ linhas: [{ varianteId: v.M, quantidade: 1 }], clienteId: deCarlos.id, pagamentos: [{ forma: 'pix', valor: 60 }] }))
      .toMatchObject({ ok: false, erro: expect.stringMatching(/Cliente não encontrada/) });
  });

  it('cadastro rápido: cria a ficha do vendedor; WhatsApp de cliente de outro vendedor é recusado; venda identificada', async () => {
    await entrarComo('ana@dcerutti.local');
    const fone = `(49) ${unico().slice(0, 5)}-${unico().slice(-4)}`;
    const c = await cadastrarClienteCaixa({ nome: 'Cliente do Balcão', telefone: fone });
    expect(c).toMatchObject({ ok: true, existente: false });
    if (!c.ok) return;
    expect(await cadastrarClienteCaixa({ nome: 'Outra', telefone: fone })).toMatchObject({ ok: true, existente: true });
    const deCarlos = await clientePorEmail('cliente.carlos@dcerutti.local');
    expect(await cadastrarClienteCaixa({ nome: 'Outra', telefone: deCarlos.telefone })).toMatchObject({ ok: false, erro: expect.stringMatching(/já é cliente de/) });

    const { v } = await produtoDeTeste({ estoque: { M: 2 }, preco: 80 });
    const r = await registrarVendaCaixa({ linhas: [{ varianteId: v.M, quantidade: 1 }], clienteId: c.cliente.id, pagamentos: [{ forma: 'credito', valor: 80, parcelas: 3 }] });
    expect(r).toMatchObject({ ok: true, nomeCliente: 'Cliente do Balcão', telefone: c.cliente.telefone });
    await depoisDaResposta();
  });

  it('vendas do dia: totais por forma e por vendedor; o vendedor só vê as dele', async () => {
    const ana = await comoUsuario('ana@dcerutti.local');
    const dia = await vendasDoCaixa(ana);
    expect(dia.vendas).toBeGreaterThan(0);
    expect(dia.porForma.reduce((a, f) => a + f.valor, 0)).toBeCloseTo(dia.pedidos.filter(p => p.status === 'confirmado').reduce((a, p) => a + p.pagamentos.reduce((b, g) => b + Number(g.valor), 0), 0), 2);
    expect(dia.porVendedor.every(v => v.nome === ana.name)).toBe(true);
    expect((await vendasDoCaixa(await comoUsuario('carlos@dcerutti.local'))).pedidos.some(p => p.vendedor.name === ana.name)).toBe(false);
  });
});
