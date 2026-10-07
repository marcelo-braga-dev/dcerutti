import type { ZodError } from 'zod';

/** Estado devolvido pelas Server Actions de formulário. */
export type EstadoForm = {
  ok?: boolean;
  erro?: string;
  mensagem?: string;
  erros?: Record<string, string>;
  /** Valores enviados — devolvidos para o formulário não perder o que foi digitado quando há erro. */
  valores?: Record<string, string>;
};

export type AcaoForm = (anterior: EstadoForm, dados: FormData) => Promise<EstadoForm>;

const OCULTOS = /senha|password/i;

export function valoresDe(fd: FormData): Record<string, string> {
  const v: Record<string, string> = {};
  for (const [k, val] of fd.entries()) if (typeof val === 'string' && !OCULTOS.test(k) && !k.startsWith('$')) v[k] = val;
  return v;
}

export function errosDoZod(e: ZodError): Record<string, string> {
  const erros: Record<string, string> = {};
  for (const i of e.issues) {
    const k = String(i.path[0] ?? '_');
    if (!erros[k]) erros[k] = i.message;
  }
  return erros;
}

/** Atalho: falha de validação com os valores de volta. */
export const falha = (fd: FormData, erros: Record<string, string>, erro?: string): EstadoForm => ({
  erros,
  erro: erro ?? 'Alguns campos precisam de ajuste: veja as mensagens em vermelho.',
  valores: valoresDe(fd),
});
