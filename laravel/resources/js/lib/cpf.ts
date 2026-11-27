import { z } from 'zod';
import { somenteDigitos } from './telefone';

/** Máscara progressiva: "12345678909" → "123.456.789-09". */
export function formatarCpf(v: string) {
  const d = somenteDigitos(v).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** CPF com 11 dígitos e os dois dígitos verificadores certos (recusa sequências como 111.111.111-11). */
export function cpfValido(v: string | null | undefined) {
  const d = somenteDigitos(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

/** Campo opcional dos formulários: vazio vira null; preenchido precisa ser válido e é gravado com a máscara. */
export const lerCpf = (v: unknown): { ok: true; cpf: string | null } | { ok: false } => {
  const d = somenteDigitos(typeof v === 'string' ? v : '');
  if (!d) return { ok: true, cpf: null };
  return cpfValido(d) ? { ok: true, cpf: formatarCpf(d) } : { ok: false };
};

/** Para os esquemas dos formulários (zod): `cpf: campoCpf`. */
export const campoCpf = z.string().optional()
  .refine(v => lerCpf(v).ok, 'CPF inválido. Confira os 11 números.')
  .transform(v => { const r = lerCpf(v); return r.ok ? r.cpf : null; });
