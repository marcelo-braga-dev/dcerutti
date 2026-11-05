'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { itemAtivo, type EntradaMenu, type ItemMenu } from '@/lib/menu-painel';
import {
  IconeAtividade, IconeBrilho, IconeCaixaLoja, IconeEngrenagem, IconeEquipe, IconeEtiqueta, IconeFechar, IconeGrade, IconeGrafico, IconeMenu,
  IconeOlho, IconePaleta, IconePessoa, IconeRecibo, IconeSacola, IconeSeta,
} from '@/components/ui/icones';

/** Ícone de cada item e grupo do menu (pelo endereço ou pelo nome do grupo). */
const ICONES: Record<string, (p: { className?: string }) => React.ReactElement> = {
  '/painel': IconeGrade, '/caixa': IconeCaixaLoja, '/painel/pedidos': IconeRecibo, '/painel/sugestoes': IconeBrilho, '/painel/vendas': IconeGrafico,
  '/painel/cupons': IconeEtiqueta, '/painel/clientes': IconePessoa, '/painel/interesse': IconeOlho, '/painel/vendedores': IconeEquipe,
  '/painel/equipe': IconeAtividade, '/painel/resultados': IconeGrafico, '/painel/produtos': IconeSacola, '/painel/configuracoes': IconeEngrenagem,
  '/painel/identidade': IconePaleta, '/editar/inicio': IconeGrade, Vendas: IconeRecibo, Clientes: IconePessoa, Equipe: IconeEquipe, Loja: IconeSacola,
};
function Icone({ chave, className = 'size-[1.15rem]' }: { chave: string; className?: string }) {
  const I = ICONES[chave];
  return I ? <I className={className} /> : <span className="size-[1.15rem]" />;
}

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
    <ul className="grid gap-1">
      {menu.map(e => {
        if (e.tipo === 'item') return <li key={e.item.href}><Item item={e.item} ativo={itemAtivo(e.item.href, caminho)} /></li>;
        const temAtivo = e.itens.some(i => itemAtivo(i.href, caminho));
        const aberto = temAtivo || abertos.includes(e.rotulo);
        const pendencias = e.itens.reduce((a, i) => a + (i.contador ?? 0), 0);
        return (
          <li key={e.rotulo}>
            <button type="button" onClick={() => alternar(e.rotulo)} aria-expanded={aberto}
              className={`w-full flex items-center justify-between gap-3 px-3 h-11 rounded-xl text-sm font-medium transition-colors ${temAtivo ? 'text-creme' : 'text-areia hover:text-creme hover:bg-creme/10'}`}>
              <span className="flex items-center gap-3"><Icone chave={e.rotulo} />{e.rotulo}</span>
              <span className="flex items-center gap-2">
                {!aberto && pendencias > 0 && <span className="h-5 px-1.5 min-w-5 grid place-items-center rounded-full bg-caramelo text-creme text-[0.65rem] font-bold">{pendencias}</span>}
                <IconeSeta className={`size-4 opacity-60 transition-transform ${aberto ? 'rotate-90' : ''}`} />
              </span>
            </button>
            {aberto && (
              <ul className="grid gap-0.5 mt-0.5 mb-2 ml-[1.35rem] pl-3 border-l border-creme/15">
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
        <button type="button" onClick={() => setGaveta(true)} aria-expanded={gaveta} className="h-10 px-4 rounded-full bg-creme/10 text-sm font-semibold flex items-center gap-2">
          <IconeMenu className="size-4" /> Menu
        </button>
        {atual && <span className="text-sm text-areia truncate">{atual.rotulo}</span>}
      </div>
      {gaveta && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu do painel">
          <button type="button" aria-label="Fechar o menu" className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setGaveta(false)} />
          <div className="relative h-dvh w-[min(85vw,320px)] bg-marrom-950 text-creme p-4 flex flex-col gap-4 overflow-y-auto shadow-2xl rounded-r-3xl animate-[aparecer_.2s_ease-out]">
            <button type="button" onClick={() => setGaveta(false)} className="self-end size-10 grid place-items-center rounded-full text-areia hover:bg-creme/10" aria-label="Fechar"><IconeFechar className="size-5" /></button>
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
      className={`flex items-center justify-between gap-3 px-3 ${sub ? 'h-9 text-[0.84rem]' : 'h-11 text-sm'} rounded-xl font-medium transition-colors ${ativo ? 'bg-creme text-marrom-950 shadow-sm' : 'text-areia hover:text-creme hover:bg-creme/10'}`}>
      <span className="flex items-center gap-3 min-w-0">{!sub && <Icone chave={item.href} />}<span className="truncate">{item.rotulo}</span></span>
      {!!item.contador && <span className={`h-5 px-1.5 min-w-5 grid place-items-center rounded-full text-[0.65rem] font-bold ${ativo ? 'bg-marrom-950 text-creme' : 'bg-caramelo text-creme'}`}>{item.contador}</span>}
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
    <nav aria-label={grupo.rotulo} className="mb-6 flex gap-1 p-1 rounded-full bg-card border border-borda w-fit max-w-full overflow-x-auto sem-barra">
      {grupo.itens.map(i => {
        const ativo = i.href === caminho;
        return (
          <Link key={i.href} href={i.href} aria-current={ativo ? 'page' : undefined}
            className={`shrink-0 px-4 h-9 inline-flex items-center gap-2 rounded-full text-sm font-semibold transition-colors ${ativo ? 'bg-marrom-950 text-creme' : 'text-suave hover:text-marrom-950 hover:bg-creme'}`}>
            {i.rotulo}{!!i.contador && <span className={`h-5 px-1.5 min-w-5 grid place-items-center rounded-full text-[0.62rem] font-bold ${ativo ? 'bg-creme text-marrom-950' : 'bg-caramelo text-creme'}`}>{i.contador}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
