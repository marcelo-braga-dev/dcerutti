'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { sair } from '@/server/acoes/conta';
import { useHidratado } from '@/lib/hidratado';
import { useSacola } from './sacola';

type Props = { usuario: { nome: string; papel: 'cliente' | 'vendedor' | 'gestor' } | null };

const LINKS = [
  { href: '/catalogo?genero=feminino', rotulo: 'Feminino', ativo: (p: URLSearchParams) => p.get('genero') === 'feminino' },
  { href: '/catalogo?genero=masculino', rotulo: 'Masculino', ativo: (p: URLSearchParams) => p.get('genero') === 'masculino' },
  { href: '/catalogo?promo=1', rotulo: 'Promoções', ativo: (p: URLSearchParams) => p.get('promo') === '1' },
  { href: '/catalogo?imperdivel=1', rotulo: 'Imperdível', ativo: (p: URLSearchParams) => p.get('imperdivel') === '1', destaque: true },
  { href: '/catalogo', rotulo: 'Tudo', ativo: (p: URLSearchParams) => p.size === 0 },
];

export function Cabecalho({ usuario }: Props) {
  const sacola = useSacola();
  const hidratado = useHidratado();
  const pronta = hidratado && sacola.pronta;
  const quantidade = pronta ? sacola.quantidade : 0;
  const caminho = usePathname();
  const params = useSearchParams();
  const [busca, setBusca] = useState(false);
  const noCatalogo = caminho === '/catalogo';

  return (
    <header className="sticky top-0 z-30 bg-creme/92 backdrop-blur-md border-b border-borda">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-8 py-3 flex items-center justify-between gap-4">
        <Link href="/" className="shrink-0" aria-label="D'Cerutti — início">
          <Image src="/logo-dcerutti.png" alt="D'Cerutti — O Básico Aconchego" width={120} height={55} className="h-11 sm:h-13 w-auto mix-blend-multiply" priority />
        </Link>

        <nav className="hidden lg:flex items-center gap-6 rotulo" aria-label="Seções">
          {LINKS.map(l => {
            const ativo = noCatalogo && l.ativo(params);
            return (
              <Link key={l.href} href={l.href} className={`pb-1 border-b-2 ${ativo ? 'border-caramelo' : 'border-transparent hover:border-borda-forte'} ${l.destaque ? 'text-imperdivel' : 'text-marrom-950'}`}>
                {l.rotulo}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1 sm:gap-3">
          <button type="button" onClick={() => setBusca(b => !b)} className="p-2 rotulo text-marrom-950 hover:text-caramelo" aria-expanded={busca} aria-controls="busca-topo">
            Buscar
          </button>
          {usuario && usuario.papel !== 'cliente' ? (
            <Link href="/painel" className="p-2 rotulo text-oliva hover:text-caramelo">Painel</Link>
          ) : usuario ? (
            <Link href="/minha-conta" className="p-2 rotulo text-marrom-950 hover:text-caramelo">
              <span className="sm:hidden">Conta</span>
              <span className="hidden sm:inline">Olá, {usuario.nome.split(' ')[0]}</span>
            </Link>
          ) : (
            <Link href="/entrar" className="p-2 rotulo text-marrom-950 hover:text-caramelo">Entrar</Link>
          )}
          {usuario && (
            <form action={sair} className="hidden sm:block">
              <button className="p-2 rotulo text-suave hover:text-caramelo">Sair</button>
            </form>
          )}
          <Link href="/sacola" className="flex items-center gap-2 bg-marrom-950 text-creme px-3 h-10 rotulo" aria-label={pronta ? `Sacola com ${quantidade} peça(s)` : 'Sacola'}>
            Sacola
            <span className={`grid place-items-center min-w-6 h-6 px-1 text-[0.7rem] ${pronta && quantidade ? 'bg-caramelo' : 'bg-creme/20'}`}>{pronta ? quantidade : '·'}</span>
          </Link>
        </div>
      </div>

      <nav className="lg:hidden flex gap-5 overflow-x-auto px-4 pr-10 pb-3 rotulo [scrollbar-width:none] [mask-image:linear-gradient(to_right,black_85%,transparent)]" aria-label="Seções">
        {LINKS.map(l => (
          <Link key={l.href} href={l.href} className={`shrink-0 pb-1 border-b-2 ${noCatalogo && l.ativo(params) ? 'border-caramelo' : 'border-transparent'} ${l.destaque ? 'text-imperdivel' : 'text-marrom-950'}`}>
            {l.rotulo}
          </Link>
        ))}
      </nav>

      {busca && (
        <form id="busca-topo" action="/catalogo" className="border-t border-borda bg-card">
          <div className="mx-auto max-w-[1440px] px-4 sm:px-8 py-3 flex gap-2">
            <input name="q" autoFocus defaultValue={params.get('q') ?? ''} placeholder="Buscar por nome, referência ou categoria…" className="flex-1 h-11 px-3 border border-borda-forte bg-card outline-none focus:border-marrom-950" aria-label="Buscar produtos" />
            <button className="h-11 px-5 bg-marrom-950 text-creme rotulo">Buscar</button>
          </div>
        </form>
      )}
    </header>
  );
}
