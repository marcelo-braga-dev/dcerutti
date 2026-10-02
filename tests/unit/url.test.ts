import { describe, expect, it } from 'vitest';
import { caminhoInterno } from '@/lib/url';

describe('caminhoInterno (C-02)', () => {
  it('aceita caminhos do próprio site', () => {
    expect(caminhoInterno('/painel/pedidos')).toBe('/painel/pedidos');
    expect(caminhoInterno('/catalogo?genero=feminino')).toBe('/catalogo?genero=feminino');
  });
  it('recusa destinos externos e malformados', () => {
    for (const v of ['//site-falso.com', '/\\site-falso.com', '/\\/site-falso.com', 'https://site-falso.com', 'site-falso.com', '/\tsite', '', null, undefined])
      expect(caminhoInterno(v)).toBeNull();
  });
});
