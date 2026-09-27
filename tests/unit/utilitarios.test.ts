import { describe, expect, it } from 'vitest';
import { brl, descontoPct, lerValor } from '@/lib/dinheiro';
import { dataDoFormulario, diaDe, intervaloDoMes, mesDe, somarMeses } from '@/lib/datas';
import { celularValido, formatarCep, formatarTelefone, numeroWhatsApp } from '@/lib/telefone';
import { linkWhatsApp, mensagemDoCliente } from '@/lib/whatsapp';

describe('dinheiro', () => {
  it('lê valores digitados no formato brasileiro', () => {
    expect(lerValor('1.259,70')).toBe(1259.7);
    expect(lerValor('289,9')).toBe(289.9);
    expect(lerValor('R$ 15000')).toBe(15000);
    expect(lerValor('abc')).toBeNaN();
    expect(lerValor('')).toBeNaN();
  });
  it('formata em reais', () => expect(brl(1259.7).replace(/\s/g, ' ')).toBe('R$ 1.259,70'));
  it('desconto', () => {
    expect(descontoPct(44.99, 89.99)).toBe(50);
    expect(descontoPct(50, 50)).toBe(0);
  });
});

describe('datas no fuso de São Paulo (RN-12)', () => {
  it('venda às 22h do último dia do mês fica no mês certo', () => {
    const noite = new Date('2026-09-30T22:30:00-03:00'); // já é 1º de outubro em UTC
    expect(noite.toISOString().slice(0, 7)).toBe('2026-10');
    expect(mesDe(noite)).toBe('2026-09');
    expect(diaDe(noite)).toBe('2026-09-30');
  });
  it('intervalo do mês em UTC', () => {
    const i = intervaloDoMes('2026-12');
    expect(i.gte.toISOString()).toBe('2026-12-01T03:00:00.000Z');
    expect(i.lt.toISOString()).toBe('2027-01-01T03:00:00.000Z');
  });
  it('soma meses atravessando o ano', () => {
    expect(somarMeses('2026-12', 1)).toBe('2027-01');
    expect(somarMeses('2026-01', -1)).toBe('2025-12');
  });
  it('data do formulário cai no mesmo dia', () => expect(diaDe(dataDoFormulario('2026-09-01'))).toBe('2026-09-01'));
});

describe('telefone e CEP', () => {
  it('máscara', () => {
    expect(formatarTelefone('49999980637')).toBe('(49) 99998-0637');
    expect(formatarTelefone('4999')).toBe('(49) 99');
    expect(formatarCep('89874000')).toBe('89874-000');
  });
  it('valida celular com 11 dígitos (RN-02)', () => {
    expect(celularValido('(49) 99998-0637')).toBe(true);
    expect(celularValido('(49) 9999-063')).toBe(false);
  });
  it('número do wa.me', () => {
    expect(numeroWhatsApp('(49) 99998-0637')).toBe('5549999980637');
    expect(numeroWhatsApp('5549999980637')).toBe('5549999980637');
  });
});

describe('mensagem do WhatsApp', () => {
  const itens = [{ nome: 'Camiseta', marca: 'Hering', referencia: 'R1', tamanho: 'M', cor: 'Preto', codigoInterno: '123', quantidade: 2, preco: 50, imagem: 'https://h/x-600-800/a.jpg' }];
  it('pedido traz itens, totais, foto grande e nome', () => {
    const t = mensagemDoCliente({ tipo: 'compra', codigo: 'PED-000001', itens, nomeCliente: ' Ana ' });
    expect(t).toContain('*PEDIDO PED-000001*');
    expect(t).toContain('Cód. interno: 123');
    expect(t).toContain('2 x R$');
    expect(t).toContain('-1200-1600/');
    expect(t).toContain('Total de peças: 2');
    expect(t.endsWith('Nome: Ana')).toBe(true);
  });
  it('condicional traz o CEP', () => {
    const t = mensagemDoCliente({ tipo: 'condicional', codigo: 'COND-000001', itens, nomeCliente: 'Ana', cep: '89874-000', cidadeCondicional: 'Maravilha/SC' });
    expect(t).toContain('*CONDICIONAL COND-000001*');
    expect(t).toContain('CEP: 89874-000 (Maravilha/SC)');
  });
  it('link codificado', () => expect(linkWhatsApp('(49) 99998-0637', 'olá & tchau')).toBe('https://wa.me/5549999980637?text=ol%C3%A1%20%26%20tchau'));
});
