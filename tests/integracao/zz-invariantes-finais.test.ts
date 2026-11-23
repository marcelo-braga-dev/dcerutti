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

  it('números da loja: um só padrão ativo, igual ao whatsappLoja; sem vínculo aberto repetido; principal só em número ligado', async () => {
    const padroes = await db.numeroWhatsApp.findMany({ where: { padrao: true } });
    expect(padroes).toHaveLength(1);
    expect(padroes[0].status).toBe('ativo');
    expect((await db.configuracao.findUniqueOrThrow({ where: { chave: 'whatsappLoja' } })).valor).toBe(padroes[0].telefone);
    expect(await db.$queryRaw`SELECT numeroId, usuarioId FROM vinculo_numero WHERE fimEm IS NULL GROUP BY numeroId, usuarioId HAVING COUNT(*) > 1`).toEqual([]);
    expect(await db.$queryRaw`
      SELECT u.id FROM user u LEFT JOIN vinculo_numero v ON v.usuarioId = u.id AND v.numeroId = u.numeroPrincipalId AND v.fimEm IS NULL
      WHERE u.numeroPrincipalId IS NOT NULL AND v.id IS NULL`).toEqual([]);
  });

  it('reserva = condicionais pendentes + compras pendentes com cobrança online segurando as peças (docs/27)', async () => {
    expect(await db.$queryRaw`
      SELECT v.id FROM variante v LEFT JOIN pedido_item i ON i.varianteId = v.id LEFT JOIN pedido p ON p.id = i.pedidoId
      GROUP BY v.id, v.reservado
      HAVING v.reservado <> COALESCE(SUM(CASE WHEN p.status = 'pendente' AND (p.tipo = 'condicional'
        OR EXISTS (SELECT 1 FROM cobranca c WHERE c.pedidoId = p.id AND c.reservou = 1)) THEN i.quantidade END), 0)`).toEqual([]);
  });

  it('pagamento online: no máximo uma cobrança segurando a reserva por pedido; reserva só em cobrança aberta ou paga', async () => {
    expect(await db.$queryRaw`SELECT pedidoId FROM cobranca WHERE reservou = 1 GROUP BY pedidoId HAVING COUNT(*) > 1`).toEqual([]);
    expect(await db.$queryRaw`SELECT id FROM cobranca WHERE reservou = 1 AND status NOT IN ('criada', 'pendente', 'aprovada', 'estornada_parcial', 'contestada')`).toEqual([]);
    expect(await db.$queryRaw`SELECT c.id FROM cobranca c JOIN pedido p ON p.id = c.pedidoId WHERE c.reservou = 1 AND p.status <> 'pendente'`).toEqual([]);
  });

  it('estoque = soma do histórico', async () => {
    expect(await db.$queryRaw`
      SELECT v.id FROM variante v LEFT JOIN movimento_estoque m ON m.varianteId = v.id
      GROUP BY v.id, v.estoque HAVING v.estoque <> COALESCE(SUM(m.delta), 0)`).toEqual([]);
  });

  it('total do pedido = soma das linhas − cupom; venda = peças vendidas − cupom; nenhuma venda de pedido não confirmado', async () => {
    for (const p of await db.pedido.findMany({ include: { itens: true, venda: true } })) {
      const cupomDasLinhas = p.itens.reduce((a, i) => a + n(i.descontoCupom), 0);
      expect(centavos(cupomDasLinhas), `${p.codigo} cupom`).toBe(centavos(n(p.descontoCupom)));
      if (!p.cupomId) expect(centavos(n(p.descontoCupom)), `${p.codigo} sem cupom`).toBe(0);
      expect(centavos(p.itens.reduce((a, i) => a + n(i.precoUnitario) * i.quantidade, 0) - cupomDasLinhas), p.codigo).toBe(centavos(n(p.total)));
      const vendidos = p.itens.filter(i => i.situacao === 'vendido');
      if (p.status !== 'confirmado' || !vendidos.length) expect(p.venda, p.codigo).toBeNull();
      else expect(centavos(n(p.venda!.valor)), p.codigo).toBe(centavos(vendidos.reduce((a, i) => a + n(i.precoUnitario) * i.quantidade - n(i.descontoCupom), 0)));
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
