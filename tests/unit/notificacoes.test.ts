import { describe, expect, it } from 'vitest';
import { lerPreferencias, quer, TIPOS_NOTIFICACAO } from '@/lib/notificacoes';

describe('notificações (D-28)', () => {
  it('padrões: tudo no painel; e-mail só nos tipos que já mandavam e-mail', () => {
    const p = lerPreferencias(null);
    expect(quer(p, 'carrinho_visto', 'painel')).toBe(true);
    expect(quer(p, 'pedido_novo', 'email')).toBe(true);
    expect(quer(p, 'sacola_parada', 'email')).toBe(true);
    expect(quer(p, 'carrinho_visto', 'email')).toBe(false);
  });
  it('a lista guarda a escolha contrária ao padrão', () => {
    const p = lerPreferencias({ painel: ['meta_batida'], email: ['pedido_novo', 'carrinho_visto', 'inventado'] });
    expect(p.email).toEqual(['pedido_novo', 'carrinho_visto']);
    expect(quer(p, 'meta_batida', 'painel')).toBe(false);
    expect(quer(p, 'pedido_novo', 'email')).toBe(false);
    expect(quer(p, 'carrinho_visto', 'email')).toBe(true);
  });
  it('peça esgotada é só do gestor', () => {
    expect(TIPOS_NOTIFICACAO.peca_esgotada.soGestor).toBe(true);
  });
});
