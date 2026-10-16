'use client';

import Image from 'next/image';
import type { Imagem } from '@/lib/identidade';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { sair } from '@/server/acoes/conta';
import { useHidratado } from '@/lib/hidratado';
import { plural } from '@/lib/pedido';
import { linkWhatsApp } from '@/lib/whatsapp';
import { IconeCoracao, IconeFechar, IconeLupa, IconeMenu, IconePessoa, IconeSacola, IconeSeta } from '@/components/ui/icones';
import { BuscaTopo, type Atalho } from './busca-topo';
import { useFavoritos } from './favoritos';
import { IconeWhatsApp } from './previa-whatsapp';
import { useSacola } from './sacola';
import { nomeComSlogan, nomeDaLoja } from '@/lib/loja';

type Props = {
  /** Logo para fundo claro (D-25). */
  logo: Imagem;
  usuario: { nome: string; papel: 'cliente' | 'vendedor' | 'gestor' } | null;
  /** Categorias mais procuradas (menu do celular e atalhos da busca). */
  atalhos?: Atalho[];
  whatsapp?: string;
};

const LINKS = [
  { href: '/catalogo?genero=feminino', rotulo: 'Feminino', ativo: (p: URLSearchParams) => p.get('genero') === 'feminino' },
  { href: '/catalogo?genero=masculino', rotulo: 'Masculino', ativo: (p: URLSearchParams) => p.get('genero') === 'masculino' },
  { href: '/catalogo?ordem=novidades', rotulo: 'Novidades', ativo: (p: URLSearchParams) => p.get('ordem') === 'novidades' },
  { href: '/catalogo?promo=1', rotulo: 'Promoções', ativo: (p: URLSearchParams) => p.get('promo') === '1' },
  { href: '/catalogo?imperdivel=1', rotulo: 'Imperdível', ativo: (p: URLSearchParams) => p.get('imperdivel') === '1', destaque: true },
  { href: '/catalogo', rotulo: 'Tudo', ativo: (p: URLSearchParams) => p.size === 0 },
];

const botaoIcone = 'size-11 grid place-items-center text-marrom-950 hover:text-caramelo';

