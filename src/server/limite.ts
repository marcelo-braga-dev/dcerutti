import 'server-only';
import { headers } from 'next/headers';

/**
 * Limite de tentativas em memória (C-01). Vale para um único processo Node, como o cache do catálogo (D-11).
 * Cada chave guarda os horários das falhas recentes; passou do máximo dentro da janela, fica bloqueada até a mais antiga expirar.
 */
type Regra = { max: number; janelaMs: number };

const g = globalThis as unknown as { __limites?: Map<string, number[]> };
const registros = (g.__limites ??= new Map<string, number[]>());

const recentes = (chave: string, janelaMs: number, agora: number) => {
  const lista = (registros.get(chave) ?? []).filter(t => agora - t < janelaMs);
  if (lista.length) registros.set(chave, lista);
  else registros.delete(chave);
  return lista;
};

/** Minutos até liberar, ou 0 se a chave ainda pode tentar. */
export function bloqueio(chave: string, r: Regra, agora = Date.now()): number {
  const lista = recentes(chave, r.janelaMs, agora);
  if (lista.length < r.max) return 0;
  return Math.max(1, Math.ceil((lista[0] + r.janelaMs - agora) / 60_000));
}

const UMA_HORA = 60 * 60_000; // maior janela em uso

export function registrarFalha(chave: string, r: Regra, agora = Date.now()) {
  registros.set(chave, [...recentes(chave, r.janelaMs, agora), agora]);
  // Chaves que nunca mais voltam (e-mails variados de um ataque) não podem crescer sem limite.
  if (registros.size > 5_000) for (const [k, l] of registros) if (agora - (l.at(-1) ?? 0) > UMA_HORA) registros.delete(k);
}

export function limpar(chave: string) {
  registros.delete(chave);
}

/** IP do cliente. O Nginx grava o endereço real em X-Real-IP; X-Forwarded-For pode ser forjado pelo navegador. */
export async function ipDoCliente() {
  const h = await headers();
  return h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',').at(-1)?.trim() ?? 'desconhecido';
}

const QUINZE_MIN = 15 * 60_000;
export const LOGIN_POR_EMAIL: Regra = { max: 5, janelaMs: QUINZE_MIN };
export const LOGIN_POR_IP: Regra = { max: 20, janelaMs: QUINZE_MIN };
export const CADASTRO_POR_IP: Regra = { max: 5, janelaMs: 60 * 60_000 };
export const REDEFINICAO_POR_EMAIL: Regra = { max: 3, janelaMs: 60 * 60_000 };
export const REDEFINICAO_POR_IP: Regra = { max: 10, janelaMs: 60 * 60_000 };
/** Cupom: códigos que não existem, por cliente (tentativa e erro de códigos). */
export const CUPOM_POR_CLIENTE: Regra = { max: 10, janelaMs: QUINZE_MIN };
