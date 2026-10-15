import { beforeAll, describe, expect, it } from 'vitest';
import { chaveDoPedido, codigoDaChave, linkPublicoDoPedido } from '@/server/link-pedido';

beforeAll(() => { process.env.LINK_PEDIDO_SEGREDO = 'segredo-de-teste-do-link-de-pedido'; });

describe('link público do pedido (D-20)', () => {
  it('chave = código + assinatura de 16 caracteres; volta ao código', () => {
    const c = chaveDoPedido('PED-000123');
    expect(c).toMatch(/^PED-000123\.[A-Za-z0-9_-]{16}$/);
    expect(codigoDaChave(c)).toBe('PED-000123');
    expect(codigoDaChave(chaveDoPedido('COND-000045'))).toBe('COND-000045');
  });
  it('recusa assinatura adulterada, de outro pedido ou com formato errado', () => {
    const c = chaveDoPedido('PED-000123');
    const assinatura = c.split('.')[1];
    expect(codigoDaChave(`PED-000124.${assinatura}`)).toBeNull();
    expect(codigoDaChave(`PED-000123.${assinatura.slice(0, -1)}${assinatura.endsWith('A') ? 'B' : 'A'}`)).toBeNull();
    for (const ruim of ['', 'PED-000123', 'PED-000123.', 'X-000123.aaaaaaaaaaaaaaaa', `../${c}`, null, undefined]) expect(codigoDaChave(ruim)).toBeNull();
  });
  it('outro segredo, outra assinatura', () => {
    const antes = chaveDoPedido('PED-000123');
    process.env.LINK_PEDIDO_SEGREDO = 'outro-segredo';
    expect(codigoDaChave(antes)).toBeNull();
    process.env.LINK_PEDIDO_SEGREDO = 'segredo-de-teste-do-link-de-pedido';
  });
  it('não assina código inválido; monta o endereço com o site', () => {
    expect(() => chaveDoPedido('qualquer')).toThrow();
    expect(linkPublicoDoPedido('https://dcerutti.com.br/', 'PED-000001')).toMatch(/^https:\/\/dcerutti\.com\.br\/p\/PED-000001\.[A-Za-z0-9_-]{16}$/);
  });
});
