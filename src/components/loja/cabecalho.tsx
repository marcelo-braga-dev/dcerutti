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
  { href: '/catalogo?ordem=novidades', rotulo: 'Novidades', ativo: (p: URLSearchParams) => p.get('ordem') === 'novidades' },
  { href: '/catalogo?genero=feminino', rotulo: 'Feminino', ativo: (p: URLSearchParams) => p.get('genero') === 'feminino' },
  { href: '/catalogo?genero=masculino', rotulo: 'Masculino', ativo: (p: URLSearchParams) => p.get('genero') === 'masculino' },
  { href: '/catalogo?promo=1', rotulo: 'Promoções', ativo: (p: URLSearchParams) => p.get('promo') === '1' },
  { href: '/catalogo?imperdivel=1', rotulo: 'Imperdível', ativo: (p: URLSearchParams) => p.get('imperdivel') === '1', destaque: true },
  { href: '/catalogo', rotulo: 'Ver tudo', ativo: (p: URLSearchParams) => p.size === 0 },
];

const botaoIcone = 'relative size-11 grid place-items-center rounded-full text-marrom-950 hover:bg-creme transition-colors';
const selo = 'absolute top-1 right-1 grid place-items-center min-w-[1.125rem] h-[1.125rem] px-1 rounded-full text-[0.62rem] font-bold leading-none ring-2 ring-card';

/**
 * Topo da loja: logo, busca sempre à vista no computador (no celular, pela lupa), conta, favoritos e sacola com a
 * quantidade. Abaixo, as seções: links no computador e pílulas que rolam de lado no celular.
 */
