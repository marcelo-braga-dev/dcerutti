import { describe, expect, it } from 'vitest';
import { agruparVisitas, aparelhoDe, caminhoValido, classificarCaminho, descreverFiltros, duracaoEmPalavras, lerItensSacola, ranking, tempoDesde } from '@/lib/atividade';

describe('aparelhoDe', () => {
  it('celular, tablet e computador pelo User-Agent', () => {
    expect(aparelhoDe('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148')).toBe('celular');
    expect(aparelhoDe('Mozilla/5.0 (Linux; Android 14; SM-S918B) Chrome/120 Mobile Safari/537.36')).toBe('celular');
    expect(aparelhoDe('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('tablet');
    expect(aparelhoDe('Mozilla/5.0 (Linux; Android 13; SM-X200) Chrome/120 Safari/537.36')).toBe('tablet');
    expect(aparelhoDe('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120')).toBe('computador');
    expect(aparelhoDe(null)).toBe('computador');
  });
});

describe('caminhoValido', () => {
  it('só caminhos internos da loja', () => {
    expect(caminhoValido('/produto/ABC')).toBe(true);
    expect(caminhoValido('/catalogo?q=polo')).toBe(true);
    expect(caminhoValido('//evil.com')).toBe(false);
    expect(caminhoValido('https://x.com/')).toBe(false);
    expect(caminhoValido('/painel/clientes')).toBe(false);
    expect(caminhoValido('/api/atividade')).toBe(false);
    expect(caminhoValido('/' + 'a'.repeat(300))).toBe(false);
    expect(caminhoValido(42)).toBe(false);
  });
});

describe('classificarCaminho', () => {
  it('produto, busca, filtro ou página', () => {
    expect(classificarCaminho('/produto/REF%20123')).toEqual({ tipo: 'produto', referencia: 'REF 123' });
    const b = classificarCaminho('/catalogo?q=blusa&tamanho=M&ordem=menor-preco&pagina=2');
    expect(b).toMatchObject({ tipo: 'busca', termo: 'blusa', filtros: { tamanho: 'M' } });
    expect(classificarCaminho('/catalogo?genero=feminino&promo=1')).toEqual({ tipo: 'filtro', filtros: { genero: 'feminino', promo: true } });
    expect(classificarCaminho('/catalogo?ordem=maior-preco')).toEqual({ tipo: 'pagina' });
    expect(classificarCaminho('/sacola')).toEqual({ tipo: 'pagina' });
    expect(classificarCaminho('/produto/%E0%A4%A')).toEqual({ tipo: 'pagina' });
  });
});

describe('descreverFiltros', () => {
  it('em palavras, com os nomes de categoria e marca', () => {
    const nomes = { categorias: new Map([['blusas', 'Blusas']]), marcas: new Map([['hering', 'Hering']]) };
    expect(descreverFiltros({ genero: 'feminino', categoria: 'blusas', marca: 'hering', tamanho: 'M', promo: true }, nomes)).toBe('Feminino · Blusas · Hering · Tam. M · Em promoção');
    expect(descreverFiltros(null)).toBe('');
  });
});

describe('agruparVisitas', () => {
  const t = (min: number) => ({ criadoEm: new Date(Date.UTC(2026, 9, 15, 12, 0) - min * 60_000) });
  it('intervalo de mais de 30 min começa outra visita', () => {
    const v = agruparVisitas([t(0), t(10), t(35), t(80), t(200)]);
    expect(v.map(x => x.eventos.length)).toEqual([3, 1, 1]);
    expect(v[0].fim).toEqual(t(0).criadoEm);
    expect(v[0].inicio).toEqual(t(35).criadoEm);
  });
});

describe('ranking, duração e tempo', () => {
  it('ranking soma, ordena e calcula a parte', () => {
    expect(ranking(['a', 'b', 'a', null, 'c', 'a'], x => x)).toEqual([
      { valor: 'a', n: 3, parte: 0.6 }, { valor: 'b', n: 1, parte: 0.2 }, { valor: 'c', n: 1, parte: 0.2 },
    ]);
  });
  it('duracaoEmPalavras', () => {
    expect(duracaoEmPalavras(45)).toBe('45 s');
    expect(duracaoEmPalavras(180)).toBe('3 min');
    expect(duracaoEmPalavras(3600 + 20 * 60)).toBe('1 h 20 min');
    expect(duracaoEmPalavras(null)).toBe('0 s');
  });
  it('tempoDesde', () => {
    const agora = new Date('2026-10-15T12:00:00Z');
    expect(tempoDesde(null, agora)).toBe('nunca');
    expect(tempoDesde(new Date('2026-10-15T11:59:30Z'), agora)).toBe('agora');
    expect(tempoDesde(new Date('2026-10-15T11:30:00Z'), agora)).toBe('há 30 min');
    expect(tempoDesde(new Date('2026-10-15T09:00:00Z'), agora)).toBe('há 3 h');
    expect(tempoDesde(new Date('2026-10-14T10:00:00Z'), agora)).toBe('ontem');
    expect(tempoDesde(new Date('2026-10-10T12:00:00Z'), agora)).toBe('há 5 dias');
  });
  it('lerItensSacola ignora linhas tortas', () => {
    expect(lerItensSacola([{ varianteId: 1, quantidade: 2 }, { varianteId: 'x', quantidade: 1 }, { varianteId: 2, quantidade: 0 }, null])).toEqual([{ varianteId: 1, quantidade: 2 }]);
    expect(lerItensSacola('lixo')).toEqual([]);
  });
});
