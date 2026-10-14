/** Ciclo de vida do pedido (src/server/pedidos.ts): criar, confirmar (inteiro e parcial), editar, cancelar, corridas. */
import { describe, expect, it } from 'vitest';
import { cancelarPedido, confirmarPedido, criarPedido, editarPedido, ErroPedido, normalizarLinhas } from '@/server/pedidos';
import { catalogo } from '@/server/catalogo';
import { clientePorNome, db, produtoDeTeste, usuarioPorEmail, variante } from './suporte/ajuda';

async function base() {
  const cliente = await clientePorNome('Juliana Ferreira');
  return { clienteId: cliente.id, vendedorId: cliente.vendedorId, nomeCliente: cliente.nome, telefoneCliente: cliente.telefone };
}
const itensDe = (pedidoId: string) => db.pedidoItem.findMany({ where: { pedidoId }, orderBy: { id: 'asc' } });

describe('normalizarLinhas', () => {
  it('junta tamanhos repetidos, descarta quantidades inválidas e limita a 20 por tamanho', () => {
    expect(normalizarLinhas([{ varianteId: 1, quantidade: 2 }, { varianteId: 1, quantidade: 3 }, { varianteId: 2, quantidade: 0 }, { varianteId: 3, quantidade: 50 }]))
      .toEqual([{ varianteId: 1, quantidade: 5 }, { varianteId: 3, quantidade: 20 }]);
    expect(normalizarLinhas([{ varianteId: 4, quantidade: 1.9 }])).toEqual([{ varianteId: 4, quantidade: 1 }]);
  });
  it('sacola vazia ou com tamanhos demais é recusada', () => {
    expect(() => normalizarLinhas([])).toThrow('A sacola está vazia.');
    expect(() => normalizarLinhas([{ varianteId: 1.5, quantidade: 1 }])).toThrow(ErroPedido);
    expect(() => normalizarLinhas(Array.from({ length: 41 }, (_, i) => ({ varianteId: i + 1, quantidade: 1 })))).toThrow(/peças demais/);
  });
});

