'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { sugerirBusca, type SugestoesBusca } from '@/server/acoes/busca';
import { brl } from '@/lib/dinheiro';
import { IconeLupa } from '@/components/ui/icones';
import { Foto } from './foto';

export type Atalho = { rotulo: string; href: string };

/**
 * Busca do topo com sugestões enquanto a pessoa digita (peças e categorias, 200 ms depois da última tecla).
 * Teclado: ↑ ↓ escolhem a sugestão, Enter abre, Esc fecha. Sem termo, mostra atalhos para as seções principais.
 */
export function BuscaTopo({ inicial, atalhos, aoFechar, autoFocus = true }: { inicial: string; atalhos: Atalho[]; aoFechar?: () => void; autoFocus?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState(inicial);
  const [s, setS] = useState<{ termo: string; r: SugestoesBusca } | null>(null);
  const [marcada, setMarcada] = useState(-1);
  const lista = useId();
  const pedido = useRef(0);

  useEffect(() => {
    const termo = q.trim();
    if (termo.length < 2) return;
    const n = ++pedido.current;
    const t = setTimeout(() => sugerirBusca(termo).then(r => { if (n === pedido.current) { setS({ termo, r }); setMarcada(-1); } }).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [q]);

  const termo = q.trim();
  const r = termo.length >= 2 && s?.termo === termo ? s.r : null;
  const opcoes = r ? [...r.produtos.map(p => `/produto/${encodeURIComponent(p.referencia)}`), ...r.categorias.map(c => `/catalogo?categoria=${c.slug}`)] : [];
  const ir = (href: string) => { aoFechar?.(); router.push(href); };

  return (
    <div className="relative">
      <form role="search" onSubmit={e => { e.preventDefault(); ir(marcada >= 0 ? opcoes[marcada] : termo ? `/catalogo?q=${encodeURIComponent(termo)}` : '/catalogo'); }} className="flex">
        <div className="relative flex-1 min-w-0">
          <IconeLupa className="size-5 absolute left-3 top-1/2 -translate-y-1/2 text-suave" />
          <input value={q} onChange={e => setQ(e.target.value)} autoFocus={autoFocus} name="q" type="search" enterKeyHint="search" autoComplete="off"
            role="combobox" aria-expanded={!!r} aria-controls={lista} aria-activedescendant={marcada >= 0 ? `${lista}-${marcada}` : undefined} aria-autocomplete="list"
            onKeyDown={e => {
              if (e.key === 'ArrowDown' && opcoes.length) { e.preventDefault(); setMarcada(m => (m + 1) % opcoes.length); }
              else if (e.key === 'ArrowUp' && opcoes.length) { e.preventDefault(); setMarcada(m => (m <= 0 ? opcoes.length - 1 : m - 1)); }
              else if (e.key === 'Escape') aoFechar?.();
            }}
            placeholder="O que você procura? Ex.: camiseta, bermuda, preto…" aria-label="Buscar peças"
            className="w-full h-12 pl-10 pr-3 border border-borda-forte bg-card outline-none focus:border-marrom-950 [&::-webkit-search-cancel-button]:hidden" />
        </div>
        <button className="h-12 px-5 bg-marrom-950 text-creme rotulo">Buscar</button>
      </form>

      {r ? (
        <div id={lista} role="listbox" className="mt-2 bg-card border border-borda shadow-xl max-h-[70vh] overflow-y-auto">
          {r.produtos.length === 0 && r.categorias.length === 0 ? (
            <p className="p-4 text-sm text-suave">Nada encontrado para “{termo}”. Tente outra palavra.</p>
          ) : (
            <>
              {r.categorias.length > 0 && (
                <div className="flex flex-wrap gap-2 p-3 border-b border-borda">
                  {r.categorias.map((c, i) => {
                    const k = r.produtos.length + i;
                    return (
                      <Link key={c.slug} id={`${lista}-${k}`} role="option" aria-selected={marcada === k} href={`/catalogo?categoria=${c.slug}`} onClick={aoFechar}
                        className={`min-h-9 px-3 inline-flex items-center gap-1.5 border text-sm ${marcada === k ? 'border-marrom-950 bg-bege' : 'border-borda-forte'}`}>
                        {c.nome} <span className="text-suave">{c.n}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
              <ul>
                {r.produtos.map((p, i) => (
                  <li key={p.referencia}>
                    <Link id={`${lista}-${i}`} role="option" aria-selected={marcada === i} href={`/produto/${encodeURIComponent(p.referencia)}`} onClick={aoFechar}
                      className={`flex items-center gap-3 px-3 py-2 ${marcada === i ? 'bg-bege' : 'hover:bg-creme'}`}>
                      <span className="relative w-11 aspect-[3/4] bg-bege shrink-0"><Foto src={p.imagem} alt="" sizes="44px" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-marrom-950 line-clamp-1">{p.nome}</span>
                        <span className="block text-xs text-suave">{p.marca}</span>
                      </span>
                      <span className="text-sm font-semibold whitespace-nowrap">
                        {p.precoCheio > p.preco && <s className="block text-[0.7rem] font-normal text-suave">{brl(p.precoCheio)}</s>}
                        {brl(p.preco)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href={`/catalogo?q=${encodeURIComponent(termo)}`} onClick={aoFechar} className="flex items-center justify-between px-4 h-12 border-t border-borda rotulo text-marrom-950 hover:bg-creme">
                Ver todos os {r.total.toLocaleString('pt-BR')} resultados <span aria-hidden="true">→</span>
              </Link>
            </>
          )}
        </div>
      ) : termo.length < 2 && atalhos.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="w-full rotulo text-suave">Atalhos</span>
          {atalhos.map(a => <Link key={a.href} href={a.href} onClick={aoFechar} className="min-h-9 px-3 inline-flex items-center border border-borda-forte bg-card text-sm hover:border-marrom-950">{a.rotulo}</Link>)}
        </div>
      ) : null}
    </div>
  );
}
