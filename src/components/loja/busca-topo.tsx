'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { sugerirBusca, type SugestoesBusca } from '@/server/acoes/busca';
import { brl } from '@/lib/dinheiro';
import { IconeFechar, IconeFlecha, IconeLupa } from '@/components/ui/icones';
import { Foto } from './foto';

export type Atalho = { rotulo: string; href: string };

/**
 * Busca com sugestões enquanto a pessoa digita (peças e categorias, 200 ms depois da última tecla).
 * Teclado: ↑ ↓ escolhem a sugestão, Enter abre, Esc fecha. Sem termo, mostra atalhos para as categorias.
 * `flutuante`: a caixa do topo no computador; as sugestões abrem por cima da página e fecham ao clicar fora.
 * Sem ela (menu e busca do celular), as sugestões ficam logo abaixo do campo.
 */
export function BuscaTopo({ inicial, atalhos, aoFechar, autoFocus = true, flutuante = false }: {
  inicial: string; atalhos: Atalho[]; aoFechar?: () => void; autoFocus?: boolean; flutuante?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState(inicial);
  const [s, setS] = useState<{ termo: string; r: SugestoesBusca } | null>(null);
  const [marcada, setMarcada] = useState(-1);
  const [aberta, setAberta] = useState(!flutuante);
  const lista = useId();
  const pedido = useRef(0);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const termo = q.trim();
    if (termo.length < 2) return;
    const n = ++pedido.current;
    const t = setTimeout(() => sugerirBusca(termo).then(r => { if (n === pedido.current) { setS({ termo, r }); setMarcada(-1); } }).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [q]);

  // Caixa do topo: clicar fora fecha as sugestões.
  useEffect(() => {
    if (!flutuante || !aberta) return;
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberta(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [flutuante, aberta]);

  const termo = q.trim();
  const r = aberta && termo.length >= 2 && s?.termo === termo ? s.r : null;
  const opcoes = r ? [...r.produtos.map(p => `/produto/${encodeURIComponent(p.referencia)}`), ...r.categorias.map(c => `/catalogo?categoria=${c.slug}`)] : [];
  const fechar = () => { if (flutuante) setAberta(false); aoFechar?.(); };
  const ir = (href: string) => { fechar(); (document.activeElement as HTMLElement | null)?.blur(); router.push(href); };
  const mostrarAtalhos = aberta && !r && termo.length < 2 && atalhos.length > 0;

  const painel = flutuante
    ? 'absolute left-0 right-0 top-full mt-2 z-40 bg-card rounded-2xl border border-borda sombra-suave overflow-hidden animate-[aparecer_.18s_ease-out]'
    : 'mt-3 bg-card rounded-2xl border border-borda overflow-hidden';

  return (
    <div ref={caixa} className="relative">
      <form role="search" onSubmit={e => { e.preventDefault(); ir(marcada >= 0 ? opcoes[marcada] : termo ? `/catalogo?q=${encodeURIComponent(termo)}` : '/catalogo'); }}
        className={`flex items-center gap-2 h-12 pl-4 pr-1.5 rounded-full border transition-colors ${flutuante ? 'bg-creme border-transparent focus-within:bg-card focus-within:border-marrom-950' : 'bg-card border-borda-forte focus-within:border-marrom-950'}`}>
        <IconeLupa className="size-5 text-suave shrink-0" />
        <input value={q} onChange={e => { setQ(e.target.value); setAberta(true); }} onFocus={() => setAberta(true)} autoFocus={autoFocus} name="q" type="search" enterKeyHint="search" autoComplete="off"
          role="combobox" aria-expanded={!!r} aria-controls={lista} aria-activedescendant={marcada >= 0 ? `${lista}-${marcada}` : undefined} aria-autocomplete="list"
          onKeyDown={e => {
            if (e.key === 'ArrowDown' && opcoes.length) { e.preventDefault(); setMarcada(m => (m + 1) % opcoes.length); }
            else if (e.key === 'ArrowUp' && opcoes.length) { e.preventDefault(); setMarcada(m => (m <= 0 ? opcoes.length - 1 : m - 1)); }
            else if (e.key === 'Escape') { fechar(); e.currentTarget.blur(); }
          }}
          placeholder="Buscar camiseta, bermuda, preto…" aria-label="Buscar peças"
          className="flex-1 min-w-0 h-full bg-transparent outline-none text-[0.95rem] text-marrom-950 placeholder:text-suave/80 [&::-webkit-search-cancel-button]:hidden" />
        {q && (
          <button type="button" onClick={() => { setQ(''); setS(null); }} className="size-9 grid place-items-center rounded-full text-suave hover:text-marrom-950" aria-label="Limpar a busca">
            <IconeFechar className="size-4" />
          </button>
        )}
        <button className="h-9 px-4 rounded-full bg-marrom-950 text-creme text-sm font-semibold hover:bg-marrom-700 transition-colors">Buscar</button>
      </form>

      {r ? (
        <div id={lista} role="listbox" className={`${painel} max-h-[70vh] overflow-y-auto`}>
          {r.produtos.length === 0 && r.categorias.length === 0 ? (
            <p className="p-5 text-sm text-suave">Nada encontrado para “{termo}”. Tente outra palavra.</p>
          ) : (
            <>
              {r.categorias.length > 0 && (
                <div className="flex flex-wrap gap-2 p-4 border-b border-borda">
                  {r.categorias.map((c, i) => {
                    const k = r.produtos.length + i;
                    return (
                      <Link key={c.slug} id={`${lista}-${k}`} role="option" aria-selected={marcada === k} href={`/catalogo?categoria=${c.slug}`} onClick={fechar}
                        className={`h-9 px-3.5 inline-flex items-center gap-1.5 rounded-full border text-sm transition-colors ${marcada === k ? 'border-marrom-950 bg-bege' : 'border-borda-forte hover:border-marrom-950'}`}>
                        {c.nome} <span className="text-suave text-xs">{c.n}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
              <ul className="p-2">
                {r.produtos.map((p, i) => (
                  <li key={p.referencia}>
                    <Link id={`${lista}-${i}`} role="option" aria-selected={marcada === i} href={`/produto/${encodeURIComponent(p.referencia)}`} onClick={fechar}
                      className={`flex items-center gap-3 p-2 rounded-xl ${marcada === i ? 'bg-bege' : 'hover:bg-creme'}`}>
                      <span className="relative w-12 aspect-[3/4] rounded-lg overflow-hidden bg-bege shrink-0"><Foto src={p.imagem} alt="" sizes="48px" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-marrom-950 line-clamp-1">{p.nome}</span>
                        <span className="block text-xs text-suave">{p.marca}</span>
                      </span>
                      <span className="text-sm font-bold whitespace-nowrap text-right">
                        {p.precoCheio > p.preco && <s className="block text-[0.7rem] font-normal text-suave">{brl(p.precoCheio)}</s>}
                        <span className={p.precoCheio > p.preco ? 'text-imperdivel' : ''}>{brl(p.preco)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href={`/catalogo?q=${encodeURIComponent(termo)}`} onClick={fechar} className="flex items-center justify-between px-5 h-12 border-t border-borda text-sm font-semibold text-marrom-950 hover:bg-creme">
                Ver todos os {r.total.toLocaleString('pt-BR')} resultados <IconeFlecha className="size-4" />
              </Link>
            </>
          )}
        </div>
      ) : mostrarAtalhos ? (
        <div className={`${painel} p-4`}>
          <span className="block rotulo !text-[0.62rem] text-suave mb-3">Mais procuradas</span>
          <div className="flex flex-wrap gap-2">
            {atalhos.map(a => (
              <Link key={a.href} href={a.href} onClick={fechar} className="h-9 px-3.5 inline-flex items-center rounded-full border border-borda-forte bg-card text-sm hover:border-marrom-950 hover:bg-creme transition-colors">{a.rotulo}</Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
