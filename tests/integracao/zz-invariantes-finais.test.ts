/**
 * Roda por último: depois de toda a suíte criar, confirmar, cancelar, editar e expirar pedidos e mexer no estoque
 * pelas funções do sistema, as regras de consistência precisam continuar valendo.
 */
import { describe, expect, it } from 'vitest';
import { db } from './suporte/ajuda';

const n = (x: unknown) => Number(x ?? 0);
const centavos = (x: number) => Math.round(x * 100);

describe('invariantes depois de toda a suíte', () => {
  it('estoque e reserva coerentes', async () => {
    expect(await db.$queryRaw`SELECT id FROM variante WHERE estoque < 0 OR reservado < 0 OR reservado > estoque`).toEqual([]);
  });

  it('reserva = condicionais pendentes', async () => {
    expect(await db.$queryRaw`
      SELECT v.id FROM variante v LEFT JOIN pedido_item i ON i.varianteId = v.id LEFT JOIN pedido p ON p.id = i.pedidoId
      GROUP BY v.id, v.reservado
      HAVING v.reservado <> COALESCE(SUM(CASE WHEN p.status = 'pendente' AND p.tipo = 'condicional' THEN i.quantidade END), 0)`).toEqual([]);
  });

  it('estoque = soma do histórico', async () => {
    expect(await db.$queryRaw`
      SELECT v.id FROM variante v LEFT JOIN movimento_estoque m ON m.varianteId = v.id
      GROUP BY v.id, v.estoque HAVING v.estoque <> COALESCE(SUM(m.delta), 0)`).toEqual([]);
  });

  it('total do pedido = soma das linhas; venda = peças vendidas; nenhuma venda de pedido não confirmado', async () => {
    for (const p of await db.pedido.findMany({ include: { itens: true, venda: true } })) {
      expect(centavos(p.itens.reduce((a, i) => a + n(i.precoUnitario) * i.quantidade, 0)), p.codigo).toBe(centavos(n(p.total)));
      const vendidos = p.itens.filter(i => i.situacao === 'vendido');
      if (p.status !== 'confirmado' || !vendidos.length) expect(p.venda, p.codigo).toBeNull();
      else expect(centavos(n(p.venda!.valor)), p.codigo).toBe(centavos(vendidos.reduce((a, i) => a + n(i.precoUnitario) * i.quantidade, 0)));
    }
  });

  it('códigos únicos e status com as datas certas', async () => {
    const ps = await db.pedido.findMany({ select: { codigo: true, status: true, confirmadoEm: true, canceladoEm: true, motivoCancelamento: true } });
    expect(new Set(ps.map(p => p.codigo)).size).toBe(ps.length);
    for (const p of ps) {
      if (p.status === 'confirmado') expect(p.confirmadoEm, p.codigo).not.toBeNull();
      if (p.status === 'cancelado') expect(p.motivoCancelamento, p.codigo).not.toBeNull();
      if (p.status === 'pendente') expect(p.canceladoEm ?? p.confirmadoEm, p.codigo).toBeNull();
    }
  });

  it('todo cliente com vendedor de papel vendedor', async () => {
    expect(await db.cliente.count({ where: { vendedor: { papel: { not: 'vendedor' } } } })).toBe(0);
  });
});
