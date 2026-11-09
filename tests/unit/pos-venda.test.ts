import { describe, expect, it } from 'vitest';
import { aceitaOfertas, consentimento, contatosDoPedido, DIAS_POS_VENDA, ehOferta, tempoLegivel, textoPosVenda } from '@/lib/pos-venda';

const agora = new Date('2026-11-09T12:00:00Z');
const dia = 86_400_000;

describe('contatosDoPedido', () => {
  it('venda online: os quatro, nos dias configurados', () => {
    const c = contatosDoPedido('loja', DIAS_POS_VENDA, agora);
    expect(c.map(x => x.tipo)).toEqual(['entrega', 'satisfacao', 'sugestao', 'reativacao']);
    expect(c[0].venceEm.getTime()).toBe(agora.getTime() + dia);
    expect(c[3].venceEm.getTime()).toBe(agora.getTime() + 90 * dia);
  });
  it('venda na loja física: só os de oferta', () => {
    expect(contatosDoPedido('balcao', DIAS_POS_VENDA, agora).map(x => x.tipo)).toEqual(['sugestao', 'reativacao']);
  });
  it('oferta é sugestão e reativação', () => {
    expect(['entrega', 'satisfacao'].some(ehOferta)).toBe(false);
    expect(['sugestao', 'reativacao'].every(ehOferta)).toBe(true);
  });
});

describe('consentimento', () => {
  const antes = new Date('2026-01-01');
  it('marcar registra o aceite; marcar de novo não muda a data', () => {
    expect(consentimento(null, true, agora)).toEqual({ aceitaOfertasEm: agora, descadastradaEm: null });
    const aceito = { aceitaOfertasEm: antes, descadastradaEm: null };
    expect(consentimento(aceito, true, agora)).toEqual(aceito);
  });
  it('desmarcar quem aceitou registra a saída; quem nunca aceitou continua igual', () => {
    expect(consentimento({ aceitaOfertasEm: antes, descadastradaEm: null }, false, agora)).toEqual({ aceitaOfertasEm: antes, descadastradaEm: agora });
    expect(consentimento(null, false, agora)).toEqual({ aceitaOfertasEm: null, descadastradaEm: null });
  });
  it('devolve só as duas datas, mesmo recebendo a ficha inteira', () => {
    const ficha = { id: 'x', nome: 'Ana', user: { id: 'u' }, aceitaOfertasEm: antes, descadastradaEm: null };
    for (const marcado of [true, false]) expect(Object.keys(consentimento(ficha, marcado, agora)).sort()).toEqual(['aceitaOfertasEm', 'descadastradaEm']);
    expect(Object.keys(consentimento({ ...ficha, aceitaOfertasEm: null }, false, agora)).sort()).toEqual(['aceitaOfertasEm', 'descadastradaEm']);
  });
  it('quem saiu e marca de novo volta, com aceite novo', () => {
    const saiu = { aceitaOfertasEm: antes, descadastradaEm: antes };
    expect(aceitaOfertas(saiu)).toBe(false);
    expect(consentimento(saiu, false, agora)).toEqual(saiu);
    expect(consentimento(saiu, true, agora)).toEqual({ aceitaOfertasEm: agora, descadastradaEm: null });
    expect(aceitaOfertas(consentimento(saiu, true, agora))).toBe(true);
  });
});

describe('textos', () => {
  it('texto do pós-venda sem variável sobrando', () => {
    for (const t of ['entrega', 'satisfacao', 'sugestao', 'reativacao'] as const) expect(textoPosVenda(t, { nome: 'Ana', vendedora: 'Bia', loja: 'Loja' })).not.toContain('{');
  });
  it('tempo legível', () => {
    expect(tempoLegivel(null)).toBe('—');
    expect(tempoLegivel(45)).toBe('45 min');
    expect(tempoLegivel(180)).toBe('3 h');
    expect(tempoLegivel(3 * 24 * 60)).toBe('3 dias');
  });
});
