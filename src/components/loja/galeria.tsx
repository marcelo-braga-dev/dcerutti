'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { IconeFechar, IconeSeta } from '@/components/ui/icones';
import { Foto } from './foto';

/**
 * Celular: as fotos deslizam com o dedo (U-07), com bolinhas indicando a posição.
 * Computador: miniaturas ao lado da foto grande, com setas.
 * Tocar ou clicar na foto abre a tela cheia (foto inteira, sem corte), com setas, teclado e deslize.
 */
export function Galeria({ imagens, nome }: { imagens: string[]; nome: string }) {
  const [atual, setAtual] = useState(0);
  const [tela, setTela] = useState<number | null>(null);
  const trilho = useRef<HTMLDivElement>(null);

  const irPara = (i: number) => {
    setAtual(i);
    const t = trilho.current;
    if (t && t.clientWidth) t.scrollTo({ left: i * t.clientWidth, behavior: 'smooth' });
  };
  if (!imagens.length) return <div className="relative aspect-[3/4] bg-bege"><Foto src={null} alt={nome} sizes="50vw" /></div>;
  const n = imagens.length;

  return (
    <div className="grid gap-3 sm:grid-cols-[76px_1fr]">
      <div className="hidden sm:flex sm:flex-col gap-2 max-h-[calc(100dvh-9rem)] overflow-y-auto [scrollbar-width:none]">
        {imagens.map((src, i) => (
          <button key={`${src}-${i}`} type="button" onClick={() => setAtual(i)} aria-label={`Foto ${i + 1}`} aria-current={i === atual}
            className={`relative w-full shrink-0 aspect-[3/4] bg-bege border-2 ${i === atual ? 'border-marrom-950' : 'border-transparent opacity-70 hover:opacity-100'}`}>
            <Foto src={src} alt="" sizes="76px" />
          </button>
        ))}
      </div>

      {/* Computador: uma foto grande, com setas e zoom. */}
      <div className="hidden sm:block relative aspect-[3/4] bg-[#efebe5] overflow-hidden group">
        <button type="button" onClick={() => setTela(atual)} className="absolute inset-0 cursor-zoom-in" aria-label="Ver a foto em tela cheia">
          <Foto src={imagens[atual]} alt={`${nome} — foto ${atual + 1}`} sizes="(min-width: 1024px) 50vw, 90vw" prioridade />
        </button>
        {n > 1 && (
          <>
            <Seta lado="esq" onClick={() => setAtual((atual - 1 + n) % n)} className="opacity-0 group-hover:opacity-100 focus:opacity-100" />
            <Seta lado="dir" onClick={() => setAtual((atual + 1) % n)} className="opacity-0 group-hover:opacity-100 focus:opacity-100" />
          </>
        )}
        <span className="absolute bottom-3 right-3 rotulo !text-[0.6rem] bg-card/90 px-2 py-1 pointer-events-none">{atual + 1} / {n} · ampliar</span>
      </div>

      {/* Celular: trilho com rolagem por página. */}
      <div className="sm:hidden -mx-4">
        <div ref={trilho} className="flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none]"
          onScroll={e => { const t = e.currentTarget; if (t.clientWidth) setAtual(Math.round(t.scrollLeft / t.clientWidth)); }}>
          {imagens.map((src, i) => (
            <button key={`${src}-${i}`} type="button" onClick={() => setTela(i)} className="relative shrink-0 w-full aspect-[3/4] bg-[#efebe5] snap-center" aria-label={`Ampliar a foto ${i + 1} de ${n}`}>
              <Foto src={src} alt={`${nome} — foto ${i + 1} de ${n}`} sizes="100vw" prioridade={i === 0} />
            </button>
          ))}
        </div>
        {n > 1 && (
          <div className="mt-3 flex justify-center gap-1">
            {imagens.map((src, i) => (
              <button key={`${src}-${i}`} type="button" onClick={() => irPara(i)} aria-label={`Foto ${i + 1}`} aria-current={i === atual} className="p-1.5">
                <span className={`block h-1.5 rounded-full transition-all ${i === atual ? 'w-5 bg-marrom-950' : 'w-1.5 bg-borda-forte'}`} />
              </button>
            ))}
          </div>
        )}
      </div>

      {tela != null && <TelaCheia imagens={imagens} nome={nome} inicio={tela} fechar={() => setTela(null)} />}
    </div>
  );
}

function Seta({ lado, onClick, className = '' }: { lado: 'esq' | 'dir'; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={lado === 'esq' ? 'Foto anterior' : 'Próxima foto'}
      className={`absolute top-1/2 -translate-y-1/2 ${lado === 'esq' ? 'left-3' : 'right-3'} size-11 grid place-items-center rounded-full bg-card/90 shadow transition-opacity ${className}`}>
      <IconeSeta className={`size-5 ${lado === 'esq' ? 'rotate-180' : ''}`} />
    </button>
  );
}

function TelaCheia({ imagens, nome, inicio, fechar }: { imagens: string[]; nome: string; inicio: number; fechar: () => void }) {
  const trilho = useRef<HTMLDivElement>(null);
  const [atual, setAtual] = useState(inicio);
  const n = imagens.length;
  const ir = useCallback((i: number) => {
    const t = trilho.current;
    const alvo = (i + n) % n;
    if (t) t.scrollTo({ left: alvo * t.clientWidth, behavior: 'smooth' });
    setAtual(alvo);
  }, [n]);

  useEffect(() => {
    const t = trilho.current;
    if (t) t.scrollLeft = inicio * t.clientWidth;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [inicio]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar();
      else if (e.key === 'ArrowRight') ir(atual + 1);
      else if (e.key === 'ArrowLeft') ir(atual - 1);
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [atual, ir, fechar]);

  return (
    <div className="fixed inset-0 z-50 bg-creme" role="dialog" aria-modal="true" aria-label={`Fotos de ${nome}`}>
      <div ref={trilho} className="h-full flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none]"
        onScroll={e => { const t = e.currentTarget; if (t.clientWidth) setAtual(Math.round(t.scrollLeft / t.clientWidth)); }}>
        {imagens.map((src, i) => (
          <div key={`${src}-${i}`} className="relative shrink-0 w-full h-full snap-center">
            <Foto src={src} alt={`${nome} — foto ${i + 1} de ${n}`} sizes="100vw" inteira />
          </div>
        ))}
      </div>
      <div className="absolute top-0 inset-x-0 flex items-center justify-between p-3">
        <span className="rotulo bg-card/90 px-3 py-2">{atual + 1} / {n}</span>
        <button type="button" onClick={fechar} className="size-12 grid place-items-center rounded-full bg-card/90 shadow" aria-label="Fechar" autoFocus><IconeFechar className="size-6" /></button>
      </div>
      {n > 1 && (
        <>
          <Seta lado="esq" onClick={() => ir(atual - 1)} className="hidden sm:grid" />
          <Seta lado="dir" onClick={() => ir(atual + 1)} className="hidden sm:grid" />
        </>
      )}
    </div>
  );
}
