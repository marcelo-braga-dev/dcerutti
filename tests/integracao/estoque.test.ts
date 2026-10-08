/** Módulo único de estoque (src/server/estoque.ts): reserva, baixa, entrada, ajuste e as travas contra corrida. */
import { afterAll, describe, expect, it } from 'vitest';
import { baixarVenda, liberarReserva, movimentar, registrarEstoqueInicial, reservar } from '@/server/estoque';
import { ErroNegocio } from '@/server/erros';
import { db, produtoDeTeste, usuarioPorEmail, variante } from './suporte/ajuda';

/** Movimentos do tamanho feitos pelo teste (sem o estoque inicial que o auxiliar registra ao criar o produto). */
const movimentosDoTeste = (varianteId: number) =>
  // Atenção: NOT (observacao = x) também descartaria as linhas com observação nula; por isso o OR explícito.
  db.movimentoEstoque.findMany({ where: { varianteId, OR: [{ observacao: null }, { observacao: { not: 'Estoque inicial (teste)' } }] }, orderBy: { id: 'asc' } });

// Estes testes chamam reservar() direto, sem pedido: ao final, devolvem as reservas para o banco voltar a obedecer
// ao invariante "reserva = condicionais em aberto" (conferido em zz-invariantes-finais).
// Também alinham o estoque ao histórico (o teste de estoque inicial registra o movimento sem mexer no saldo).
const usadas = new Set<number>();
afterAll(async () => {
  for (const id of usadas) {
    const soma = await db.movimentoEstoque.aggregate({ where: { varianteId: id }, _sum: { delta: true } });
    await db.variante.update({ where: { id }, data: { reservado: 0, estoque: soma._sum.delta ?? 0 } });
  }
});
const marcar = <T extends Record<string, number>>(v: T) => (Object.values(v).forEach(id => usadas.add(id)), v);

describe('reservar e liberar (condicional)', () => {
  it('reserva o que está disponível e recusa além disso', async () => {
    const v = marcar((await produtoDeTeste({ estoque: { M: 3 } })).v);
    await db.$transaction(tx => reservar(tx, v.M, 2));
    expect((await variante(v.M)).reservado).toBe(2);
    await expect(db.$transaction(tx => reservar(tx, v.M, 2))).rejects.toBeInstanceOf(ErroNegocio);
    expect((await variante(v.M)).reservado, 'a falha não reserva nada').toBe(2);
    await db.$transaction(tx => reservar(tx, v.M, 1));
    expect((await variante(v.M)).reservado).toBe(3);
  });

  it('liberar nunca deixa a reserva negativa', async () => {
    const v = marcar((await produtoDeTeste({ estoque: { M: 3 } })).v);
    await db.$transaction(tx => reservar(tx, v.M, 1));
    await db.$transaction(tx => liberarReserva(tx, v.M, 5));
    expect((await variante(v.M)).reservado).toBe(0);
  });

  it('duas pessoas disputando a última peça: só uma consegue', async () => {
    const v = marcar((await produtoDeTeste({ estoque: { U: 1 } })).v);
    const tentativas = await Promise.allSettled(Array.from({ length: 5 }, () => db.$transaction(tx => reservar(tx, v.U, 1))));
    expect(tentativas.filter(t => t.status === 'fulfilled')).toHaveLength(1);
    expect((await variante(v.U)).reservado).toBe(1);
  });
});

describe('baixar venda', () => {
  it('peça sem reserva: baixa o estoque e registra no histórico com o pedido', async () => {
    const v = marcar((await produtoDeTeste({ estoque: { G: 4 } })).v);
    const gestor = await usuarioPorEmail('gestor@dcerutti.local');
    await db.$transaction(tx => baixarVenda(tx, { varianteId: v.G, q: 3, reservada: false, pedidoId: null as never, usuarioId: gestor.id, observacao: 'teste', nomePeca: 'x' }));
    expect(await variante(v.G)).toMatchObject({ estoque: 1, reservado: 0 });
    const m = await db.movimentoEstoque.findFirstOrThrow({ where: { varianteId: v.G }, orderBy: { id: 'desc' } });
    expect(m).toMatchObject({ delta: -3, motivo: 'venda', usuarioId: gestor.id });
  });

  it('peça reservada: baixa estoque e reserva juntos', async () => {
    const v = marcar((await produtoDeTeste({ estoque: { G: 4 } })).v);
    await db.$transaction(tx => reservar(tx, v.G, 2));
    await db.$transaction(tx => baixarVenda(tx, { varianteId: v.G, q: 2, reservada: true, pedidoId: null as never, usuarioId: null as never, observacao: 'x', nomePeca: 'x' }));
    expect(await variante(v.G)).toMatchObject({ estoque: 2, reservado: 0 });
  });

  it('sem estoque suficiente: recusa com o nome da peça e não grava nada', async () => {
    const v = marcar((await produtoDeTeste({ estoque: { G: 1 } })).v);
    await expect(db.$transaction(tx => baixarVenda(tx, { varianteId: v.G, q: 2, reservada: false, pedidoId: null as never, usuarioId: null as never, observacao: 'x', nomePeca: 'Camiseta (tam. G)' })))
      .rejects.toThrow(/Camiseta \(tam\. G\)/);
    expect((await variante(v.G)).estoque).toBe(1);
    expect(await movimentosDoTeste(v.G)).toEqual([]);
  });
});

