'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export type OpcaoFiltro = { rotulo: string; href: string; ativo: boolean; n?: number };

/**
 * Um filtro do painel como lista de seleção: cada opção é um endereço (o filtro fica na URL, dá para salvar e mandar
 * o link). Escolher uma opção abre o endereço dela.
 */
export function LinhaFiltro({ rotulo, opcoes }: { rotulo: string; opcoes: OpcaoFiltro[] }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const atual = opcoes.find(o => o.ativo) ?? opcoes[0];
  const ligado = atual !== opcoes[0];
  return (
    <div className="grid gap-1 min-w-0">
      <span className="rotulo !text-[0.6rem] text-suave" aria-hidden="true">{rotulo}</span>
      <span className="relative">
        <select aria-label={rotulo} value={atual?.href} disabled={pendente} onChange={e => { const href = e.target.value; iniciar(() => router.push(href, { scroll: false })); }}
          className={`w-full h-10 pl-3 pr-8 border bg-card text-sm cursor-pointer appearance-none outline-none focus:border-marrom-950 disabled:opacity-60 ${ligado ? 'border-marrom-950 font-semibold text-marrom-950' : 'border-borda-forte'}`}>
          {opcoes.map(o => <option key={o.href + o.rotulo} value={o.href}>{o.rotulo}{o.n != null ? ` (${o.n})` : ''}</option>)}
        </select>
        <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-suave text-xs">▾</span>
      </span>
    </div>
  );
}

/** Os filtros lado a lado (quebram a linha no celular), com "Limpar filtros" quando há algum ligado. */
export function PainelFiltros({ children, limpar }: { children: React.ReactNode; limpar?: string | null }) {
  return (
    <div className="flex flex-wrap items-end gap-3 mb-6">
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-3 flex-1 [&>div]:sm:w-52">{children}</div>
      {limpar && <Link href={limpar} className="h-10 inline-flex items-center text-sm text-caramelo underline underline-offset-4">Limpar filtros</Link>}
    </div>
  );
}
