'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { IconeFechar, IconePlay, IconeSeta } from '@/components/ui/icones';
import type { VideoCatalogo } from '@/lib/catalogo';
import { Foto } from './foto';

/** Item da galeria: foto ou vídeo (D-29). */
type Midia = { tipo: 'foto'; src: string } | { tipo: 'video'; src: string; capa: string | null };

/** A capa continua sendo a primeira foto; os vídeos vêm logo depois dela, antes das outras fotos. */
const montar = (imagens: string[], videos: VideoCatalogo[]): Midia[] => {
  const fotos = imagens.map(src => ({ tipo: 'foto' as const, src }));
  return [...fotos.slice(0, 1), ...videos.map(v => ({ tipo: 'video' as const, src: v.url, capa: v.capa })), ...fotos.slice(1)];
};

/**
 * Celular: as fotos deslizam com o dedo (U-07), com bolinhas indicando a posição.
 * Computador: miniaturas ao lado da foto grande, com setas.
 * Tocar ou clicar na foto abre a tela cheia (foto inteira, sem corte), com setas, teclado e deslize.
 * Vídeos (D-29) tocam sozinhos, sem som e em repetição, quando aparecem; os controles ligam o som e a tela cheia.
 */
export function Galeria({ imagens, videos = [], nome }: { imagens: string[]; videos?: VideoCatalogo[]; nome: string }) {
  const [atual, setAtual] = useState(0);
  const [tela, setTela] = useState<number | null>(null);
  const trilho = useRef<HTMLDivElement>(null);
  const midias = montar(imagens, videos);

  const irPara = (i: number) => {
    setAtual(i);
    const t = trilho.current;
    if (t && t.clientWidth) t.scrollTo({ left: i * t.clientWidth, behavior: 'smooth' });
  };
  if (!midias.length) return <div className="relative aspect-[3/4] bg-bege"><Foto src={null} alt={nome} sizes="50vw" /></div>;
  const n = midias.length;
  const destaque = midias[atual] ?? midias[0];
  const rotulo = (m: Midia, i: number) => `${nome} — ${m.tipo === 'video' ? 'vídeo' : 'foto'} ${i + 1} de ${n}`;

  return (
    <div className="grid gap-3 sm:grid-cols-[76px_1fr]">
      <div className="hidden sm:flex sm:flex-col gap-2 max-h-[calc(100dvh-9rem)] overflow-y-auto [scrollbar-width:none]">
        {midias.map((m, i) => (
          <button key={`${m.src}-${i}`} type="button" onClick={() => setAtual(i)} aria-label={`${m.tipo === 'video' ? 'Vídeo' : 'Foto'} ${i + 1}`} aria-current={i === atual}
            className={`relative w-full shrink-0 aspect-[3/4] bg-bege border-2 ${i === atual ? 'border-marrom-950' : 'border-transparent opacity-70 hover:opacity-100'}`}>
            <Miniatura m={m} />
          </button>
        ))}
      </div>

      {/* Computador: uma foto grande, com setas e zoom; o vídeo toca no lugar dela. */}
      <div className="hidden sm:block relative aspect-[3/4] bg-[#efebe5] overflow-hidden group">
        {destaque.tipo === 'video' ? (
          <Video key={destaque.src} m={destaque} ativo alt={rotulo(destaque, atual)} />
        ) : (
          <button type="button" onClick={() => setTela(atual)} className="absolute inset-0 cursor-zoom-in" aria-label="Ver a foto em tela cheia">
            <Foto src={destaque.src} alt={rotulo(destaque, atual)} sizes="(min-width: 1024px) 50vw, 90vw" prioridade />
          </button>
        )}
        {n > 1 && (
          <>
            <Seta lado="esq" onClick={() => setAtual((atual - 1 + n) % n)} className="opacity-0 group-hover:opacity-100 focus:opacity-100" />
            <Seta lado="dir" onClick={() => setAtual((atual + 1) % n)} className="opacity-0 group-hover:opacity-100 focus:opacity-100" />
          </>
        )}
        {destaque.tipo === 'foto' && <span className="absolute bottom-3 right-3 rotulo !text-[0.6rem] bg-card/90 px-2 py-1 pointer-events-none">{atual + 1} / {n} · ampliar</span>}
      </div>

      {/* Celular: trilho com rolagem por página. */}
      <div className="sm:hidden -mx-4">
        <div ref={trilho} className="flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none]"
          onScroll={e => { const t = e.currentTarget; if (t.clientWidth) setAtual(Math.round(t.scrollLeft / t.clientWidth)); }}>
          {midias.map((m, i) => m.tipo === 'video' ? (
            <div key={`${m.src}-${i}`} className="relative shrink-0 w-full aspect-[3/4] bg-[#efebe5] snap-center">
              <Video m={m} ativo={i === atual} alt={rotulo(m, i)} />
            </div>
          ) : (
            <button key={`${m.src}-${i}`} type="button" onClick={() => setTela(i)} className="relative shrink-0 w-full aspect-[3/4] bg-[#efebe5] snap-center" aria-label={`Ampliar a foto ${i + 1} de ${n}`}>
              <Foto src={m.src} alt={rotulo(m, i)} sizes="100vw" prioridade={i === 0} />
            </button>
          ))}
        </div>
        {n > 1 && (
          <div className="mt-3 flex justify-center gap-1">
            {midias.map((m, i) => (
              <button key={`${m.src}-${i}`} type="button" onClick={() => irPara(i)} aria-label={`${m.tipo === 'video' ? 'Vídeo' : 'Foto'} ${i + 1}`} aria-current={i === atual} className="p-1.5">
                <span className={`block h-1.5 rounded-full transition-all ${i === atual ? 'w-5 bg-marrom-950' : 'w-1.5 bg-borda-forte'}`} />
              </button>
            ))}
          </div>
        )}
      </div>

      {tela != null && <TelaCheia midias={midias} nome={nome} inicio={tela} fechar={() => setTela(null)} />}
    </div>
  );
}

