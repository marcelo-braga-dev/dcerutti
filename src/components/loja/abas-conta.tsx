'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ABAS = [
  { href: '/minha-conta/pedidos', rotulo: 'Meus pedidos' },
  { href: '/minha-conta', rotulo: 'Meus dados' },
];

export function AbasConta() {
  const caminho = usePathname();
  return (
    <nav className="mt-6 flex gap-6 border-b border-borda rotulo" aria-label="Minha conta">
      {ABAS.map(a => {
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
