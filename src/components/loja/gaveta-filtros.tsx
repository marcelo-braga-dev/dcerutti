'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Celular: botão flutuante "Filtrar · Ordenar" e a gaveta com os filtros. A gaveta continua aberta enquanto a cliente
 * escolhe (cada filtro é um link e a página só troca os parâmetros) e fecha em "Ver N peças".
 */
export function GavetaFiltros({ total, ativos, children }: { total: number; ativos: number; children: ReactNode }) {
  const [aberta, setAberta] = useState(false);
  useEffect(() => {
    if (!aberta) return;
    const fechar = (e: KeyboardEvent) => e.key === 'Escape' && setAberta(false);
    document.addEventListener('keydown', fechar);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', fechar); document.body.style.overflow = ''; };
  }, [aberta]);

  return (
    <div className="lg:hidden">
      <button type="button" onClick={() => setAberta(true)} aria-expanded={aberta} aria-controls="gaveta-filtros"
        className="fixed z-30 bottom-5 left-1/2 -translate-x-1/2 h-12 px-6 rounded-full bg-marrom-950 text-creme shadow-lg shadow-marrom-950/25 rotulo whitespace-nowrap flex items-center gap-2">
        <IconeFiltro />Filtrar · Ordenar{ativos > 0 && <span className="grid place-items-center min-w-5 h-5 px-1 rounded-full bg-caramelo text-[0.65rem]">{ativos}</span>}
      </button>
      {aberta && (
        <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Filtros">
          <button type="button" aria-label="Fechar filtros" className="absolute inset-0 bg-marrom-950/50" onClick={() => setAberta(false)} />
          <div id="gaveta-filtros" className="relative ml-auto h-full w-[min(92vw,420px)] bg-creme flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 h-14 border-b border-borda shrink-0">
              <span className="titulo text-lg">Filtrar e ordenar</span>
              <button type="button" onClick={() => setAberta(false)} className="size-11 grid place-items-center -mr-3 text-2xl leading-none" aria-label="Fechar">×</button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
            <div className="shrink-0 border-t border-borda p-4 bg-card">
              <button type="button" onClick={() => setAberta(false)} className="w-full h-12 bg-marrom-950 text-creme rotulo">
                Ver {total.toLocaleString('pt-BR')} {total === 1 ? 'peça' : 'peças'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Ordenação em lista (troca a URL mantendo os filtros). */
export function SeletorOrdem({ atual, opcoes, className = '' }: { atual: string; opcoes: { valor: string; rotulo: string; url: string }[]; className?: string }) {
  const router = useRouter();
  return (
    <label className={`flex items-center gap-2 ${className}`}>
      <span className="rotulo text-suave shrink-0">Ordenar</span>
      <select value={atual} onChange={e => { const o = opcoes.find(x => x.valor === e.target.value); if (o) router.push(o.url, { scroll: false }); }}
        className="h-10 pl-3 pr-8 border border-borda-forte bg-card text-sm text-marrom-950 outline-none focus:border-marrom-950 cursor-pointer">
        {opcoes.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
      </select>
    </label>
  );
}

function IconeFiltro() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" />
    </svg>
  );
}
