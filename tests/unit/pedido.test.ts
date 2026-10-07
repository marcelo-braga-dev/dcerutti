import { describe, expect, it } from 'vitest';
import { plural, valoresDoPedido } from '@/lib/pedido';

const itens = [
  { situacao: 'vendido' as const, precoUnitario: 100, quantidade: 1 },
  { situacao: 'devolvido' as const, precoUnitario: 50, quantidade: 2 },
];

describe('valoresDoPedido', () => {
  it('compra soma o frete ao total', () => {
    expect(valoresDoPedido({ tipo: 'compra', status: 'pendente', total: 200, frete: 24.9, itens })).toMatchObject({ pecas: 200, frete: 24.9, total: 224.9, unidades: 3 });
  });
  it('condicional fechado mostra só o que ficou (B-07)', () => {
    expect(valoresDoPedido({ tipo: 'condicional', status: 'confirmado', total: 200, frete: 0, itens })).toMatchObject({ pecas: 100, total: 100, ficaram: 1, frete: null });
  });
  it('condicional que voltou inteiro vale zero', () => {
    const tudoVoltou = itens.map(i => ({ ...i, situacao: 'devolvido' as const }));
    expect(valoresDoPedido({ tipo: 'condicional', status: 'confirmado', total: 200, frete: 0, itens: tudoVoltou })).toMatchObject({ total: 0, ficaram: 0 });
  });
  it('condicional pendente mostra o valor das peças enviadas', () => {
    expect(valoresDoPedido({ tipo: 'condicional', status: 'pendente', total: 200, frete: 0, itens })).toMatchObject({ total: 200, ficaram: null });
  });
});

describe('plural', () => {
  it('singular e plural', () => {
    expect(plural(1, 'peça', 'peças')).toBe('1 peça');
    expect(plural(3, 'peça', 'peças')).toBe('3 peças');
    expect(plural(0, 'venda', 'vendas')).toBe('0 vendas');
  });
});

describe('frete a combinar (C-03)', () => {
  it('compra sem regra de frete: total só das peças e frete a combinar', () => {
    expect(valoresDoPedido({ tipo: 'compra', status: 'pendente', total: 200, frete: null, itens })).toMatchObject({ pecas: 200, frete: null, freteACombinar: true, total: 200 });
  });
  it('frete zero é grátis, não a combinar', () => {
    expect(valoresDoPedido({ tipo: 'compra', status: 'pendente', total: 400, frete: 0, itens })).toMatchObject({ frete: 0, freteACombinar: false, total: 400 });
  });
});

describe('expiração (Q-05)', () => {
  const criado = new Date('2026-10-01T12:00:00Z');
  it('expira N dias depois de criado; 0 = nunca', async () => {
    const { expiraEm, limiteDeExpiracao, diasAte } = await import('@/lib/pedido');
    expect(expiraEm(criado, 7)?.toISOString()).toBe('2026-10-08T12:00:00.000Z');
    expect(expiraEm(criado, 0)).toBeNull();
    expect(limiteDeExpiracao(7, new Date('2026-10-08T12:00:01Z')) > criado).toBe(true);
    expect(diasAte(new Date('2026-10-08T12:00:00Z'), new Date('2026-10-06T13:00:00Z'))).toBe(2);
  });
  it('motivo do cancelamento em palavras', async () => {
    const { textoCancelamento } = await import('@/lib/pedido');
    expect(textoCancelamento('expirado', true)).toBe('Expirou sem confirmação');
    expect(textoCancelamento('cliente', false)).toBe('Cancelado pela cliente');
    expect(textoCancelamento(null, true)).toBeNull();
  });
});
