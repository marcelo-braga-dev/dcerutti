import { describe, expect, it } from 'vitest';
import { contraste, CORES, CORES_PADRAO, coresDe, cssDoTema, IDENTIDADE_PADRAO, lerCor, soMudadas } from '@/lib/identidade';

describe('identidade visual (D-25)', () => {
  it('os padrões espelham o globals.css', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/app/globals.css', 'utf8');
    for (const c of CORES) expect(css, c.token).toContain(`--color-${c.token}: ${c.padrao};`);
  });
  it('lê a cor digitada', () => {
    expect(lerCor('#1F3A5F')).toBe('#1f3a5f');
    expect(lerCor('abc')).toBe('#aabbcc');
    expect(lerCor(' 2e2520 ')).toBe('#2e2520');
    expect(lerCor('#12345')).toBeNull();
    expect(lerCor('azul')).toBeNull();
  });
  it('grava só o que mudou e gera o CSS só disso', () => {
    expect(soMudadas({ ...CORES_PADRAO })).toEqual({});
    expect(soMudadas({ ...CORES_PADRAO, caramelo: '#C27C2C' })).toEqual({ caramelo: '#c27c2c' });
    expect(cssDoTema({})).toBe('');
    expect(cssDoTema({ 'marrom-950': '#1f3a5f', creme: CORES_PADRAO.creme })).toBe('html:root{--color-marrom-950:#1f3a5f}');
    expect(cssDoTema({ caramelo: 'red;}body{display:none' })).toBe('');
  });
  it('completa com os padrões', () => {
    expect(coresDe(IDENTIDADE_PADRAO)).toEqual(CORES_PADRAO);
    expect(coresDe({ ...IDENTIDADE_PADRAO, cores: { oliva: '#000000' } }).oliva).toBe('#000000');
  });
  it('contraste WCAG', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contraste('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contraste(CORES_PADRAO['marrom-900'], CORES_PADRAO.creme)).toBeGreaterThan(4.5);
  });
});

describe('nome da loja (D-25)', async () => {
  const { lembrarLoja, nomeComSlogan, nomeDaLoja, NOME_PADRAO, SLOGAN_PADRAO } = await import('@/lib/loja');
  const { mensagemConvite } = await import('@/lib/whatsapp');
  it('padrão, configurado e de volta ao padrão', () => {
    expect(nomeDaLoja()).toBe(NOME_PADRAO);
    lembrarLoja({ nome: 'Loja Teste', slogan: '' });
    expect(nomeDaLoja()).toBe('Loja Teste');
    expect(nomeComSlogan()).toBe('Loja Teste');
    expect(mensagemConvite('Ana Souza', 'https://x/c')).toContain('Aqui é Ana, da Loja Teste.');
    lembrarLoja({});
    expect(nomeComSlogan()).toBe(`${NOME_PADRAO} — ${SLOGAN_PADRAO}`);
  });
});
