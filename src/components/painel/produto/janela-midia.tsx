'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { IconeFechar, IconeSeta, IconeVoltar } from '@/components/ui/icones';

/**
 * Tela cheia para ver fotos e vídeos do produto: fundo escuro, setas (e ← → do teclado), contador e Esc para fechar.
 * Só é montada aberta (<dialog> nativo prende o foco).
 */
export function JanelaMidia({ titulo, indice, total, ir, fechar, children, rodape }: { titulo: string; indice: number; total: number; ir: (i: number) => void; fechar: () => void; children: ReactNode; rodape?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && indice > 0) ir(indice - 1);
      if (e.key === 'ArrowRight' && indice < total - 1) ir(indice + 1);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [indice, total, ir]);
  const seta = 'absolute top-1/2 -translate-y-1/2 grid place-items-center size-12 rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20 disabled:opacity-20 disabled:pointer-events-none transition';
  return (
    <dialog ref={ref} aria-label={titulo} onCancel={e => { e.preventDefault(); fechar(); }}
      className="m-0 p-0 w-screen h-dvh max-w-none max-h-none bg-transparent backdrop:bg-black/90 backdrop:backdrop-blur-sm text-white">
      <div className="relative size-full grid grid-rows-[auto_1fr_auto]" onClick={e => { if (e.target === e.currentTarget) fechar(); }}>
        <div className="flex items-center justify-between px-4 sm:px-6 py-3">
          <span className="text-sm text-white/70 tabular-nums">{titulo} · {indice + 1} de {total}</span>
          <button type="button" onClick={fechar} className="grid place-items-center size-10 rounded-full bg-white/10 hover:bg-white/20" aria-label="Fechar"><IconeFechar /></button>
        </div>
        <div className="relative min-h-0 grid place-items-center px-16 sm:px-24" onClick={e => { if (e.target === e.currentTarget) fechar(); }}>
          {children}
          <button type="button" onClick={() => ir(indice - 1)} disabled={indice === 0} className={`${seta} left-3 sm:left-6`} aria-label="Anterior"><IconeVoltar /></button>
          <button type="button" onClick={() => ir(indice + 1)} disabled={indice >= total - 1} className={`${seta} right-3 sm:right-6`} aria-label="Próxima"><IconeSeta /></button>
        </div>
        <div className="px-4 py-3 flex justify-center">{rodape}</div>
      </div>
    </dialog>
  );
}
