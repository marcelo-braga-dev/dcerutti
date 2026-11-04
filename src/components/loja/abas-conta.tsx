'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ABAS = [
  { href: '/minha-conta/pedidos', rotulo: 'Meus pedidos' },
  // D-27: peças que quem atende separou para a cliente.
  { href: '/minha-conta/sugestoes', rotulo: 'Sugestões para você' },
  { href: '/minha-conta/favoritos', rotulo: 'Favoritos' },
  { href: '/minha-conta', rotulo: 'Meus dados' },
];

/** `cupons`: aba "Meus cupons" só com os cupons ligados pelo gestor. */
export function AbasConta({ cupons = false }: { cupons?: boolean }) {
  const caminho = usePathname();
  const abas = cupons ? [ABAS[0], ABAS[1], ABAS[2], { href: '/minha-conta/cupons', rotulo: 'Meus cupons' }, ABAS[3]] : ABAS;
  return (
    <nav className="mt-8 -mx-4 px-4 sm:mx-0 sm:px-0 flex gap-2 overflow-x-auto sem-barra whitespace-nowrap" aria-label="Minha conta">
      {abas.map(a => {
        const ativa = caminho === a.href;
        return (
          <Link key={a.href} href={a.href} aria-current={ativa ? 'page' : undefined}
            className={`h-10 px-4 grid place-items-center rounded-full border text-sm font-semibold transition-colors ${ativa ? 'bg-marrom-950 border-marrom-950 text-creme' : 'border-borda-forte text-marrom-950 hover:border-marrom-950'}`}>
            {a.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
