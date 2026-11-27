export const somenteDigitos = (v: string | null | undefined) => String(v ?? '').replace(/\D/g, '');

/** Máscara progressiva: "49999980637" → "(49) 99998-0637". */
export function formatarTelefone(v: string) {
  const d = somenteDigitos(v).slice(0, 11);
  if (d.length <= 2) return d;
  const corte = d.length > 10 ? 7 : 6;
  if (d.length <= corte) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, corte)}-${d.slice(corte)}`;
}

/** RN-02: DDD + 9 dígitos. */
export const celularValido = (v: string | null | undefined) => somenteDigitos(v).length === 11;

/** Número no formato do wa.me (com 55). */
export function numeroWhatsApp(v: string) {
  const d = somenteDigitos(v);
  return d.length <= 11 ? `55${d}` : d;
}

export function formatarCep(v: string) {
  const d = somenteDigitos(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}
