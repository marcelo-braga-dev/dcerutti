import { describe, expect, it } from 'vitest';
import { CONTEUDO_INICIO_VAZIO, limparLink, linkDe, linkPadrao, linkValido, normalizarConteudo } from '@/lib/conteudo-inicio';

describe('links da página inicial', () => {
  it('aceita caminho da loja, http(s), mailto e tel', () => {
    for (const v of ['/catalogo', '/catalogo?promo=1&ordem=desconto', 'https://site.com.br/a?b=1', 'http://site.com', 'mailto:loja@site.com', 'tel:+5549988036499'])
      expect(linkValido(v)).toBe(true);
  });
  it('recusa script, outros esquemas e caminhos que levam a outro site', () => {
    for (const v of ['', 'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', 'vbscript:x', '//site-falso.com', '/\\site-falso.com', '/\tx', 'catalogo', 'https://', 'https://a b.com', `/${'a'.repeat(500)}`])
      expect(linkValido(v)).toBe(false);
  });
  it('limparLink completa domínio, deixa vazio e recusa o inválido', () => {
    expect(limparLink('  /catalogo ')).toBe('/catalogo');
    expect(limparLink('site.com.br/a')).toBe('https://site.com.br/a');
    expect(limparLink('wa.me/5549988036499')).toBe('https://wa.me/5549988036499');
    expect(limparLink('   ')).toBe('');
    expect(limparLink('javascript:alert(1)')).toBeNull();
    expect(limparLink('catalogo')).toBeNull();
  });
  it('linkPadrao conhece os campos fixos e os cards do catálogo', () => {
    expect(linkPadrao('banner.botao2')).toBe('/catalogo?promo=1');
    expect(linkPadrao('confianca.1')).toBe('');
    expect(linkPadrao('marca.john-john')).toBe('/catalogo?marca=john-john');
    expect(linkPadrao('preco.ate-50')).toBe('/catalogo?preco=ate-50');
    for (const c of ['nada', 'toString', 'marca.', 'marca.a/b', 'outro.x']) expect(linkPadrao(c)).toBeNull();
  });
  it('linkDe usa o escolhido e, sem ele, o padrão', () => {
    const c = { ...CONTEUDO_INICIO_VAZIO, links: { 'banner.botao1': '/sacola' } };
    expect(linkDe(c, 'banner.botao1')).toBe('/sacola');
    expect(linkDe(c, 'banner.botao2')).toBe('/catalogo?promo=1');
    expect(linkDe(c, 'confianca.1')).toBe('');
  });
  it('normalizarConteudo guarda só o link válido, de campo conhecido e diferente do padrão', () => {
    const { links } = normalizarConteudo({ ...CONTEUDO_INICIO_VAZIO, links: {
      'banner.botao1': '/sacola',
      'banner.botao2': '/catalogo?promo=1',
      'marca.hering': 'https://site.com',
      'confianca.1': 'javascript:alert(1)',
      'nao.existe': '/sacola',
    } });
    expect(links).toEqual({ 'banner.botao1': '/sacola', 'marca.hering': 'https://site.com' });
  });
  it('normalizarConteudo aceita conteúdo salvo antes dos links', () => {
    const antigo = { textos: {}, imagens: {}, ocultas: [] } as never;
    expect(normalizarConteudo(antigo).links).toEqual({});
  });
});
