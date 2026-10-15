import { describe, expect, it } from 'vitest';
import { LIMITE_MENSAGEM, mensagemDoCliente, montarMensagemPedido, saudacao, textoSeguro, totaisDaMensagem, type DadosMensagemPedido } from '@/lib/mensagem-pedido';

const espacos = (s: string) => s.replace(/ /g, ' ');
// 15/10/2026 às 10h em São Paulo (13h UTC).
const MANHA = new Date('2026-10-15T13:00:00Z');

const base: DadosMensagemPedido = {
  tipo: 'compra', codigo: 'PED-000123', nomeCliente: 'Mariana Souza', nomeVendedor: 'Ana Paula', agora: MANHA,
  site: 'https://dcerutti.com.br', linkPedido: 'https://dcerutti.com.br/painel/pedidos/abc',
  itens: [
    { nome: 'Vestido Midi', marca: 'Hering', referencia: 'V1', tamanho: 'M', cor: 'Preto', codigoInterno: '21306', quantidade: 1, preco: 199.9, imagem: '/arquivos/produtos/V1/a.webp' },
    { nome: 'Camiseta Básica', marca: 'Hering', referencia: 'C1', tamanho: 'G', cor: null, quantidade: 3, preco: 50 },
  ],
};

describe('saudação no fuso de São Paulo', () => {
  it('bom dia, boa tarde e boa noite', () => {
    expect(saudacao(new Date('2026-10-15T13:00:00Z'))).toBe('Bom dia'); // 10h
    expect(saudacao(new Date('2026-10-15T17:00:00Z'))).toBe('Boa tarde'); // 14h
    expect(saudacao(new Date('2026-10-15T23:30:00Z'))).toBe('Boa noite'); // 20h30
    expect(saudacao(new Date('2026-10-15T06:00:00Z'))).toBe('Boa noite'); // 3h
  });
});

describe('textoSeguro', () => {
  it('tira a marcação do WhatsApp, junta espaços e corta textos longos', () => {
    expect(textoSeguro('Blusa *Nova* _linda_ ~off~ `x`')).toBe('Blusa Nova linda off x');
    expect(textoSeguro('  linha 1\n\nlinha 2  ')).toBe('linha 1 linha 2');
    expect(textoSeguro('a'.repeat(100), 10)).toBe(`${'a'.repeat(9)}…`);
    expect(textoSeguro(null)).toBe('');
  });
});

describe('mensagem do pedido (compra)', () => {
  const t = espacos(mensagemDoCliente(base));
  it('cumprimenta o vendedor pelo primeiro nome e se apresenta', () => {
    expect(t.startsWith('Bom dia, Ana! 👋\nAqui é Mariana. Acabei de fazer um pedido')).toBe(true);
  });
  it('cada peça com tamanho em destaque, cor, marca, referência, código e valor', () => {
    expect(t).toContain('🛍️ *PEDIDO PED-000123*');
    expect(t).toContain('*1. Vestido Midi*\nTam. *M* · Preto · Hering\nRef. V1 · Cód. 21306\n*R$ 199,90*\n📷 https://dcerutti.com.br/arquivos/produtos/V1/a.webp');
    expect(t).toContain('*2. Camiseta Básica*\nTam. *G* · Hering\nRef. C1\n3 × R$ 50,00 = *R$ 150,00*');
  });
  it('resumo com frete a combinar, link do pedido, nome e fecho', () => {
    expect(t).toContain('🧾 *Resumo · 4 peças*\nPeças: R$ 349,90\n🚚 Frete: a combinar\n💳 *Total: R$ 349,90 + frete*');
    expect(t).toContain('👤 Mariana Souza\n🔗 Pedido completo: https://dcerutti.com.br/painel/pedidos/abc');
    expect(t.endsWith('Você confirma as peças para mim? Fico no aguardo!')).toBe(true);
    expect(t).not.toMatch(/null|undefined|NaN/);
  });
  it('frete cobrado, grátis e cupom', () => {
    expect(espacos(mensagemDoCliente({ ...base, frete: 24.9 }))).toContain('🚚 Frete: R$ 24,90\n💳 *Total: R$ 374,80*');
    expect(espacos(mensagemDoCliente({ ...base, frete: 0 }))).toContain('🚚 Frete: grátis\n💳 *Total: R$ 349,90*');
    const c = espacos(mensagemDoCliente({ ...base, frete: 24.9, cupom: { codigo: 'BEMVINDA', desconto: 35, freteGratis: false } }));
    expect(c).toContain('Peças: R$ 349,90\n🎟️ Cupom BEMVINDA: −R$ 35,00\n🚚 Frete: R$ 24,90\n💳 *Total: R$ 339,80*');
    const g = espacos(mensagemDoCliente({ ...base, frete: 0, cupom: { codigo: 'FRETE0', desconto: 0, freteGratis: true } }));
    expect(g).toContain('🚚 Frete: grátis (cupom FRETE0)');
    expect(g).not.toContain('−R$');
  });
  it('sem vendedor (vai para a loja), cumprimenta a equipe', () => {
    expect(mensagemDoCliente({ ...base, nomeVendedor: null })).toMatch(/^Bom dia, equipe D’Cerutti! 👋/);
  });
  it('asterisco no nome da peça não quebra o negrito', () => {
    const m = mensagemDoCliente({ ...base, itens: [{ ...base.itens[0], nome: 'Blusa *Edição* Especial' }] });
    expect(m).toContain('*1. Blusa Edição Especial*');
  });
});

