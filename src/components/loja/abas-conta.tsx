'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ABAS = [
  { href: '/minha-conta/pedidos', rotulo: 'Meus pedidos' },
  { href: '/minha-conta/favoritos', rotulo: 'Favoritos' },
  { href: '/minha-conta', rotulo: 'Meus dados' },
];

/** `cupons`: aba "Meus cupons" só com os cupons ligados pelo gestor. */
export function AbasConta({ cupons = false }: { cupons?: boolean }) {
  const caminho = usePathname();
  const abas = cupons ? [ABAS[0], ABAS[1], { href: '/minha-conta/cupons', rotulo: 'Meus cupons' }, ABAS[2]] : ABAS;
  return (
    <nav className="mt-6 flex gap-6 border-b border-borda rotulo overflow-x-auto [scrollbar-width:none] whitespace-nowrap" aria-label="Minha conta">
      {abas.map(a => {
        const ativa = caminho === a.href;
        return (
          <Link key={a.href} href={a.href} aria-current={ativa ? 'page' : undefined}
            className={`-mb-px pb-3 border-b-2 ${ativa ? 'border-caramelo text-marrom-950' : 'border-transparent text-suave hover:text-marrom-950'}`}>
            {a.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
