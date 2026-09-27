'use client';

import { useState } from 'react';
import { Foto } from './foto';

export function Galeria({ imagens, nome }: { imagens: string[]; nome: string }) {
  const [atual, setAtual] = useState(0);
  if (!imagens.length) return <div className="relative aspect-[3/4] bg-bege"><Foto src={null} alt={nome} sizes="50vw" /></div>;
  return (
    <div className="grid gap-3 sm:grid-cols-[72px_1fr]">
      <div className="order-2 sm:order-1 flex sm:flex-col gap-2 overflow-x-auto sm:overflow-visible">
        {imagens.map((src, i) => (
          <button key={src} type="button" onClick={() => setAtual(i)} aria-label={`Foto ${i + 1}`} aria-current={i === atual}
            className={`relative shrink-0 w-16 sm:w-full aspect-[3/4] bg-bege border-2 ${i === atual ? 'border-marrom-950' : 'border-transparent'}`}>
            <Foto src={src} alt="" sizes="72px" />
          </button>
        ))}
      </div>
      <div className="order-1 sm:order-2 relative aspect-[3/4] bg-bege overflow-hidden">
        <Foto src={imagens[atual]} alt={`${nome} — foto ${atual + 1}`} sizes="(max-width: 1024px) 100vw, 45vw" prioridade />
      </div>
    </div>
  );
}
