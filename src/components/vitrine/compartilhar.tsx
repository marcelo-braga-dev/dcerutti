'use client';

import { useState } from 'react';

/** Compartilhar a vitrine: a folha do sistema no celular (WhatsApp, Instagram, Direct); senão, copia o link. */
export function Compartilhar({ titulo, className = '' }: { titulo: string; className?: string }) {
  const [copiado, setCopiado] = useState(false);
  const compartilhar = async () => {
    const url = window.location.href.split('?')[0];
    if (navigator.share) {
      try { await navigator.share({ title: titulo, text: `${titulo} 🛍️`, url }); return; } catch { /* cancelou: tenta copiar */ }
    }
    try { await navigator.clipboard.writeText(url); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch { /* sem permissão */ }
  };
  return (
    <button type="button" onClick={compartilhar} className={className} aria-label="Compartilhar esta vitrine">
      <svg viewBox="0 0 24 24" className="size-[1.1rem]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3.5M7.5 8 12 3.5 16.5 8" /><path d="M5 12.5v6.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-6.5" /></svg>
      <span>{copiado ? 'Link copiado' : 'Compartilhar'}</span>
    </button>
  );
}
