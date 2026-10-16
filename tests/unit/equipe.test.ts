import { describe, expect, it } from 'vitest';
import { ACOES, duracao, ehAcao, online, resumirEquipe } from '@/lib/equipe';

const dia = (d: Date) => d.toISOString().slice(0, 10);
const t = (iso: string) => new Date(iso);

describe('acompanhamento da equipe (D-26)', () => {
  it('soma tempo, dias e ações por grupo', () => {
    const r = resumirEquipe(
      [
        { usuarioId: 'ana', inicioEm: t('2026-10-14T13:00:00Z'), segundos: 1800 },
        { usuarioId: 'ana', inicioEm: t('2026-10-14T18:00:00Z'), segundos: 600 },
        { usuarioId: 'ana', inicioEm: t('2026-10-15T13:00:00Z'), segundos: 300 },
      ],
      [
        { usuarioId: 'ana', tipo: 'login', criadoEm: t('2026-10-14T13:00:00Z') },
        { usuarioId: 'ana', tipo: 'cliente_cadastrado', criadoEm: t('2026-10-14T13:10:00Z') },
        { usuarioId: 'ana', tipo: 'pedido_criado', criadoEm: t('2026-10-14T13:20:00Z') },
        { usuarioId: 'ana', tipo: 'oferta_enviada', criadoEm: t('2026-10-14T13:21:00Z') },
        { usuarioId: 'ana', tipo: 'whatsapp', criadoEm: t('2026-10-15T13:05:00Z') },
        { usuarioId: 'ana', tipo: 'venda_caixa', criadoEm: t('2026-10-15T13:30:00Z') },
        { usuarioId: 'ana', tipo: 'pedido_confirmado', criadoEm: t('2026-10-15T13:31:00Z') },
        { usuarioId: 'ana', tipo: 'pedido_cancelado', criadoEm: t('2026-10-16T12:00:00Z') },
        { usuarioId: 'bia', tipo: 'login', criadoEm: t('2026-10-16T12:00:00Z') },
      ],
      dia,
    );
    const ana = r.get('ana')!;
    expect(ana).toMatchObject({ segundos: 2700, logins: 1, clientes: 1, pedidos: 1, contatos: 2, vendasConfirmadas: 2, cancelamentos: 1 });
    // Dia 16 só teve ação (sem sinal de presença): também conta como dia ativo.
    expect(ana.diasAtivos).toBe(3);
    expect(ana.porDia.get('2026-10-14')).toBe(2400);
    expect(ana.ultimaAcao).toEqual(t('2026-10-16T12:00:00Z'));
    expect(r.get('bia')).toMatchObject({ logins: 1, segundos: 0, diasAtivos: 1 });
  });

  it('duração, online e nomes das ações', () => {
    expect(duracao(0)).toBe('—');
    expect(duracao(40)).toBe('menos de 1 min');
    expect(duracao(45 * 60)).toBe('45 min');
    expect(duracao(2 * 3600 + 15 * 60)).toBe('2 h 15 min');
    const agora = t('2026-10-16T12:00:00Z').getTime();
    expect(online(t('2026-10-16T11:58:30Z'), agora)).toBe(true);
    expect(online(t('2026-10-16T11:50:00Z'), agora)).toBe(false);
    expect(online(null, agora)).toBe(false);
    expect(ehAcao('venda_caixa')).toBe(true);
    expect(ehAcao('qualquer')).toBe(false);
    expect(Object.keys(ACOES)).toHaveLength(17);
  });
});
