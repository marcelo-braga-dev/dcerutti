'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { itemAtivo, type EntradaMenu, type ItemMenu } from '@/lib/menu-painel';

const CHAVE = 'dcerutti-menu-aberto';

// Grupos abertos à mão, lembrados neste navegador (no servidor, nenhum).
const ouvintes = new Set<() => void>();
const lerAbertos = () => { try { return localStorage.getItem(CHAVE) ?? '[]'; } catch { return '[]'; } };
const assinar = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };
function gravarAbertos(v: string[]) {
  try { localStorage.setItem(CHAVE, JSON.stringify(v)); } catch {}
  ouvintes.forEach(f => f());
}

/**
 * Menu do painel com grupos. No computador, coluna lateral: o grupo da página aberta já vem aberto, e os outros abrem
 * e fecham com um toque (lembrado neste navegador). No celular, o botão Menu abre a mesma árvore numa gaveta.
 */
export function Navegacao({ menu, rodape }: { menu: EntradaMenu[]; rodape: React.ReactNode }) {
  const caminho = usePathname();
  const bruto = useSyncExternalStore(assinar, lerAbertos, () => '[]');
  let abertos: string[] = [];
  try { abertos = JSON.parse(bruto); } catch {}
  // A gaveta fica aberta só na página em que foi aberta: tocar num item fecha sozinho.
  const [gavetaEm, setGavetaEm] = useState<string | null>(null);
  const gaveta = gavetaEm === caminho;
  const setGaveta = (v: boolean) => setGavetaEm(v ? caminho : null);
  useEffect(() => {
    if (!gaveta) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setGavetaEm(null);
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [gaveta]);

  const alternar = (g: string) => gravarAbertos(abertos.includes(g) ? abertos.filter(x => x !== g) : [...abertos, g]);
  const atual = menu.flatMap(e => (e.tipo === 'item' ? [e.item] : e.itens)).find(i => itemAtivo(i.href, caminho));

  const arvore = (
    <ul className="grid gap-0.5">
      {menu.map(e => {
        if (e.tipo === 'item') return <li key={e.item.href}><Item item={e.item} ativo={itemAtivo(e.item.href, caminho)} /></li>;
        const temAtivo = e.itens.some(i => itemAtivo(i.href, caminho));
        const aberto = temAtivo || abertos.includes(e.rotulo);
        const pendencias = e.itens.reduce((a, i) => a + (i.contador ?? 0), 0);
        return (
          <li key={e.rotulo}>
            <button type="button" onClick={() => alternar(e.rotulo)} aria-expanded={aberto}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rotulo ${temAtivo ? 'text-creme' : 'text-areia hover:text-creme hover:bg-creme/10'}`}>
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className={`text-[0.6rem] transition-transform ${aberto ? 'rotate-90' : ''}`}>▶</span>{e.rotulo}
              </span>
              {!aberto && pendencias > 0 && <span className="bg-caramelo text-creme px-1.5 min-w-5 text-center">{pendencias}</span>}
            </button>
            {aberto && (
              <ul className="grid gap-0.5 mt-0.5 mb-1.5 ml-3 pl-2 border-l border-creme/15">
                {e.itens.map(i => <li key={i.href}><Item item={i} ativo={itemAtivo(i.href, caminho)} sub /></li>)}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      <nav aria-label="Painel" className="hidden lg:block">{arvore}</nav>
      <div className="lg:hidden flex items-center gap-3">
        <button type="button" onClick={() => setGaveta(true)} aria-expanded={gaveta} className="h-11 px-4 border border-creme/25 rotulo flex items-center gap-2">
          <span aria-hidden="true" className="text-base leading-none">☰</span> Menu
        </button>
        {atual && <span className="rotulo text-areia truncate">{atual.rotulo}</span>}
      </div>
      {gaveta && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu do painel">
          <button type="button" aria-label="Fechar o menu" className="absolute inset-0 bg-black/50" onClick={() => setGaveta(false)} />
          <div className="relative h-dvh w-[min(85vw,320px)] bg-marrom-950 text-creme p-4 flex flex-col gap-4 overflow-y-auto shadow-2xl">
            <button type="button" onClick={() => setGaveta(false)} className="self-end h-10 px-3 rotulo text-areia">Fechar ✕</button>
            <nav aria-label="Painel">{arvore}</nav>
            <div className="mt-auto pt-4 border-t border-creme/15">{rodape}</div>
          </div>
        </div>
      )}
    </>
  );
}

function Item({ item, ativo, sub }: { item: ItemMenu; ativo: boolean; sub?: boolean }) {
  return (
    <Link href={item.href} aria-current={ativo ? 'page' : undefined}
      className={`flex items-center justify-between gap-3 px-3 ${sub ? 'py-2 text-[0.68rem]' : 'py-2.5'} rotulo ${ativo ? 'bg-creme text-marrom-950' : 'text-areia hover:text-creme hover:bg-creme/10'}`}>
      {item.rotulo}
      {!!item.contador && <span className="bg-caramelo text-creme px-1.5 min-w-5 text-center">{item.contador}</span>}
    </Link>
  );
}

/**
 * Abas no topo das páginas de um grupo (Vendas, Clientes, Equipe, Loja): troca entre as páginas irmãs sem voltar ao
 * menu. Só aparece na página principal de cada item, não nas fichas e detalhes.
 */
export function AbasDoGrupo({ menu }: { menu: EntradaMenu[] }) {
  const caminho = usePathname();
  const grupo = menu.find((e): e is Extract<EntradaMenu, { tipo: 'grupo' }> => e.tipo === 'grupo' && e.itens.some(i => i.href === caminho));
  if (!grupo) return null;
  return (
    <nav aria-label={grupo.rotulo} className="mb-6 -mt-1 flex flex-wrap gap-x-1 gap-y-1 border-b border-borda">
      {grupo.itens.map(i => {
        const ativo = i.href === caminho;
        return (
          <Link key={i.href} href={i.href} aria-current={ativo ? 'page' : undefined}
            className={`px-3 sm:px-4 h-11 inline-flex items-center gap-2 rotulo !text-[0.68rem] border-b-2 -mb-px ${ativo ? 'border-marrom-950 text-marrom-950' : 'border-transparent text-suave hover:text-marrom-950'}`}>
            {i.rotulo}{!!i.contador && <span className="bg-caramelo text-creme px-1.5 min-w-5 text-center text-[0.6rem]">{i.contador}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