describe('mensagem do condicional', () => {
  const t = espacos(mensagemDoCliente({ ...base, tipo: 'condicional', codigo: 'COND-000045', cep: '89874-000', cidadeCondicional: 'Maravilha/SC', frete: 20, cupom: { codigo: 'DEZ', desconto: 10, freteGratis: false } }));
  it('valor das peças, cupom sobre o que ficar, CEP e sem frete', () => {
    expect(t).toContain('🏠 *CONDICIONAL COND-000045*');
    expect(t).toContain('para provar em casa');
    expect(t).toContain('🎟️ Cupom DEZ (sobre o que ficar): −R$ 10,00\n💳 *Valor das peças: R$ 339,90*');
    expect(t).toContain('📍 Entrega: CEP 89874-000 · Maravilha/SC');
    expect(t).not.toContain('Frete');
    expect(t.endsWith('Qual o melhor dia e horário para a entrega? Fico no aguardo!')).toBe(true);
  });
});

describe('tamanho da mensagem', () => {
  const muitas = Array.from({ length: 30 }, (_, n) => ({ ...base.itens[0], referencia: `R${n}`, nome: `Peça número ${n} com um nome comprido de catálogo`, imagem: `/arquivos/produtos/R${n}/foto-grande-${n}.webp` }));
  it('pedido pequeno vai completo, com as fotos', () => {
    expect(montarMensagemPedido(base).formato).toBe('completo');
  });
  it('pedido grande compacta (sem fotos) e, se ainda passar, uma linha por peça; totais e link sempre vão', () => {
    const medio = montarMensagemPedido({ ...base, itens: muitas.slice(0, 18) });
    expect(medio.formato).toBe('compacto');
    expect(medio.texto.length).toBeLessThanOrEqual(LIMITE_MENSAGEM);
    expect(medio.texto).not.toContain('📷');
    expect(medio.texto).toContain('🔗 Pedido completo, com as fotos:');
    const grande = montarMensagemPedido({ ...base, itens: muitas });
    expect(grande.formato).toBe('resumido');
    expect(grande.texto).toContain('30. Peça número 29');
    expect(grande.texto).toContain('*Total:');
    expect(grande.texto).toContain('/painel/pedidos/abc');
  });
});

describe('totaisDaMensagem', () => {
  it('soma em centavos, desconto e frete só na compra', () => {
    expect(totaisDaMensagem({ tipo: 'compra', itens: [{ ...base.itens[0], preco: 0.1, quantidade: 3 }], frete: 0.2, cupom: null })).toEqual({ pecas: 3, subtotal: 0.3, desconto: 0, frete: 0.2, total: 0.5 });
    expect(totaisDaMensagem({ tipo: 'condicional', itens: base.itens, frete: 20, cupom: null }).frete).toBeNull();
  });
});

describe('link público na mensagem (D-20)', () => {
  const t = mensagemDoCliente({ ...base, linkPublico: 'https://dcerutti.com.br/p/PED-000123.abcdefghijklmnop' });
  it('é o primeiro link (o WhatsApp mostra a prévia dele) e as fotos de cada peça saem', () => {
    const links = t.match(/https:\/\/\S+/g)!;
    expect(links[0]).toBe('https://dcerutti.com.br/p/PED-000123.abcdefghijklmnop');
    expect(t).toContain('🛍️ *PEDIDO PED-000123*\n🖼️ Fotos e detalhes: https://dcerutti.com.br/p/PED-000123.abcdefghijklmnop\n━');
    expect(t).not.toContain('📷');
    expect(t).toContain('🔐 No painel da loja: https://dcerutti.com.br/painel/pedidos/abc');
  });
});