describe('criar pedido', () => {
  it('compra: usa o preço do banco, não reserva e grava a cópia da peça', async () => {
    const { v, produto } = await produtoDeTeste({ estoque: { P: 3, M: 3 }, preco: 89.9 });
    const p = await criarPedido({ ...(await base()), tipo: 'compra', origem: 'loja', linhas: [{ varianteId: v.P, quantidade: 2 }, { varianteId: v.M, quantidade: 1 }] });
    expect(p.codigo).toMatch(/^PED-\d{6}$/);
    expect(p.total).toBeCloseTo(269.7, 2);
    expect(p.frete).toBeNull();
    expect((await variante(v.P)).reservado).toBe(0);
    const itens = await itensDe(p.id);
    expect(itens.map(i => [i.tamanho, i.quantidade, Number(i.precoUnitario), i.situacao, i.referencia, i.nome])).toEqual([
      ['P', 2, 89.9, 'pendente', produto.referencia, produto.nome],
      ['M', 1, 89.9, 'pendente', produto.referencia, produto.nome],
    ]);
  });

  it('condicional: reserva as peças na hora e usa o código COND', async () => {
    const { v } = await produtoDeTeste({ estoque: { M: 4 } });
    const p = await criarPedido({ ...(await base()), tipo: 'condicional', origem: 'loja', cep: '89874-000', linhas: [{ varianteId: v.M, quantidade: 3 }] });
    expect(p.codigo).toMatch(/^COND-\d{6}$/);
    expect(await variante(v.M)).toMatchObject({ estoque: 4, reservado: 3 });
    expect((await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).cep).toBe('89874-000');
  });

  it('frete: sem regra fica a combinar; abaixo do mínimo cobra; acima é grátis; mínimo 0 = sempre cobra', async () => {
    const { v } = await produtoDeTeste({ estoque: { M: 50 }, preco: 100 });
    const regra = { valor: 24.9, gratisAcima: 299 };
    const b = await base();
    const c = (q: number, r: typeof regra | null) => criarPedido({ ...b, tipo: 'compra', origem: 'loja', linhas: [{ varianteId: v.M, quantidade: q }], regraFrete: r });
    expect((await c(1, null)).frete).toBeNull();
    expect((await c(2, regra)).frete).toBe(24.9);
    expect((await c(3, regra)).frete).toBe(0);
    expect((await c(9, { valor: 15, gratisAcima: 0 })).frete).toBe(15);
    const cond = await criarPedido({ ...b, tipo: 'condicional', origem: 'loja', linhas: [{ varianteId: v.M, quantidade: 1 }], regraFrete: regra });
    expect(cond.frete, 'condicional nunca tem frete').toBeNull();
  });

  it('recusa peça indisponível, inativa ou inexistente e não grava nada', async () => {
    const { v } = await produtoDeTeste({ estoque: { M: 1 } });
    const { v: vi } = await produtoDeTeste({ estoque: { M: 5 }, ativo: false });
    const antes = await db.pedido.count();
    await expect(criarPedido({ ...(await base()), tipo: 'compra', origem: 'loja', linhas: [{ varianteId: v.M, quantidade: 2 }] })).rejects.toThrow(/1 disponível/);
    await expect(criarPedido({ ...(await base()), tipo: 'compra', origem: 'loja', linhas: [{ varianteId: vi.M, quantidade: 1 }] })).rejects.toThrow(/não está mais disponível/);
    await expect(criarPedido({ ...(await base()), tipo: 'compra', origem: 'loja', linhas: [{ varianteId: 999_999_999, quantidade: 1 }] })).rejects.toThrow(ErroPedido);
    expect(await db.pedido.count()).toBe(antes);
  });

  it('peça reservada em condicional não está disponível para outro pedido', async () => {
    const { v } = await produtoDeTeste({ estoque: { M: 2 } });
    await criarPedido({ ...(await base()), tipo: 'condicional', origem: 'loja', linhas: [{ varianteId: v.M, quantidade: 2 }] });
    await expect(criarPedido({ ...(await base()), tipo: 'compra', origem: 'loja', linhas: [{ varianteId: v.M, quantidade: 1 }] })).rejects.toThrow(/0 disponível/);
  });

  it('códigos sequenciais mesmo com pedidos simultâneos', async () => {
    const { v } = await produtoDeTeste({ estoque: { M: 100 } });
    const b = await base();
    const ps = await Promise.all(Array.from({ length: 10 }, () => criarPedido({ ...b, tipo: 'compra', origem: 'loja', linhas: [{ varianteId: v.M, quantidade: 1 }] })));
    const numeros = ps.map(p => Number(p.codigo.slice(-6))).sort((a, b) => a - b);
    expect(new Set(numeros).size).toBe(10);
    expect(numeros.at(-1)! - numeros[0]).toBe(9);
  });

  it('condicionais simultâneos pela última peça: só um é criado', async () => {
    const { v } = await produtoDeTeste({ estoque: { U: 1 } });
    const b = await base();
    const r = await Promise.allSettled(Array.from({ length: 4 }, () => criarPedido({ ...b, tipo: 'condicional', origem: 'loja', linhas: [{ varianteId: v.U, quantidade: 1 }] })));
    expect(r.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    expect((await variante(v.U)).reservado).toBe(1);
  });

  it('o catálogo em memória já mostra a reserva logo depois do pedido', async () => {
    const { v, ref } = await produtoDeTeste({ estoque: { M: 5 } });
    await catalogo();
    await criarPedido({ ...(await base()), tipo: 'condicional', origem: 'loja', linhas: [{ varianteId: v.M, quantidade: 2 }] });
    const p = (await catalogo()).find(x => x.referencia === ref)!;
    expect(p.variantes.find(x => x.tamanho === 'M')!.disponivel).toBe(3);
  });
});

describe('confirmar pedido', () => {
  it('compra: baixa o estoque, grava custo do momento e cria a venda do vendedor', async () => {
    const { v, produto } = await produtoDeTeste({ estoque: { M: 5 }, preco: 120, custo: 50 });
    const b = await base();
    const p = await criarPedido({ ...b, tipo: 'compra', origem: 'loja', linhas: [{ varianteId: v.M, quantidade: 2 }] });
    await db.custo.update({ where: { produtoId: produto.id }, data: { valor: 55 } }); // muda antes de confirmar: vale o do momento
    const gestor = await usuarioPorEmail('gestor@dcerutti.local');
    await confirmarPedido(p.id, {}, gestor.id);
    expect((await variante(v.M)).estoque).toBe(3);
    const ped = await db.pedido.findUniqueOrThrow({ where: { id: p.id }, include: { itens: true, venda: true } });
    expect(ped.status).toBe('confirmado');
    expect(ped.confirmadoEm).toBeInstanceOf(Date);
    expect(ped.itens.map(i => [i.situacao, Number(i.custoUnitario)])).toEqual([['vendido', 55]]);
    expect(ped.venda).toMatchObject({ vendedorId: b.vendedorId, clienteId: b.clienteId });
    expect(Number(ped.venda!.valor)).toBe(240);
    expect(Number(ped.venda!.custo)).toBe(110);
    expect(ped.venda!.observacao).toBe(`Pedido ${p.codigo}`);
    const mov = await db.movimentoEstoque.findFirstOrThrow({ where: { pedidoId: p.id } });
    expect(mov).toMatchObject({ delta: -2, motivo: 'venda', usuarioId: gestor.id, observacao: p.codigo });
  });

  it('produto sem custo: venda sem custo (não inventa lucro)', async () => {
    const { v } = await produtoDeTeste({ estoque: { M: 5 }, custo: null });
    const p = await criarPedido({ ...(await base()), tipo: 'compra', origem: 'loja', linhas: [{ varianteId: v.M, quantidade: 1 }] });
    await confirmarPedido(p.id, {}, (await usuarioPorEmail('gestor@dcerutti.local')).id);
    const venda = await db.venda.findUniqueOrThrow({ where: { pedidoId: p.id } });
    expect(venda.custo).toBeNull();
  });

  it('condicional parcial (B-13): divide a linha em vendida e devolvida, libera só o que voltou', async () => {
    const { v } = await produtoDeTeste({ estoque: { M: 5, G: 5 }, preco: 100, custo: 40 });
    const p = await criarPedido({ ...(await base()), tipo: 'condicional', origem: 'loja', linhas: [{ varianteId: v.M, quantidade: 3 }, { varianteId: v.G, quantidade: 1 }] });
    const [m, g] = await itensDe(p.id);
    await confirmarPedido(p.id, { [m.id]: 1, [g.id]: 0 }, (await usuarioPorEmail('ana@dcerutti.local')).id);
    expect(await variante(v.M)).toMatchObject({ estoque: 4, reservado: 0 });
    expect(await variante(v.G)).toMatchObject({ estoque: 5, reservado: 0 });
    const itens = await itensDe(p.id);
    expect(itens.map(i => [i.tamanho, i.quantidade, i.situacao, i.custoUnitario == null ? null : Number(i.custoUnitario)])).toEqual([
      ['M', 1, 'vendido', 40],
      ['G', 1, 'devolvido', null],
      ['M', 2, 'devolvido', null],
    ]);
    expect(Number((await db.venda.findUniqueOrThrow({ where: { pedidoId: p.id } })).valor)).toBe(100);
    expect(Number((await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).total), 'o total original não muda').toBe(400);
  });

  it('condicional em que tudo voltou: confirmado, sem venda e sem baixa', async () => {
    const { v } = await produtoDeTeste({ estoque: { M: 3 } });
    const p = await criarPedido({ ...(await base()), tipo: 'condicional', origem: 'loja', linhas: [{ varianteId: v.M, quantidade: 2 }] });
    const [m] = await itensDe(p.id);
    await confirmarPedido(p.id, { [m.id]: 0 }, (await usuarioPorEmail('ana@dcerutti.local')).id);
    expect(await variante(v.M)).toMatchObject({ estoque: 3, reservado: 0 });
    expect(await db.venda.findUnique({ where: { pedidoId: p.id } })).toBeNull();
    expect((await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('confirmado');
  });

  it('condicional sem marcar todas as peças, ou com quantidade impossível: recusa e não muda nada', async () => {
    const { v } = await produtoDeTeste({ estoque: { M: 3, G: 3 } });
    const p = await criarPedido({ ...(await base()), tipo: 'condicional', origem: 'loja', linhas: [{ varianteId: v.M, quantidade: 2 }, { varianteId: v.G, quantidade: 1 }] });
    const [m, g] = await itensDe(p.id);
    const u = (await usuarioPorEmail('ana@dcerutti.local')).id;
    await expect(confirmarPedido(p.id, { [m.id]: 1 }, u)).rejects.toThrow(/Marque quantas unidades/);
    await expect(confirmarPedido(p.id, { [m.id]: 3, [g.id]: 0 }, u)).rejects.toThrow(/Marque quantas unidades/);
    await expect(confirmarPedido(p.id, { [m.id]: -1, [g.id]: 0 }, u)).rejects.toThrow(/Marque quantas unidades/);
    expect((await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('pendente');
    expect(await variante(v.M)).toMatchObject({ estoque: 3, reservado: 2 });
  });

  it('compra cuja peça acabou depois do pedido: recusa a confirmação sem baixar nada', async () => {
    const { v } = await produtoDeTeste({ estoque: { M: 2 } });
    const p1 = await criarPedido({ ...(await base()), tipo: 'compra', origem: 'loja', linhas: [{ varianteId: v.M, quantidade: 2 }] });
    const p2 = await criarPedido({ ...(await base()), tipo: 'compra', origem: 'loja', linhas: [{ varianteId: v.M, quantidade: 1 }] });
    const u = (await usuarioPorEmail('ana@dcerutti.local')).id;
    await confirmarPedido(p1.id, {}, u);
    await expect(confirmarPedido(p2.id, {}, u)).rejects.toThrow(/Estoque insuficiente/);
    expect((await db.pedido.findUniqueOrThrow({ where: { id: p2.id } })).status).toBe('pendente');
    expect((await variante(v.M)).estoque).toBe(0);
  });

  it('confirmar duas vezes, ou confirmar e cancelar ao mesmo tempo: só a primeira vale', async () => {
    const { v } = await produtoDeTeste({ estoque: { M: 5 } });
    const u = (await usuarioPorEmail('ana@dcerutti.local')).id;
    const p = await criarPedido({ ...(await base()), tipo: 'compra', origem: 'loja', linhas: [{ varianteId: v.M, quantidade: 1 }] });
    const r = await Promise.allSettled([confirmarPedido(p.id, {}, u), confirmarPedido(p.id, {}, u), cancelarPedido(p.id, 'equipe')]);
    expect(r.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    for (const x of r) if (x.status === 'rejected') expect(String(x.reason)).toMatch(/já foi fechado/);
    const final = await db.pedido.findUniqueOrThrow({ where: { id: p.id } });
    expect((await variante(v.M)).estoque).toBe(final.status === 'confirmado' ? 4 : 5);
    expect(await db.venda.count({ where: { pedidoId: p.id } })).toBe(final.status === 'confirmado' ? 1 : 0);
  });

  it('pedido inexistente: erro claro', async () => {
    await expect(confirmarPedido('nao-existe', {}, 'x')).rejects.toThrow('Pedido não encontrado.');
    await expect(cancelarPedido('nao-existe', 'equipe')).rejects.toThrow('Pedido não encontrado.');
  });
});

describe('cancelar pedido', () => {
  it('condicional: libera a reserva e grava o motivo e a data', async () => {
    const { v } = await produtoDeTeste({ estoque: { M: 3 } });
    const p = await criarPedido({ ...(await base()), tipo: 'condicional', origem: 'loja', linhas: [{ varianteId: v.M, quantidade: 3 }] });
    await cancelarPedido(p.id, 'cliente');
    expect(await variante(v.M)).toMatchObject({ estoque: 3, reservado: 0 });
    const c = await db.pedido.findUniqueOrThrow({ where: { id: p.id } });
    expect(c).toMatchObject({ status: 'cancelado', motivoCancelamento: 'cliente' });
    expect(c.canceladoEm).toBeInstanceOf(Date);
  });

  it('compra: não mexe no estoque', async () => {
    const { v } = await produtoDeTeste({ estoque: { M: 3 } });
    const p = await criarPedido({ ...(await base()), tipo: 'compra', origem: 'loja', linhas: [{ varianteId: v.M, quantidade: 2 }] });
    await cancelarPedido(p.id, 'equipe');
    expect(await variante(v.M)).toMatchObject({ estoque: 3, reservado: 0 });
  });

  it('pedido já confirmado não é cancelado', async () => {
    const { v } = await produtoDeTeste({ estoque: { M: 3 } });
    const p = await criarPedido({ ...(await base()), tipo: 'compra', origem: 'loja', linhas: [{ varianteId: v.M, quantidade: 1 }] });
    await confirmarPedido(p.id, {}, (await usuarioPorEmail('ana@dcerutti.local')).id);
    await expect(cancelarPedido(p.id, 'equipe')).rejects.toThrow(/já foi fechado/);
  });
});

/** Edição só de quantidades (0 = retirar), mantendo peça e preço de cada linha, como a edição antiga. */
async function editarQuantidades(pedidoId: string, quantidades: Record<number, number>, regra: { valor: number; gratisAcima: number } | null) {
  const itens = await itensDe(pedidoId);
  const linhas = itens
    .map(i => ({ itemId: i.id, varianteId: i.varianteId, quantidade: quantidades[i.id] ?? i.quantidade, preco: Number(i.precoUnitario) }))
    .filter(l => l.quantidade !== 0);
  return editarPedido(pedidoId, linhas, regra, { usuarioId: (await usuarioPorEmail('ana@dcerutti.local')).id });
}
const historicoDe = (pedidoId: string) => db.pedidoHistorico.findMany({ where: { pedidoId }, orderBy: { id: 'asc' } });

describe('editar pedido pendente (U-08)', () => {
  it('condicional: aumentar reserva mais, diminuir devolve, retirar apaga a linha e o total acompanha', async () => {
    const { v } = await produtoDeTeste({ estoque: { M: 5, G: 5 }, preco: 50 });
    const p = await criarPedido({ ...(await base()), tipo: 'condicional', origem: 'loja', linhas: [{ varianteId: v.M, quantidade: 2 }, { varianteId: v.G, quantidade: 2 }] });
    const [m, g] = await itensDe(p.id);
    await editarQuantidades(p.id, { [m.id]: 4, [g.id]: 0 }, null);
    expect(await variante(v.M)).toMatchObject({ reservado: 4 });
    expect(await variante(v.G)).toMatchObject({ reservado: 0 });
    const itens = await itensDe(p.id);
    expect(itens.map(i => [i.tamanho, i.quantidade])).toEqual([['M', 4]]);
    expect(Number((await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).total)).toBe(200);
  });

  it('o preço combinado da peça não muda, mesmo que o produto mude de preço', async () => {
    const { v, produto } = await produtoDeTeste({ estoque: { M: 5 }, preco: 50 });
    const p = await criarPedido({ ...(await base()), tipo: 'compra', origem: 'loja', linhas: [{ varianteId: v.M, quantidade: 1 }] });
    await db.produto.update({ where: { id: produto.id }, data: { preco: 80, precoCheio: 80 } });
    const [m] = await itensDe(p.id);
    await editarQuantidades(p.id, { [m.id]: 3 }, null);
    expect(Number((await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).total)).toBe(150);
  });

  it('compra: recusa aumentar além do disponível', async () => {
    const { v } = await produtoDeTeste({ estoque: { M: 2 } });
    const p = await criarPedido({ ...(await base()), tipo: 'compra', origem: 'loja', linhas: [{ varianteId: v.M, quantidade: 1 }] });
    const [m] = await itensDe(p.id);
    await expect(editarQuantidades(p.id, { [m.id]: 3 }, null)).rejects.toThrow(/só 2 disponível/);
    expect((await itensDe(p.id))[0].quantidade).toBe(1);
  });

  it('condicional: recusa aumentar além do disponível e não muda a reserva', async () => {
    const { v } = await produtoDeTeste({ estoque: { M: 2 } });
    const p = await criarPedido({ ...(await base()), tipo: 'condicional', origem: 'loja', linhas: [{ varianteId: v.M, quantidade: 1 }] });
    const [m] = await itensDe(p.id);
    await expect(editarQuantidades(p.id, { [m.id]: 3 }, null)).rejects.toThrow(/não há 2 a mais/);
    expect((await variante(v.M)).reservado).toBe(1);
  });

  it('não deixa o pedido sem peças, nem quantidade inválida', async () => {
    const { v } = await produtoDeTeste({ estoque: { M: 5 } });
    const p = await criarPedido({ ...(await base()), tipo: 'compra', origem: 'loja', linhas: [{ varianteId: v.M, quantidade: 1 }] });
    const [m] = await itensDe(p.id);
    await expect(editarQuantidades(p.id, { [m.id]: 0 }, null)).rejects.toThrow(/pelo menos uma peça/);
    await expect(editarQuantidades(p.id, { [m.id]: 21 }, null)).rejects.toThrow('Quantidade inválida.');
    await expect(editarQuantidades(p.id, { [m.id]: 1.5 }, null)).rejects.toThrow('Quantidade inválida.');
    await expect(editarQuantidades(p.id, {}, null)).rejects.toThrow('Nada foi alterado.');
  });

  it('pedido fechado não é editado', async () => {
    const { v } = await produtoDeTeste({ estoque: { M: 5 } });
    const p = await criarPedido({ ...(await base()), tipo: 'compra', origem: 'loja', linhas: [{ varianteId: v.M, quantidade: 1 }] });
    await cancelarPedido(p.id, 'equipe');
    const [m] = await itensDe(p.id);
    await expect(editarQuantidades(p.id, { [m.id]: 2 }, null)).rejects.toThrow(/já foi fechado/);
    await expect(editarPedido('nao-existe', [], null, { usuarioId: 'x' })).rejects.toThrow('Pedido não encontrado.');
  });

  it('frete: recalculado pela regra atual; a combinar continua a combinar', async () => {
    const { v } = await produtoDeTeste({ estoque: { M: 10 }, preco: 100 });
    const regra = { valor: 24.9, gratisAcima: 299 };
    const comFrete = await criarPedido({ ...(await base()), tipo: 'compra', origem: 'loja', linhas: [{ varianteId: v.M, quantidade: 1 }], regraFrete: regra });
    const [m] = await itensDe(comFrete.id);
    await editarQuantidades(comFrete.id, { [m.id]: 3 }, regra);
    expect(Number((await db.pedido.findUniqueOrThrow({ where: { id: comFrete.id } })).frete)).toBe(0);
    await editarQuantidades(comFrete.id, { [m.id]: 1 }, regra);
    expect(Number((await db.pedido.findUniqueOrThrow({ where: { id: comFrete.id } })).frete)).toBe(24.9);
    const aCombinar = await criarPedido({ ...(await base()), tipo: 'compra', origem: 'loja', linhas: [{ varianteId: v.M, quantidade: 1 }] });
    const [a] = await itensDe(aCombinar.id);
    await editarQuantidades(aCombinar.id, { [a.id]: 2 }, regra);
    expect((await db.pedido.findUniqueOrThrow({ where: { id: aCombinar.id } })).frete).toBeNull();
  });

  it('editar e confirmar ao mesmo tempo não corrompe o estoque', async () => {
    const { v } = await produtoDeTeste({ estoque: { M: 10 } });
    const p = await criarPedido({ ...(await base()), tipo: 'condicional', origem: 'loja', linhas: [{ varianteId: v.M, quantidade: 2 }] });
    const [m] = await itensDe(p.id);
    const u = (await usuarioPorEmail('ana@dcerutti.local')).id;
    await Promise.allSettled([editarQuantidades(p.id, { [m.id]: 5 }, null), confirmarPedido(p.id, { [m.id]: 2 }, u)]);
    const vv = await variante(v.M);
    const itens = await itensDe(p.id);
    const vendidas = itens.filter(i => i.situacao === 'vendido').reduce((a, i) => a + i.quantidade, 0);
    expect(vv.reservado).toBe(0);
    expect(vv.estoque).toBe(10 - vendidas);
  });

  it('troca tamanho e cor (outro produto): condicional devolve a reserva da antiga e reserva a nova; grava a cópia da peça nova', async () => {
    const a = await produtoDeTeste({ estoque: { M: 5, G: 5 }, preco: 100 });
    const b = await produtoDeTeste({ estoque: { P: 3 }, preco: 120 });
    await db.produto.update({ where: { id: b.produto.id }, data: { cor: 'Preto' } });
    const p = await criarPedido({ ...(await base()), tipo: 'condicional', origem: 'loja', linhas: [{ varianteId: a.v.M, quantidade: 1 }, { varianteId: a.v.G, quantidade: 2 }] });
    const [m, g] = await itensDe(p.id);
    const ana = (await usuarioPorEmail('ana@dcerutti.local')).id;
    await editarPedido(p.id, [
      { itemId: m.id, varianteId: b.v.P, quantidade: 1, preco: 120 },
      { itemId: g.id, varianteId: a.v.M, quantidade: 2, preco: 100 },
    ], null, { usuarioId: ana, observacao: 'Cliente preferiu o preto' });
    expect(await variante(a.v.G)).toMatchObject({ reservado: 0 });
    expect(await variante(a.v.M)).toMatchObject({ reservado: 2 });
    expect(await variante(b.v.P)).toMatchObject({ reservado: 1 });
    const itens = await itensDe(p.id);
    expect(itens.map(i => [i.id, i.referencia, i.tamanho, i.cor, Number(i.precoTabela)])).toEqual([[m.id, b.ref, 'P', 'Preto', 120], [g.id, a.ref, 'M', null, 100]]);
    expect(Number((await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).total)).toBe(320);
  });

  it('inclui peça nova e dá desconto: preço gravado por peça, tabela guardada, total com desconto e venda pelo preço combinado', async () => {
    const a = await produtoDeTeste({ estoque: { M: 5 }, preco: 100 });
    const b = await produtoDeTeste({ estoque: { G: 5 }, preco: 50 });
    const p = await criarPedido({ ...(await base()), tipo: 'compra', origem: 'loja', linhas: [{ varianteId: a.v.M, quantidade: 1 }] });
    const [m] = await itensDe(p.id);
    const ana = (await usuarioPorEmail('ana@dcerutti.local')).id;
    await editarPedido(p.id, [{ itemId: m.id, varianteId: a.v.M, quantidade: 1, preco: 89.9 }, { varianteId: b.v.G, quantidade: 2, preco: 45 }], null, { usuarioId: ana });
    const itens = await itensDe(p.id);
    expect(itens.map(i => [Number(i.precoUnitario), Number(i.precoTabela), i.quantidade])).toEqual([[89.9, 100, 1], [45, 50, 2]]);
    expect(Number((await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).total)).toBeCloseTo(179.9, 2);
    await confirmarPedido(p.id, {}, ana);
    expect(Number((await db.venda.findUniqueOrThrow({ where: { pedidoId: p.id } })).valor)).toBeCloseTo(179.9, 2);
  });

  it('recusa preço inválido, peça repetida, linha de outro pedido e peça nova fora do catálogo', async () => {
    const a = await produtoDeTeste({ estoque: { M: 5, G: 5 } });
    const inativo = await produtoDeTeste({ estoque: { M: 5 }, ativo: false });
    const p = await criarPedido({ ...(await base()), tipo: 'compra', origem: 'loja', linhas: [{ varianteId: a.v.M, quantidade: 1 }] });
    const outro = await criarPedido({ ...(await base()), tipo: 'compra', origem: 'loja', linhas: [{ varianteId: a.v.G, quantidade: 1 }] });
    const [m] = await itensDe(p.id);
    const [o] = await itensDe(outro.id);
    const autor = { usuarioId: (await usuarioPorEmail('ana@dcerutti.local')).id };
    const linha = { itemId: m.id, varianteId: a.v.M, quantidade: 1, preco: 100 };
    await expect(editarPedido(p.id, [{ ...linha, preco: -1 }], null, autor)).rejects.toThrow('Preço inválido.');
    await expect(editarPedido(p.id, [linha, { varianteId: a.v.M, quantidade: 1, preco: 100 }], null, autor)).rejects.toThrow(/duas vezes/);
    await expect(editarPedido(p.id, [{ ...linha, itemId: o.id }], null, autor)).rejects.toThrow(/mudou enquanto/);
    await expect(editarPedido(p.id, [linha, { varianteId: inativo.v.M, quantidade: 1, preco: 100 }], null, autor)).rejects.toThrow(/não está mais no catálogo/);
    expect(await historicoDe(p.id)).toHaveLength(1);
  });

  it('histórico: guarda o que a cliente pediu, cada edição com autor, frases e observação, e o fechamento', async () => {
    const a = await produtoDeTeste({ estoque: { M: 5, G: 5 }, preco: 100 });
    const cliente = await clientePorNome('Juliana Ferreira');
    const p = await criarPedido({ ...(await base()), tipo: 'compra', origem: 'loja', linhas: [{ varianteId: a.v.M, quantidade: 1 }], usuarioId: cliente.userId });
    const [m] = await itensDe(p.id);
    const ana = await usuarioPorEmail('ana@dcerutti.local');
    await editarPedido(p.id, [{ itemId: m.id, varianteId: a.v.G, quantidade: 2, preco: 90 }], null, { usuarioId: ana.id, observacao: 'Trocou para G' });
    await confirmarPedido(p.id, {}, ana.id);
    const h = await historicoDe(p.id);
    expect(h.map(x => [x.acao, x.autor, x.nomeUsuario])).toEqual([['criado', cliente.userId ? 'cliente' : 'sistema', null], ['editado', 'equipe', ana.name], ['confirmado', 'equipe', ana.name]]);
    expect(h[0].itens).toEqual([expect.objectContaining({ referencia: a.ref, tamanho: 'M', quantidade: 1, preco: 100 })]);
    expect(h[1].mudancas).toEqual([
      `Trocou Produto de teste ${a.ref} · tam. M por Produto de teste ${a.ref} · tam. G`,
      `Produto de teste ${a.ref} · tam. G: quantidade de 1 para 2`,
      expect.stringMatching(/preço de R\$\s100,00 para R\$\s90,00/),
      expect.stringMatching(/Total das peças de R\$\s100,00 para R\$\s180,00/),
    ]);
    expect(h[1].observacao).toBe('Trocou para G');
    expect(h[1].itens).toEqual([expect.objectContaining({ tamanho: 'G', quantidade: 2, preco: 90, precoTabela: 100 })]);
    expect(h[2].mudancas).toEqual([expect.stringMatching(/Venda de R\$\s180,00/)]);
  });

  it('histórico: pedido antigo sem registros ganha o retrato inicial na primeira mudança; expiração registra como sistema', async () => {
    const a = await produtoDeTeste({ estoque: { M: 5 } });
    const p = await criarPedido({ ...(await base()), tipo: 'condicional', origem: 'loja', linhas: [{ varianteId: a.v.M, quantidade: 1 }] });
    await db.pedidoHistorico.deleteMany({ where: { pedidoId: p.id } });
    await cancelarPedido(p.id, 'expirado');
    const h = await historicoDe(p.id);
    expect(h.map(x => [x.acao, x.autor])).toEqual([['criado', 'sistema'], ['cancelado', 'sistema']]);
    expect(h[1].mudancas).toEqual(['Expirou sem resposta']);
  });
});
