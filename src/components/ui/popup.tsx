'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Janela por cima da página (<dialog> nativo: prende o foco, fecha com Esc). Clicar fora também fecha.
 * Só é montada aberta: quem usa controla com `{aberto && <Popup ...>}`, e o conteúdo começa do zero a cada abertura.
 */
export function Popup({ titulo, fechar, children, largura = 'max-w-lg' }: { titulo: string; fechar: () => void; children: ReactNode; largura?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog ref={ref} aria-labelledby="popup-titulo" onCancel={e => { e.preventDefault(); fechar(); }} onClick={e => { if (e.target === ref.current) fechar(); }}
      className={`m-auto w-[calc(100%-2rem)] ${largura} max-h-[calc(100dvh-2rem)] bg-card text-marrom-950 p-0 backdrop:bg-marrom-950/60`}>
      <div className="p-5 sm:p-6 grid gap-4">
        <h2 id="popup-titulo" className="titulo text-xl">{titulo}</h2>
        {children}
      </div>
    </dialog>
  );
}
