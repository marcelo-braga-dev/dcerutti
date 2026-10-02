import 'server-only';
import { Prisma } from '@prisma/client';

/**
 * Traduz erros previsíveis do banco (corrida entre duas gravações, registro apagado no meio do caminho) em mensagem
 * para o usuário. Erros desconhecidos voltam `null` e devem subir para a página de erro.
 */
export function mensagemDoBanco(e: unknown): string | null {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError)) return null;
  if (e.code === 'P2002') return 'Já existe um cadastro com esses dados (e-mail, referência ou código repetido).';
  if (e.code === 'P2003') return 'Um registro ligado a este foi removido. Atualize a página e tente de novo.';
  if (e.code === 'P2025') return 'Registro não encontrado. Atualize a página e tente de novo.';
  return null;
}

/** Erro de regra de negócio: a mensagem é para o usuário. */
export class ErroNegocio extends Error {}

/**
 * Executa uma gravação e devolve `{ erro }` para erros previsíveis (ErroNegocio ou do banco);
 * qualquer outro erro sobe normalmente para a página de erro.
 */
export async function gravar<T>(fn: () => Promise<T>): Promise<{ ok: true; valor: T } | { ok: false; erro: string }> {
  try {
    return { ok: true, valor: await fn() };
  } catch (e) {
    const erro = e instanceof ErroNegocio ? e.message : mensagemDoBanco(e);
    if (erro == null) throw e;
    return { ok: false, erro };
  }
}
