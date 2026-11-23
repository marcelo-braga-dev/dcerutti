// Sem 'server-only' de propósito: testado em unidade, fora do Next. Só usa node:crypto.
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Assinatura dos avisos (webhooks) do Mercado Pago (docs/27).
 *
 * Cabeçalho `x-signature: ts=<horário>,v1=<hmac>`. O HMAC-SHA256, com a chave secreta da aplicação, é do manifesto
 * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, em que cada par sem valor é omitido (mesma regra do SDK oficial,
 * `WebhookSignatureValidator`). A documentação pede o `data.id` em minúsculas quando alfanumérico, e o SDK usa como
 * veio: aceitamos os dois, o que não enfraquece nada (os dois exigem a chave secreta).
 */

export type ResultadoAssinatura = { ok: true } | { ok: false; motivo: 'sem_segredo' | 'sem_cabecalho' | 'malformado' | 'diferente' | 'fora_do_prazo' };

/** Diferença máxima entre o horário do aviso e o do servidor. Reenvios do MP trazem assinatura nova. */
export const TOLERANCIA_SEGUNDOS = 15 * 60;

export function lerCabecalhoAssinatura(cabecalho: string): { ts?: string; v1?: string } {
  const r: { ts?: string; v1?: string } = {};
  for (const parte of cabecalho.split(',')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    const chave = parte.slice(0, i).trim().toLowerCase();
    const valor = parte.slice(i + 1).trim();
    if (chave === 'ts' && valor) r.ts = valor;
    if (chave === 'v1' && valor) r.v1 = valor;
  }
  return r;
}

export function manifesto(dataId: string | null | undefined, requestId: string | null | undefined, ts: string) {
  const partes: string[] = [];
  if (dataId) partes.push(`id:${dataId}`);
  if (requestId) partes.push(`request-id:${requestId}`);
  partes.push(`ts:${ts}`);
  return `${partes.join(';')};`;
}

const hmac = (segredo: string, texto: string) => createHmac('sha256', segredo).update(texto).digest('hex');

const iguais = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** `ts` em segundos (SDK) ou milissegundos (exemplos da documentação): os dois são aceitos. */
export function horarioDoAviso(ts: string) {
  const n = Number(ts);
  return n > 1e12 ? n : n * 1000;
}

export function validarAssinatura(p: {
  segredo: string | null | undefined;
  assinatura: string | null | undefined;
  requestId: string | null | undefined;
  dataId: string | null | undefined;
  agora?: number;
  toleranciaSegundos?: number;
}): ResultadoAssinatura {
  if (!p.segredo) return { ok: false, motivo: 'sem_segredo' };
  if (!p.assinatura) return { ok: false, motivo: 'sem_cabecalho' };
  const { ts, v1 } = lerCabecalhoAssinatura(p.assinatura);
  if (!ts || !v1 || !/^\d+$/.test(ts) || !/^[0-9a-f]{64}$/i.test(v1)) return { ok: false, motivo: 'malformado' };
  const requestId = p.requestId?.trim() || null;
  const dataId = p.dataId?.trim() || null;
  const candidatos = new Set([dataId, dataId?.toLowerCase() ?? null]);
  const recebido = v1.toLowerCase();
  if (![...candidatos].some(id => iguais(hmac(p.segredo!, manifesto(id, requestId, ts)), recebido))) return { ok: false, motivo: 'diferente' };
  const tolerancia = p.toleranciaSegundos ?? TOLERANCIA_SEGUNDOS;
  if (Math.abs((p.agora ?? Date.now()) - horarioDoAviso(ts)) / 1000 > tolerancia) return { ok: false, motivo: 'fora_do_prazo' };
  return { ok: true };
}

/** Para os testes e o gateway falso: assina como o Mercado Pago. */
export function assinarAviso(segredo: string, dataId: string, requestId: string, ts = String(Math.floor(Date.now() / 1000))) {
  return `ts=${ts},v1=${hmac(segredo, manifesto(dataId, requestId, ts))}`;
}