describe('movimentar (entrada e ajuste do gestor)', () => {
  it('entrada soma; ajuste define a quantidade contada; os dois ficam no histórico com quem fez', async () => {
    const { v, produto } = await produtoDeTeste({ estoque: { P: 2 } });
    const gestor = await usuarioPorEmail('gestor@dcerutti.local');
    expect(await db.$transaction(tx => movimentar(tx, { varianteId: v.P, tipo: 'entrada', quantidade: 5, usuarioId: gestor.id, observacao: 'Chegou' }))).toBe(produto.id);
    expect((await variante(v.P)).estoque).toBe(7);
    await db.$transaction(tx => movimentar(tx, { varianteId: v.P, tipo: 'ajuste', quantidade: 4, usuarioId: gestor.id }));
    expect((await variante(v.P)).estoque).toBe(4);
    const hist = await movimentosDoTeste(v.P);
    expect(hist.map(h => [h.motivo, h.delta, h.observacao])).toEqual([['entrada', 5, 'Chegou'], ['ajuste', -3, null]]);
    expect(hist.every(h => h.usuarioId === gestor.id)).toBe(true);
  });

  it('ajuste para a mesma quantidade não cria movimento', async () => {
    const v = marcar((await produtoDeTeste({ estoque: { P: 2 } })).v);
    await db.$transaction(tx => movimentar(tx, { varianteId: v.P, tipo: 'ajuste', quantidade: 2, usuarioId: null as never }));
    expect(await movimentosDoTeste(v.P)).toEqual([]);
  });

  it('nunca deixa o estoque abaixo do que está reservado', async () => {
    const v = marcar((await produtoDeTeste({ estoque: { P: 5 } })).v);
    await db.$transaction(tx => reservar(tx, v.P, 3));
    await expect(db.$transaction(tx => movimentar(tx, { varianteId: v.P, tipo: 'ajuste', quantidade: 2, usuarioId: null as never })))
      .rejects.toThrow(/3 peças reservadas/);
    await db.$transaction(tx => movimentar(tx, { varianteId: v.P, tipo: 'ajuste', quantidade: 3, usuarioId: null as never }));
    expect((await variante(v.P)).estoque).toBe(3);
  });

  it('tamanho inexistente: erro de negócio', async () => {
    await expect(db.$transaction(tx => movimentar(tx, { varianteId: 999_999_999, tipo: 'entrada', quantidade: 1, usuarioId: null as never }))).rejects.toThrow('Tamanho não encontrado.');
  });

  it('entradas simultâneas não se perdem (trava de linha)', async () => {
    const v = marcar((await produtoDeTeste({ estoque: { P: 0 } })).v);
    await Promise.all(Array.from({ length: 8 }, () => db.$transaction(tx => movimentar(tx, { varianteId: v.P, tipo: 'entrada', quantidade: 2, usuarioId: null as never }))));
    expect((await variante(v.P)).estoque).toBe(16);
    expect(await db.movimentoEstoque.count({ where: { varianteId: v.P } })).toBe(8);
  });

  it('estoque inicial só registra quando há peças', async () => {
    const v = marcar((await produtoDeTeste({ estoque: { P: 0, M: 0 } })).v);
    await db.$transaction(tx => registrarEstoqueInicial(tx, v.P, 0, null as never));
    await db.$transaction(tx => registrarEstoqueInicial(tx, v.M, 4, null as never));
    expect(await db.movimentoEstoque.count({ where: { varianteId: v.P } })).toBe(0);
    expect(await db.movimentoEstoque.findFirst({ where: { varianteId: v.M } })).toMatchObject({ delta: 4, motivo: 'entrada', observacao: 'Estoque inicial' });
  });
});
