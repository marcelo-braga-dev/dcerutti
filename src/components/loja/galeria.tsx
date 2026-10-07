'use client';

import { useRef, useState } from 'react';
import { Foto } from './foto';

/**
 * Celular: as fotos deslizam com o dedo (U-07), com bolinhas indicando a posição.
 * Computador: miniaturas ao lado da foto grande.
 */
export function Galeria({ imagens, nome }: { imagens: string[]; nome: string }) {
  const [atual, setAtual] = useState(0);
  const trilho = useRef<HTMLDivElement>(null);
  if (!imagens.length) return <div className="relative aspect-[3/4] bg-bege"><Foto src={null} alt={nome} sizes="50vw" /></div>;

  const irPara = (i: number) => {
    setAtual(i);
    const t = trilho.current;
    if (t && t.clientWidth) t.scrollTo({ left: i * t.clientWidth, behavior: 'smooth' });
  };

  return (
    <div className="grid gap-3 sm:grid-cols-[72px_1fr]">
      <div className="hidden sm:flex sm:flex-col gap-2">
        {imagens.map((src, i) => (
          <button key={`${src}-${i}`} type="button" onClick={() => setAtual(i)} aria-label={`Foto ${i + 1}`} aria-current={i === atual}
            className={`relative w-full aspect-[3/4] bg-bege border-2 ${i === atual ? 'border-marrom-950' : 'border-transparent'}`}>
            <Foto src={src} alt="" sizes="72px" />
          </button>
        ))}
      </div>

      {/* Computador: uma foto grande. */}
      <div className="hidden sm:block relative aspect-[3/4] bg-bege overflow-hidden">
        <Foto src={imagens[atual]} alt={`${nome} — foto ${atual + 1}`} sizes="45vw" prioridade />
      </div>

      {/* Celular: trilho com rolagem por página. */}
      <div className="sm:hidden">
        <div ref={trilho} className="flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none]"
          onScroll={e => { const t = e.currentTarget; if (t.clientWidth) setAtual(Math.round(t.scrollLeft / t.clientWidth)); }}>
          {imagens.map((src, i) => (
            <div key={`${src}-${i}`} className="relative shrink-0 w-full aspect-[3/4] bg-bege snap-center">
              <Foto src={src} alt={`${nome} — foto ${i + 1} de ${imagens.length}`} sizes="100vw" prioridade={i === 0} />
            </div>
          ))}
        </div>
        {imagens.length > 1 && (
          <div className="mt-3 flex justify-center gap-2">
            {imagens.map((src, i) => (
              <button key={`${src}-${i}`} type="button" onClick={() => irPara(i)} aria-label={`Foto ${i + 1}`} aria-current={i === atual}
                className={`size-2.5 rounded-full ${i === atual ? 'bg-marrom-950' : 'bg-borda-forte'}`} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
