/**
 * Histórico do cliente (docs/21), lado do navegador: fila de eventos enviada em lote para /api/atividade.
 * Fica desligada até o <Rastreador> da loja ligar (só para clientes); desligada, `rastrear` não faz nada.
 */
export type EventoRastro =
  | { tipo: 'pagina'; ref: string; caminho: string }
  | { tipo: 'duracao'; ref: string; seg: number }
  | { tipo: 'tamanho'; varianteId: number }
  | { tipo: 'sacola'; varianteId: number; delta: number }
  | { tipo: 'whatsapp'; caminho: string }
  | { tipo: 'carrinho'; itens: { varianteId: number; quantidade: number }[] };

const URL_ATIVIDADE = '/api/atividade';
const fila: EventoRastro[] = [];
let ligado = false;
let timer: ReturnType<typeof setTimeout> | null = null;

export function ligarRastro(sim: boolean) {
  ligado = sim;
  if (!sim) fila.length = 0;
}

export function rastrear(e: EventoRastro) {
  if (!ligado || typeof window === 'undefined') return;
  fila.push(e);
  timer ??= setTimeout(enviarRastro, 1500);
}

/** Envia o que está na fila. sendBeacon sobrevive ao fechamento da aba; sem ele, fetch com keepalive. */
export function enviarRastro() {
  if (timer) clearTimeout(timer);
  timer = null;
  while (fila.length) {
    const corpo = JSON.stringify({ eventos: fila.splice(0, 40) });
    try {
      if (navigator.sendBeacon?.(URL_ATIVIDADE, new Blob([corpo], { type: 'text/plain' }))) continue;
    } catch { /* cai no fetch */ }
    fetch(URL_ATIVIDADE, { method: 'POST', body: corpo, keepalive: true, headers: { 'content-type': 'text/plain' } }).catch(() => {});
  }
}

/** Identifica uma página aberta, para somar o tempo nela depois. */
export const novaRef = () => Math.random().toString(36).slice(2, 12).padEnd(8, '0');
