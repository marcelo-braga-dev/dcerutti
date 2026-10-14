import { describe, expect, it } from 'vitest';
import { avaliarCupom, codigoValido, normalizarCodigo, pecaElegivel, regraEmPalavras, situacaoCupom, type ContextoCupom, type PecaCupom, type RegraCupom } from '@/lib/cupom';

const agora = new Date('2026-10-14T15:00:00-03:00');
const cupom = (o: Partial<RegraCupom> = {}): RegraCupom => ({
  codigo: 'TESTE10', tipo: 'percentual', valor: 10, tetoDesconto: null, minimoCompra: null,
  inicioEm: new Date('2026-10-01T00:00:00-03:00'), fimEm: null, limiteTotal: null, limitePorCliente: 1,
  somentePrimeiraCompra: false, valePromocao: false, quemAplica: 'ambos', ativo: true,
  categorias: [], marcas: [], produtos: [], clientes: [], ...o,
});
const ctx = (o: Partial<ContextoCupom> = {}): ContextoCupom => ({ agora, quem: 'cliente', clienteId: 'c1', usosTotal: 0, usosCliente: 0, jaComprou: false, tipoPedido: 'compra', ...o });
const peca = (chave: number, preco: number, o: Partial<PecaCupom<number>> = {}): PecaCupom<number> => ({ chave, produtoId: chave, categoriaId: 1, marcaId: 1, emPromocao: false, preco, quantidade: 1, ...o });

const camiseta = peca(1, 100, { categoriaId: 1 });
const calca = peca(2, 200, { categoriaId: 2 });

describe('avaliarCupom: cálculo', () => {
  it('percentual na loja toda, distribuído pelas peças', () => {
    expect(avaliarCupom(cupom(), [camiseta, calca], ctx())).toEqual({ ok: true, desconto: 30, freteGratis: false, descontos: [{ chave: 1, valor: 10 }, { chave: 2, valor: 20 }] });
  });

  it('valor fixo só na categoria escolhida', () => {
    const r = avaliarCupom(cupom({ tipo: 'valor', valor: 30, categorias: [2] }), [camiseta, calca], ctx());
    expect(r).toMatchObject({ ok: true, desconto: 30, descontos: [{ chave: 1, valor: 0 }, { chave: 2, valor: 30 }] });
  });

  it('abrangência por marca e por produto', () => {
    expect(avaliarCupom(cupom({ marcas: [9] }), [camiseta, peca(3, 50, { marcaId: 9 })], ctx())).toMatchObject({ ok: true, desconto: 5 });
    expect(avaliarCupom(cupom({ produtos: [1] }), [camiseta, calca], ctx())).toMatchObject({ ok: true, desconto: 10 });
  });

  it('teto do percentual', () => {
    expect(avaliarCupom(cupom({ valor: 15, tetoDesconto: 10 }), [camiseta], ctx())).toMatchObject({ ok: true, desconto: 10 });
  });

  it('valor fixo maior que as peças nunca deixa o preço negativo', () => {
    expect(avaliarCupom(cupom({ tipo: 'valor', valor: 100 }), [peca(1, 80)], ctx())).toMatchObject({ ok: true, desconto: 80 });
  });

  it('quantidade conta no valor da linha', () => {
    expect(avaliarCupom(cupom(), [peca(1, 49.9, { quantidade: 3 })], ctx())).toMatchObject({ ok: true, desconto: 14.97 });
  });

  it('distribuição em centavos: a soma das partes é o desconto, sem sobra', () => {
    const pecas = [peca(1, 33.33), peca(2, 33.33), peca(3, 33.34)];
    const r = avaliarCupom(cupom({ tipo: 'valor', valor: 10 }), pecas, ctx());
    if (!r.ok) throw new Error(r.mensagem);
    expect(Math.round(r.descontos.reduce((a, d) => a + d.valor, 0) * 100)).toBe(1000);
    expect(r.descontos.every(d => Number.isInteger(Math.round(d.valor * 100)))).toBe(true);
  });

  it('promoção: escolha do cupom', () => {
    const promo = peca(1, 100, { emPromocao: true });
    expect(avaliarCupom(cupom(), [promo, calca], ctx())).toMatchObject({ ok: true, desconto: 20 });
    expect(avaliarCupom(cupom({ valePromocao: true }), [promo, calca], ctx())).toMatchObject({ ok: true, desconto: 30 });
    expect(avaliarCupom(cupom(), [promo], ctx())).toMatchObject({ ok: false, recusa: 'semPecas' });
  });

  it('mínimo é sobre o pedido todo (P-08), mesmo com peças fora da abrangência', () => {
    const c = cupom({ categorias: [2], minimoCompra: 250 });
    expect(avaliarCupom(c, [camiseta, calca], ctx())).toMatchObject({ ok: true, desconto: 20 });
    expect(avaliarCupom(c, [calca], ctx())).toMatchObject({ ok: false, recusa: 'minimo', mensagem: expect.stringMatching(/Faltam R\$\s50,00/) });
  });

  it('soma com o desconto do vendedor: calcula sobre o preço combinado (P-11)', () => {
    expect(avaliarCupom(cupom(), [peca(1, 90)], ctx())).toMatchObject({ ok: true, desconto: 9 });
  });

  it('frete grátis: zera o frete, sem desconto nas peças; recusado sem entrega', () => {
    const c = cupom({ tipo: 'freteGratis', valor: null, minimoCompra: 80 });
    expect(avaliarCupom(c, [camiseta], ctx())).toEqual({ ok: true, desconto: 0, freteGratis: true, descontos: [{ chave: 1, valor: 0 }] });
    expect(avaliarCupom(c, [camiseta], ctx({ tipoPedido: 'condicional' }))).toMatchObject({ ok: false, recusa: 'semFrete' });
    expect(avaliarCupom(c, [camiseta], ctx({ tipoPedido: 'balcao' }))).toMatchObject({ ok: false, recusa: 'semFrete' });
    expect(avaliarCupom(c, [peca(1, 50)], ctx())).toMatchObject({ ok: false, recusa: 'minimo' });
  });
});

