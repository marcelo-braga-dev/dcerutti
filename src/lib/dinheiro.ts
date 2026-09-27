type Valor = number | string | { toString(): string } | null | undefined;

export const paraNumero = (v: Valor) => (v == null ? 0 : Number(v.toString()));

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Formata em reais: 1259.7 → "R$ 1.259,70". Aceita number, string ou Prisma.Decimal. */
export const brl = (v: Valor) => fmt.format(paraNumero(v));

/** Converte texto digitado ("1.259,70", "289,9", "289.90") em número. Retorna NaN se inválido. */
export function lerValor(texto: string | null | undefined): number {
  const t = String(texto ?? '').trim().replace(/[R$\s]/g, '');
  if (!t) return NaN;
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  return /^-?\d+(\.\d+)?$/.test(normal) ? Number(normal) : NaN;
}

/** Desconto em % inteiro, ou 0 se não há promoção. */
export const descontoPct = (preco: number, precoCheio: number) =>
  precoCheio > 0 && preco < precoCheio ? Math.round((1 - preco / precoCheio) * 100) : 0;