export function Cabecalho({ usuario, atalhos = [], whatsapp, logo }: Props) {
  const sacola = useSacola();
  const hidratado = useHidratado();
  const pronta = hidratado && sacola.pronta;
  const quantidade = pronta ? sacola.quantidade : 0;
  const caminho = usePathname();
  const params = useSearchParams();
  const [busca, setBusca] = useState(false);
  const [menu, setMenu] = useState(false);
  const noCatalogo = caminho === '/catalogo';
  const cliente = usuario?.papel === 'cliente';
  const favoritos = useFavoritos().ids.size;

  // Trocou de página: fecha busca e menu.
  const chave = `${caminho}?${params}`;
  const [ultima, setUltima] = useState(chave);
  if (ultima !== chave) { setUltima(chave); setBusca(false); setMenu(false); }

  useEffect(() => {
    if (!menu) return;
    document.body.style.overflow = 'hidden';
    const fechar = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('keydown', fechar);
    return () => { document.body.style.overflow = ''; document.removeEventListener('keydown', fechar); };
  }, [menu]);

  return (
    <header className="sticky top-0 z-30 bg-creme/92 backdrop-blur-md border-b border-borda">
      <div className="mx-auto max-w-[1440px] px-2 sm:px-8 py-2 sm:py-3 flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setMenu(true)} className={`${botaoIcone} lg:hidden`} aria-label="Abrir menu" aria-expanded={menu}>
            <IconeMenu className="size-6" />
          </button>
          <Link href="/" className="shrink-0" aria-label={`${nomeDaLoja()} — início`}>
            <Image src={logo.url} alt={nomeComSlogan()} width={logo.largura} height={logo.altura} sizes="240px" className="h-10 sm:h-13 w-auto mix-blend-multiply" priority />
          </Link>
        </div>

        <nav className="hidden lg:flex items-center gap-6 rotulo" aria-label="Seções">
          {LINKS.map(l => {
            const ativo = noCatalogo && l.ativo(params);
            return (
              <Link key={l.href} href={l.href} className={`py-2 border-b-2 ${ativo ? 'border-caramelo' : 'border-transparent hover:border-borda-forte'} ${l.destaque ? 'text-imperdivel' : 'text-marrom-950'}`}>
                {l.rotulo}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-0.5 sm:gap-2">
          <button type="button" onClick={() => setBusca(b => !b)} className={botaoIcone} aria-label="Buscar" aria-expanded={busca} aria-controls="busca-topo">
            {busca ? <IconeFechar className="size-6" /> : <IconeLupa className="size-6" />}
          </button>
          {(!usuario || cliente) && (
            <Link href="/minha-conta/favoritos" className={`${botaoIcone} relative`} aria-label={hidratado && favoritos ? `Favoritos (${favoritos})` : 'Favoritos'}>
              <IconeCoracao className="size-6" />
              {hidratado && favoritos > 0 && (
                <span className="absolute top-1 right-0.5 grid place-items-center min-w-4 h-4 px-1 rounded-full bg-imperdivel text-white text-[0.6rem] font-bold leading-none">{favoritos}</span>
              )}
            </Link>
          )}
          {usuario && !cliente ? (
            <Link href="/painel" className="h-11 px-2 grid place-items-center rotulo text-oliva hover:text-caramelo">Painel</Link>
          ) : (
            <Link href={usuario ? '/minha-conta' : '/entrar'} className={botaoIcone} aria-label={usuario ? 'Minha conta' : 'Entrar'} title={usuario ? usuario.nome : 'Entrar'}>
              <IconePessoa className="size-6" />
            </Link>
          )}
          <Link href="/sacola" className={`${botaoIcone} relative`} aria-label={pronta ? `Sacola com ${plural(quantidade, 'peça', 'peças')}` : 'Sacola'} title="Sacola">
            <IconeSacola className="size-6" />
            {pronta && quantidade > 0 && (
              <span className="absolute top-1 right-0.5 grid place-items-center min-w-4 h-4 px-1 rounded-full bg-marrom-950 text-creme text-[0.6rem] font-bold leading-none">{quantidade}</span>
            )}
          </Link>
        </div>
      </div>

      <nav className="lg:hidden flex gap-5 overflow-x-auto px-4 pr-10 rotulo [scrollbar-width:none] [mask-image:linear-gradient(to_right,black_85%,transparent)]" aria-label="Seções">
        {LINKS.map(l => (
          <Link key={l.href} href={l.href} className={`shrink-0 py-2.5 border-b-2 ${noCatalogo && l.ativo(params) ? 'border-caramelo' : 'border-transparent'} ${l.destaque ? 'text-imperdivel' : 'text-marrom-950'}`}>
            {l.rotulo}
          </Link>
        ))}
      </nav>

      {busca && (
        <div id="busca-topo" className="border-t border-borda bg-card/95">
          <div className="mx-auto max-w-3xl px-4 sm:px-8 py-4">
            <BuscaTopo inicial={params.get('q') ?? ''} atalhos={atalhos} aoFechar={() => setBusca(false)} />
          </div>
        </div>
      )}

      {menu && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-marrom-950/50" onClick={() => setMenu(false)} />
          <div className="relative h-dvh w-[min(88vw,380px)] bg-creme flex flex-col shadow-2xl">
            <div className="flex items-center justify-between pl-5 pr-2 h-16 border-b border-borda shrink-0">
              <span className="font-[Georgia,serif] italic text-2xl text-marrom-950">{nomeDaLoja()}</span>
              <button type="button" onClick={() => setMenu(false)} className={botaoIcone} aria-label="Fechar menu"><IconeFechar className="size-6" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="p-4 border-b border-borda"><BuscaTopo inicial="" atalhos={[]} aoFechar={() => setMenu(false)} autoFocus={false} /></div>
              <nav aria-label="Seções" className="py-2">
                {LINKS.map(l => (
                  <Link key={l.href} href={l.href} className={`flex items-center justify-between px-5 h-12 rotulo ${l.destaque ? 'text-imperdivel' : 'text-marrom-950'}`}>
                    {l.rotulo}<IconeSeta className="size-4 text-suave" />
                  </Link>
                ))}
              </nav>
              {atalhos.length > 0 && (
                <div className="px-5 py-4 border-t border-borda">
                  <div className="rotulo text-suave mb-3">Categorias</div>
                  <div className="grid grid-cols-2 gap-2">
                    {atalhos.map(a => <Link key={a.href} href={a.href} className="min-h-11 px-3 flex items-center border border-borda-forte bg-card text-sm">{a.rotulo}</Link>)}
                  </div>
                </div>
              )}
              <div className="px-5 py-4 border-t border-borda grid gap-1">
                {usuario ? (
                  <>
                    {cliente && <Link href="/minha-conta/pedidos" className="h-11 flex items-center text-marrom-950">Meus pedidos</Link>}
                    {cliente && <Link href="/minha-conta/favoritos" className="h-11 flex items-center gap-2 text-marrom-950"><IconeCoracao className="size-5" />Favoritos{favoritos > 0 && <span className="text-suave">({favoritos})</span>}</Link>}
                    <Link href={cliente ? '/minha-conta' : '/painel'} className="h-11 flex items-center text-marrom-950">{cliente ? 'Minha conta' : 'Painel'}</Link>
                    <form action={sair}><button className="h-11 flex items-center text-suave">Sair</button></form>
                  </>
                ) : (
                  <Link href="/entrar" className="h-11 flex items-center text-marrom-950">Entrar ou criar conta</Link>
                )}
              </div>
            </div>
            {whatsapp && (
              <a href={linkWhatsApp(whatsapp, `Olá! Vim pelo catálogo da ${nomeDaLoja()}.`)} target="_blank" rel="noopener"
                className="shrink-0 m-4 h-12 flex items-center justify-center gap-2 bg-whatsapp text-white rotulo">
                <IconeWhatsApp className="size-5" />Falar com a loja
              </a>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