describe('avaliarCupom: recusas', () => {
  it('desativado, quem aplica, primeira compra, cliente específico', () => {
    expect(avaliarCupom(cupom({ ativo: false }), [camiseta], ctx())).toMatchObject({ ok: false, recusa: 'desativado' });
    expect(avaliarCupom(cupom({ quemAplica: 'equipe' }), [camiseta], ctx())).toMatchObject({ ok: false, recusa: 'quem', mensagem: /vendedor/ });
    expect(avaliarCupom(cupom({ quemAplica: 'cliente' }), [camiseta], ctx({ quem: 'equipe' }))).toMatchObject({ ok: false, recusa: 'quem', mensagem: /sacola/ });
    expect(avaliarCupom(cupom({ somentePrimeiraCompra: true }), [camiseta], ctx({ jaComprou: true }))).toMatchObject({ ok: false, recusa: 'primeiraCompra' });
    expect(avaliarCupom(cupom({ clientes: ['c2'] }), [camiseta], ctx())).toMatchObject({ ok: false, recusa: 'cliente' });
    expect(avaliarCupom(cupom({ clientes: ['c1'] }), [camiseta], ctx())).toMatchObject({ ok: true });
  });

  it('limites total e por cliente', () => {
    expect(avaliarCupom(cupom({ limiteTotal: 5 }), [camiseta], ctx({ usosTotal: 5 }))).toMatchObject({ ok: false, recusa: 'esgotado' });
    expect(avaliarCupom(cupom({ limiteTotal: 5 }), [camiseta], ctx({ usosTotal: 4 }))).toMatchObject({ ok: true });
    expect(avaliarCupom(cupom(), [camiseta], ctx({ usosCliente: 1 }))).toMatchObject({ ok: false, recusa: 'jaUsou' });
    expect(avaliarCupom(cupom({ limitePorCliente: null }), [camiseta], ctx({ usosCliente: 9 }))).toMatchObject({ ok: true });
  });

  it('validade nas bordas, no fuso de São Paulo', () => {
    const c = cupom({ inicioEm: new Date('2026-10-14T00:00:00-03:00'), fimEm: new Date('2026-10-14T23:59:59.999-03:00') });
    expect(avaliarCupom(c, [camiseta], ctx({ agora: new Date('2026-10-13T23:59:59-03:00') }))).toMatchObject({ ok: false, recusa: 'agendado', mensagem: 'Este cupom começa em 14/10/2026.' });
    expect(avaliarCupom(c, [camiseta], ctx({ agora: new Date('2026-10-14T00:00:00-03:00') }))).toMatchObject({ ok: true });
    expect(avaliarCupom(c, [camiseta], ctx({ agora: new Date('2026-10-14T23:59:59-03:00') }))).toMatchObject({ ok: true });
    expect(avaliarCupom(c, [camiseta], ctx({ agora: new Date('2026-10-15T00:00:00-03:00') }))).toMatchObject({ ok: false, recusa: 'expirado', mensagem: 'Este cupom expirou em 14/10/2026.' });
  });
});

describe('apoio', () => {
  it('código normalizado e validado', () => {
    expect(normalizarCodigo(' primavera 10 ')).toBe('PRIMAVERA10');
    expect(codigoValido('PRIMAVERA-10')).toBe(true);
    expect(codigoValido('AB')).toBe(false);
    expect(codigoValido('COM ESPAÇO')).toBe(false);
    expect(codigoValido('-INICIO')).toBe(false);
  });

  it('situação do cupom', () => {
    const c = cupom({ limiteTotal: 2, fimEm: new Date('2026-10-20T23:59:59-03:00') });
    expect(situacaoCupom(c, 0, agora)).toBe('ativo');
    expect(situacaoCupom(c, 2, agora)).toBe('esgotado');
    expect(situacaoCupom({ ...c, ativo: false }, 0, agora)).toBe('desativado');
    expect(situacaoCupom(c, 0, new Date('2026-10-21T00:00:00-03:00'))).toBe('expirado');
    expect(situacaoCupom({ ...c, inicioEm: new Date('2026-10-15T00:00:00-03:00') }, 0, agora)).toBe('agendado');
  });

  it('peça elegível sem abrangência = loja toda', () => {
    expect(pecaElegivel(cupom(), camiseta)).toBe(true);
    expect(pecaElegivel(cupom({ categorias: [5] }), camiseta)).toBe(false);
  });

  it('regra em palavras', () => {
    expect(regraEmPalavras(cupom({ valor: 15, tetoDesconto: 50, minimoCompra: 150, fimEm: new Date('2026-12-31T23:59:59-03:00') }), ['Calças']))
      .toMatch(/^15% de desconto \(até R\$\s50,00\) · em Calças · em compras a partir de R\$\s150,00 · não vale para produtos em promoção · uma vez por cliente · até 31\/12\/2026$/);
    expect(regraEmPalavras(cupom({ tipo: 'freteGratis', valor: null, valePromocao: true, limitePorCliente: null }))).toBe('Frete grátis');
  });
});
