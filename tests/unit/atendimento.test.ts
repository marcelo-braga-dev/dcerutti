import { describe, expect, it } from 'vitest';
import { etapaDoFechamento, linkDirect, montarResposta, normalizarInstagram, RESPOSTAS_DA_LOJA, variaveisDesconhecidas } from '@/lib/atendimento';

describe('normalizarInstagram', () => {
  it('aceita @, link e maiúsculas', () => {
    expect(normalizarInstagram('@Fulana_01')).toBe('fulana_01');
    expect(normalizarInstagram(' https://www.instagram.com/Fulana.Silva/?hl=pt ')).toBe('fulana.silva');
    expect(normalizarInstagram('fulana')).toBe('fulana');
  });
  it('recusa o que não é usuário', () => {
    for (const v of ['', '@', 'com espaço', 'a'.repeat(31), '<script>', 'javascript:alert(1)']) expect(normalizarInstagram(v)).toBeNull();
  });
  it('o link do Direct não aceita caminho injetado', () => {
    expect(linkDirect('fulana')).toBe('https://ig.me/m/fulana');
    expect(linkDirect('a/../b')).toBe('https://ig.me/m/a%2F..%2Fb');
  });
});

describe('respostas prontas', () => {
  it('troca as variáveis', () => {
    expect(montarResposta('Oi, {nome}! Aqui é {vendedora}, da {loja}.', { nome: 'Ana', vendedora: 'Bia', loja: "D'Cerutti" })).toBe("Oi, Ana! Aqui é Bia, da D'Cerutti.");
  });
  it('sem valor, a variável sai e o texto fica limpo', () => {
    expect(montarResposta('Oi {nome}, tudo bem?', {})).toBe('Oi, tudo bem?');
    expect(montarResposta('{nome}, separei.', {})).toBe('separei.');
  });
  it('variável inexistente fica à vista e é apontada', () => {
    expect(montarResposta('Oi {nmoe}', { nome: 'Ana' })).toBe('Oi {nmoe}');
    expect(variaveisDesconhecidas('Oi {nmoe}, {nome}')).toEqual(['nmoe']);
  });
  it('os modelos da loja usam só variáveis que existem', () => {
    for (const r of RESPOSTAS_DA_LOJA) expect(variaveisDesconhecidas(r.texto)).toEqual([]);
  });
});

describe('etapaDoFechamento', () => {
  it('só venda vira Vendido', () => {
    expect(etapaDoFechamento('confirmado', true)).toBe('ganho');
    expect(etapaDoFechamento('confirmado', false)).toBe('em_conversa');
    expect(etapaDoFechamento('cancelado', false)).toBe('em_conversa');
  });
});
