'use client';

import { useEffect, useState } from 'react';

function partes(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/** "2d 05h 12min" (ou "12min 08s" na última hora). Atualiza sozinha; terminado, mostra `fim`. */
export function Contagem({ ate, fim = 'agora' }: { ate: string; fim?: string }) {
  const alvo = new Date(ate).getTime();
  // Sem horário no servidor (evita diferença na hidratação): o primeiro desenho é só depois de montar.
  const [agora, setAgora] = useState<number | null>(null);
  useEffect(() => {
    const tique = () => setAgora(Date.now());
    const primeiro = setTimeout(tique, 0);
    const t = setInterval(tique, 1000);
    return () => { clearTimeout(primeiro); clearInterval(t); };
  }, []);
  if (agora == null) return <span className="tabular-nums">…</span>;
  const falta = alvo - agora;
  if (falta <= 0) return <span>{fim}</span>;
  const { d, h, m, s } = partes(falta);
  const dois = (n: number) => String(n).padStart(2, '0');
  return <span className="tabular-nums">{d > 0 ? `${d}d ${dois(h)}h ${dois(m)}min` : h > 0 ? `${h}h ${dois(m)}min` : `${m}min ${dois(s)}s`}</span>;
}