function Miniatura({ m }: { m: Midia }) {
  if (m.tipo === 'foto') return <Foto src={m.src} alt="" sizes="76px" />;
  return (
    <>
      {m.capa ? <Foto src={m.capa} alt="" sizes="76px" /> : <video src={`${m.src}#t=0.5`} muted playsInline preload="metadata" className="absolute inset-0 size-full object-cover" />}
      <span className="absolute inset-0 grid place-items-center"><span className="size-7 grid place-items-center rounded-full bg-marrom-950/70 text-creme"><IconePlay className="size-3.5 ml-0.5" /></span></span>
    </>
  );
}

/**
 * Vídeo do produto: toca sem som e em repetição enquanto está ativo (na tela) e pausa quando sai. Sem capa, o
 * fragmento #t=0.1 faz o navegador mostrar o primeiro quadro em vez de um retângulo vazio.
 */
function Video({ m, ativo, alt, inteiro = false }: { m: Extract<Midia, { tipo: 'video' }>; ativo: boolean; alt: string; inteiro?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (ativo) v.play().catch(() => {}); // sem permissão para tocar sozinho: fica a capa com o botão de play
    else v.pause();
  }, [ativo]);
  return (
    <video ref={ref} src={m.capa ? m.src : `${m.src}#t=0.1`} poster={m.capa ?? undefined} aria-label={alt} muted loop playsInline controls
      preload={ativo ? 'auto' : 'metadata'} className={`absolute inset-0 size-full ${inteiro ? 'object-contain' : 'object-cover'}`} />
  );
}

function Seta({ lado, onClick, className = '' }: { lado: 'esq' | 'dir'; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={lado === 'esq' ? 'Anterior' : 'Próxima'}
      className={`absolute top-1/2 -translate-y-1/2 ${lado === 'esq' ? 'left-3' : 'right-3'} size-11 grid place-items-center rounded-full bg-card/90 shadow transition-opacity ${className}`}>
      <IconeSeta className={`size-5 ${lado === 'esq' ? 'rotate-180' : ''}`} />
    </button>
  );
}

function TelaCheia({ midias, nome, inicio, fechar }: { midias: Midia[]; nome: string; inicio: number; fechar: () => void }) {
  const trilho = useRef<HTMLDivElement>(null);
  const [atual, setAtual] = useState(inicio);
  const n = midias.length;
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
    <div className="fixed inset-0 z-50 bg-creme" role="dialog" aria-modal="true" aria-label={`Fotos e vídeos de ${nome}`}>
      <div ref={trilho} className="h-full flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none]"
        onScroll={e => { const t = e.currentTarget; if (t.clientWidth) setAtual(Math.round(t.scrollLeft / t.clientWidth)); }}>
        {midias.map((m, i) => (
          <div key={`${m.src}-${i}`} className="relative shrink-0 w-full h-full snap-center">
            {m.tipo === 'video'
              ? <Video m={m} ativo={i === atual} alt={`${nome} — vídeo ${i + 1} de ${n}`} inteiro />
              : <Foto src={m.src} alt={`${nome} — foto ${i + 1} de ${n}`} sizes="100vw" inteira />}
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
