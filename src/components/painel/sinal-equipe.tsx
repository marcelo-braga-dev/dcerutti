'use client';

import { useEffect } from 'react';

/**
 * Acompanhamento da equipe (D-26): montado no painel e no caixa. A cada minuto manda o tempo com a tela visível (aba
 * escondida não conta) e, a cada clique num link do WhatsApp, o envio. O tipo do envio vem do atributo `data-acao`
 * do link (oferta, cupom, convite, pedido, comprovante, fechamento); sem ele, é uma conversa com a cliente.
 */
type Envio = { acao: string; telefone?: string; pedidoId?: string; caminho?: string };

let fila: Envio[] = [];
let visivelDesde: number | null = null;
let acumulado = 0;

function enviar(urgente = false) {
  if (visivelDesde != null) { acumulado += (Date.now() - visivelDesde) / 1000; visivelDesde = document.visibilityState === 'visible' ? Date.now() : null; }
  const seg = Math.round(acumulado);
  if (!seg && !fila.length) return;
  const corpo = JSON.stringify({ ...(seg ? { seg: Math.min(seg, 600) } : {}), ...(fila.length ? { envios: fila.slice(0, 10) } : {}) });
  acumulado = 0;
  fila = [];
  if (urgente && navigator.sendBeacon?.('/api/equipe', new Blob([corpo], { type: 'text/plain' }))) return;
  fetch('/api/equipe', { method: 'POST', body: corpo, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => {});
}

/** Para envios sem link (o compartilhar do celular no montador). */
export function avisarEnvio(e: Envio) {
  fila.push({ ...e, caminho: location.pathname });
  enviar(true);
}

export function SinalEquipe() {
  useEffect(() => {
    visivelDesde = document.visibilityState === 'visible' ? Date.now() : null;
    const intervalo = setInterval(() => enviar(), 60_000);
    const aoMudar = () => {
      if (document.visibilityState === 'hidden') enviar(true);
      else visivelDesde = Date.now();
    };
    const aoSair = () => enviar(true);
    const aoClicar = (ev: MouseEvent) => {
      const a = ev.target instanceof Element ? ev.target.closest<HTMLAnchorElement>('a[href*="api.whatsapp.com"], a[href*="wa.me"]') : null;
      if (!a) return;
      let telefone: string | undefined;
      try { telefone = new URL(a.href).searchParams.get('phone') ?? a.href.match(/wa\.me\/(\d+)/)?.[1] ?? undefined; } catch {}
      const dados = a.closest<HTMLElement>('[data-acao]')?.dataset;
      fila.push({ acao: dados?.acao ?? 'contato', telefone, pedidoId: dados?.pedido, caminho: location.pathname });
      enviar(true);
    };
    document.addEventListener('visibilitychange', aoMudar);
    window.addEventListener('pagehide', aoSair);
    document.addEventListener('click', aoClicar, true);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', aoMudar);
      window.removeEventListener('pagehide', aoSair);
      document.removeEventListener('click', aoClicar, true);
      enviar(true);
    };
  }, []);
  return null;
}
