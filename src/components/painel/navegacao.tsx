'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type ItemNav = { href: string; rotulo: string; contador?: number };

export function Navegacao({ itens }: { itens: ItemNav[] }) {
  const caminho = usePathname();
  const ativo = (href: string) => (href === '/painel' ? caminho === href : caminho.startsWith(href));
  return (
    <nav className="flex lg:flex-col gap-1 overflow-x-auto [scrollbar-width:none]" aria-label="Painel">
      {itens.map(i => (
        <Link key={i.href} href={i.href} aria-current={ativo(i.href) ? 'page' : undefined}
          className={`shrink-0 flex items-center justify-between gap-3 px-3 py-2.5 rotulo ${ativo(i.href) ? 'bg-creme text-marrom-950' : 'text-areia hover:text-creme hover:bg-creme/10'}`}>
          {i.rotulo}
          {!!i.contador && <span className="bg-caramelo text-creme px-1.5 min-w-5 text-center">{i.contador}</span>}
        </Link>
      ))}
    </nav>
  );
}