export function Cabecalho({ usuario, atalhos = [], whatsapp, logo }: Props) {
  const sacola = useSacola();
  const hidratado = useHidratado();
  const pronta = hidratado && sacola.pronta;
  const quantidade = pronta ? sacola.quantidade : 0;
  const caminho = usePathname();
  const params = useSearchParams();
  const [busca, setBusca] = useState(false);
  const [menu, setMenu] = useState(false);
  const [rolou, setRolou] = useState(false);
  const noCatalogo = caminho === '/catalogo';
  const cliente = usuario?.papel === 'cliente';
  const favoritos = useFavoritos().ids.size;
  const primeiroNome = usuario?.nome.split(' ')[0];

  // Trocou de página: fecha busca e menu.
  const chave = `${caminho}?${params}`;
  const [ultima, setUltima] = useState(chave);
  if (ultima !== chave) { setUltima(chave); setBusca(false); setMenu(false); }

  useEffect(() => {
    const aoRolar = () => setRolou(window.scrollY > 8);
    aoRolar();
    window.addEventListener('scroll', aoRolar, { passive: true });
    return () => window.removeEventListener('scroll', aoRolar);
  }, []);

  useEffect(() => {
    if (!menu) return;
    document.body.style.overflow = 'hidden';
    const fechar = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('keydown', fechar);
    return () => { document.body.style.overflow = ''; document.removeEventListener('keydown', fechar); };
  }, [menu]);

  return (
    <header className={`sticky top-0 z-30 bg-card/90 backdrop-blur-xl transition-shadow ${rolou ? 'shadow-[0_8px_24px_-18px_rgba(46,37,32,0.45)]' : ''}`}>
      <div className="mx-auto max-w-[1440px] px-3 sm:px-8 h-16 lg:h-20 flex items-center gap-2 lg:gap-8">
        <button type="button" onClick={() => setMenu(true)} className={`${botaoIcone} lg:hidden -ml-1`} aria-label="Abrir menu" aria-expanded={menu}>
          <IconeMenu className="size-6" />
        </button>
        <Link href="/" className="shrink-0 mr-auto lg:mr-0" aria-label={`${nomeDaLoja()} — início`}>
          <Image src={logo.url} alt={nomeComSlogan()} width={logo.largura} height={logo.altura} sizes="240px" className="h-9 sm:h-11 lg:h-12 w-auto mix-blend-multiply" priority />
        </Link>

        <div className="hidden lg:block flex-1 max-w-2xl mx-auto">
          <BuscaTopo inicial={params.get('q') ?? ''} atalhos={atalhos} autoFocus={false} flutuante />
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1">
          <button type="button" onClick={() => setBusca(b => !b)} className={`${botaoIcone} lg:hidden`} aria-label="Buscar" aria-expanded={busca} aria-controls="busca-topo">
            {busca ? <IconeFechar className="size-6" /> : <IconeLupa className="size-6" />}
          </button>
          {usuario && !cliente ? (
            <Link href="/painel" className="h-10 px-4 grid place-items-center rounded-full bg-oliva/10 text-oliva text-sm font-semibold hover:bg-oliva/20">Painel</Link>
          ) : (
            <Link href={usuario ? '/minha-conta' : '/entrar'} className="group flex items-center gap-2 rounded-full lg:pr-3 hover:bg-creme transition-colors" aria-label={usuario ? 'Minha conta' : 'Entrar'} title={usuario ? usuario.nome : 'Entrar'}>
              <span className="size-11 grid place-items-center text-marrom-950"><IconePessoa className="size-6" /></span>
              <span className="hidden lg:grid text-left leading-tight" aria-hidden="true">
                <span className="text-[0.7rem] text-suave">{usuario ? `Olá, ${primeiroNome}` : 'Olá!'}</span>
                <span className="text-sm font-semibold text-marrom-950">{usuario ? 'Minha conta' : 'Entrar'}</span>
              </span>
            </Link>
          )}
          {(!usuario || cliente) && (
            <Link href="/minha-conta/favoritos" className={`${botaoIcone} hidden sm:grid`} aria-label={hidratado && favoritos ? `Favoritos (${favoritos})` : 'Favoritos'}>
              <IconeCoracao className="size-6" />
              {hidratado && favoritos > 0 && <span className={`${selo} bg-imperdivel text-white`}>{favoritos}</span>}
            </Link>
          )}
          <Link href="/sacola" className={botaoIcone} aria-label={pronta ? `Sacola com ${plural(quantidade, 'peça', 'peças')}` : 'Sacola'} title="Sacola">
            <IconeSacola className="size-6" />
            {pronta && quantidade > 0 && <span className={`${selo} bg-marrom-950 text-creme`}>{quantidade}</span>}
          </Link>
        </div>
      </div>

      {/* Seções: links no computador. */}
      <nav className="hidden lg:block border-t border-borda/70" aria-label="Seções">
        <div className="mx-auto max-w-[1440px] px-8 h-12 flex items-center justify-center gap-1">
          {LINKS.map(l => {
            const ativo = noCatalogo && l.ativo(params);
            return l.destaque ? (
              <Link key={l.href} href={l.href} className={`mx-1 h-8 px-3.5 grid place-items-center rounded-full text-sm font-semibold transition-colors ${ativo ? 'bg-imperdivel text-white' : 'bg-imperdivel/10 text-imperdivel hover:bg-imperdivel hover:text-white'}`}>
                {l.rotulo}
              </Link>
            ) : (
              <Link key={l.href} href={l.href} aria-current={ativo ? 'page' : undefined}
                className={`relative h-12 px-4 grid place-items-center text-sm font-medium transition-colors after:absolute after:inset-x-4 after:bottom-0 after:h-0.5 after:rounded-full after:transition-transform ${ativo ? 'text-marrom-950 after:bg-marrom-950' : 'text-marrom-900/80 hover:text-marrom-950 after:bg-marrom-950 after:scale-x-0 hover:after:scale-x-100'}`}>
                {l.rotulo}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Seções: pílulas no celular. */}
      <nav className="lg:hidden flex gap-2 overflow-x-auto px-3 sm:px-8 pb-3 sem-barra" aria-label="Seções">
        {LINKS.map(l => {
          const ativo = noCatalogo && l.ativo(params);
          return (
            <Link key={l.href} href={l.href}
              className={`shrink-0 h-9 px-4 grid place-items-center rounded-full text-sm font-medium border transition-colors ${ativo ? (l.destaque ? 'bg-imperdivel border-imperdivel text-white' : 'bg-marrom-950 border-marrom-950 text-creme') : l.destaque ? 'border-imperdivel/30 bg-imperdivel/5 text-imperdivel' : 'border-borda bg-card text-marrom-950'}`}>
              {l.rotulo}
            </Link>
          );
        })}
      </nav>

      {busca && (
        <div id="busca-topo" className="lg:hidden border-t border-borda bg-card">
          <div className="px-3 sm:px-8 py-3">
            <BuscaTopo inicial={params.get('q') ?? ''} atalhos={atalhos} aoFechar={() => setBusca(false)} />
          </div>
        </div>
      )}

      {menu && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-marrom-950/40 backdrop-blur-sm" onClick={() => setMenu(false)} />
          <div className="relative h-dvh w-[min(88vw,380px)] bg-card flex flex-col shadow-2xl rounded-r-3xl overflow-hidden animate-[aparecer_.2s_ease-out]">
            <div className="flex items-center justify-between pl-5 pr-2 h-16 shrink-0">
              <span className="titulo text-2xl italic">{nomeDaLoja()}</span>
              <button type="button" onClick={() => setMenu(false)} className={botaoIcone} aria-label="Fechar menu"><IconeFechar className="size-6" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="px-4 pb-4"><BuscaTopo inicial="" atalhos={[]} aoFechar={() => setMenu(false)} autoFocus={false} /></div>
              {usuario ? (
                <div className="mx-4 mb-2 p-4 rounded-2xl bg-creme flex items-center gap-3">
                  <span className="size-11 rounded-full bg-marrom-950 text-creme grid place-items-center font-semibold">{primeiroNome?.[0]}</span>
                  <div className="min-w-0"><div className="text-xs text-suave">Olá,</div><div className="font-semibold truncate">{usuario.nome}</div></div>
                </div>
              ) : (
                <Link href="/entrar" className="mx-4 mb-2 p-4 rounded-2xl bg-creme flex items-center gap-3">
                  <span className="size-11 rounded-full bg-marrom-950 text-creme grid place-items-center"><IconePessoa className="size-5" /></span>
                  <div><div className="font-semibold">Entrar ou criar conta</div><div className="text-xs text-suave">Acompanhe pedidos e favoritos</div></div>
                </Link>
              )}
              <nav aria-label="Seções" className="px-2 py-2">
                {LINKS.map(l => (
                  <Link key={l.href} href={l.href} className={`flex items-center justify-between px-3 h-12 rounded-xl text-[0.95rem] font-medium hover:bg-creme ${l.destaque ? 'text-imperdivel' : 'text-marrom-950'}`}>
                    {l.rotulo}<IconeSeta className="size-4 text-suave" />
                  </Link>
                ))}
              </nav>
              {atalhos.length > 0 && (
                <div className="px-5 py-4 border-t border-borda">
                  <div className="rotulo !text-[0.62rem] text-suave mb-3">Categorias</div>
                  <div className="flex flex-wrap gap-2">
                    {atalhos.map(a => <Link key={a.href} href={a.href} className="h-9 px-3.5 inline-flex items-center rounded-full border border-borda-forte text-sm">{a.rotulo}</Link>)}
                  </div>
                </div>
              )}
              <div className="px-2 py-3 border-t border-borda grid">
                {usuario ? (
                  <>
                    {cliente && <Link href="/minha-conta/pedidos" className="h-11 px-3 rounded-xl flex items-center hover:bg-creme">Meus pedidos</Link>}
                    {cliente && <Link href="/minha-conta/favoritos" className="h-11 px-3 rounded-xl flex items-center gap-2 hover:bg-creme"><IconeCoracao className="size-5" />Favoritos{favoritos > 0 && <span className="text-suave">({favoritos})</span>}</Link>}
                    <Link href={cliente ? '/minha-conta' : '/painel'} className="h-11 px-3 rounded-xl flex items-center hover:bg-creme">{cliente ? 'Minha conta' : 'Painel'}</Link>
                    <form action={sair}><button className="h-11 px-3 flex items-center text-suave">Sair</button></form>
                  </>
                ) : null}
              </div>
            </div>
            {whatsapp && (
              <a href={linkWhatsApp(whatsapp, `Olá! Vim pelo catálogo da ${nomeDaLoja()}.`)} target="_blank" rel="noopener"
                className="shrink-0 m-4 h-12 flex items-center justify-center gap-2 rounded-full bg-whatsapp text-white font-semibold">
                <IconeWhatsApp className="size-5" />Falar com a loja
              </a>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
