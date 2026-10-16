import { describe, expect, it } from 'vitest';
import { cpfValido, formatarCpf, lerCpf } from '@/lib/cpf';

describe('CPF', () => {
  it('máscara progressiva', () => {
    expect(formatarCpf('123')).toBe('123');
    expect(formatarCpf('1234567')).toBe('123.456.7');
    expect(formatarCpf('12345678909')).toBe('123.456.789-09');
    expect(formatarCpf('123.456.789-0999')).toBe('123.456.789-09');
  });
  it('dígitos verificadores', () => {
    expect(cpfValido('123.456.789-09')).toBe(true);
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('123.456.789-00')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(cpfValido('1234')).toBe(false);
  });
  it('campo opcional: vazio vira null, inválido recusa', () => {
    expect(lerCpf('')).toEqual({ ok: true, cpf: null });
    expect(lerCpf('52998224725')).toEqual({ ok: true, cpf: '529.982.247-25' });
    expect(lerCpf('529.982.247-26')).toEqual({ ok: false });
  });
});
