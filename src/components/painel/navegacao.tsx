'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { abasDaPagina, areaAtiva, COOKIE_RECOLHIDO, type ItemMenu, type SecaoMenu } from '@/lib/menu-painel';
import {
  IconeAjuda, IconeBrilho, IconeCaixaLoja, IconeConversa, IconeEngrenagem, IconeEquipe, IconeEtiqueta, IconeExterno, IconeFechar, IconeGrade, IconeGrafico, IconeLoja,
  IconeMenu, IconePessoa, IconeRecibo, IconeSacola, IconeSair, IconeSeta, IconeVitrine,
} from '@/components/ui/icones';

/** Um ícone por área (D-35): cada item da coluna tem o seu, e é ele que aparece na faixa recolhida. */
const ICONES: Record<string, (p: { className?: string }) => React.ReactElement> = {
  inicio: IconeGrade, caixa: IconeCaixaLoja, atendimento: IconeConversa, pedidos: IconeRecibo, sugestoes: IconeBrilho, vitrines: IconeVitrine,
  clientes: IconePessoa, cupons: IconeEtiqueta, produtos: IconeSacola, resultados: IconeGrafico, equipe: IconeEquipe, configuracoes: IconeEngrenagem,
  tutorial: IconeAjuda,
};
function Icone({ chave }: { chave: string }) {
  const I = ICONES[chave];
  return I ? <I className="size-[1.15rem] shrink-0" /> : <span className="size-[1.15rem] shrink-0" />;
}

/** Em cookie, não no localStorage: o servidor precisa saber para desenhar a coluna certa de primeira. */
function lembrarRecolhido(v: boolean) {
  document.cookie = `${COOKIE_RECOLHIDO}=${v ? '1' : '0'}; path=/; max-age=31536000; SameSite=Lax`;
}

const numeroCurto = (n: number) => (n > 99 ? '99+' : String(n));
const FOCO = 'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-areia';
const LINHA = `relative flex items-center gap-3 rounded-xl font-medium transition-colors motion-reduce:transition-none ${FOCO}`;
const CALMO = 'text-areia hover:text-creme hover:bg-creme/[.07]';
const ATIVO = 'bg-creme/[.12] text-creme';
/** Barra à esquerda da área ativa: indica a página sem depender só da cor. */
const MARCA = 'absolute left-0 inset-y-2 w-[3px] rounded-r-full bg-areia';

function Selo({ n, sobreIcone }: { n: number; sobreIcone?: boolean }) {
  return (
    <span aria-hidden="true" className={`grid place-items-center rounded-full bg-areia text-marrom-950 font-bold tabular-nums ${sobreIcone ? 'absolute -top-2 left-[60%] h-4 min-w-4 px-1 text-[0.58rem] ring-2 ring-marrom-950' : 'h-5 min-w-5 px-1.5 text-[0.65rem] shrink-0'}`}>
      {numeroCurto(n)}
    </span>
  );
}

const nomeAcessivel = (i: ItemMenu) => [i.rotulo, i.contador ? `${i.contador} pendentes` : null, i.telaPropria ? 'abre em tela cheia' : null].filter(Boolean).join(', ');

/**
 * Menu lateral do painel (D-35): só itens diretos, em seções curtas, sem submenus. As páginas irmãs de cada área ficam
 * nas abas do topo da página. No computador a coluna pode ser recolhida a uma faixa de ícones (lembrada num cookie, para
 * o servidor já desenhar certo); logo e rodapé ficam fixos e só a lista rola. No celular, a mesma lista numa gaveta.
 */
export function Navegacao({ menu, logo, monograma, usuario, sair, recolhidoInicial }: {
  menu: SecaoMenu[]; logo: ReactNode; monograma: string; usuario: { nome: string; papel: string }; sair: () => Promise<void>; recolhidoInicial: boolean;
}) {
  const caminho = usePathname();
  const [recolhido, setRecolhido] = useState(recolhidoInicial);
  // A gaveta fica aberta só na página em que foi aberta: tocar num item fecha sozinho.
  const [gavetaEm, setGavetaEm] = useState<string | null>(null);
  const gaveta = gavetaEm === caminho;
  const fecharGaveta = useRef<HTMLButtonElement>(null);
  const abrirGaveta = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!gaveta) return;
    const botao = abrirGaveta.current;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setGavetaEm(null);
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    fecharGaveta.current?.focus();
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = ''; botao?.focus(); };
  }, [gaveta]);

  useEffect(() => { lista.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' }); }, [caminho]);

  const alternarRecolhido = () => {
    const novo = !recolhido;
    setRecolhido(novo);
    lembrarRecolhido(novo);
  };

  const atual = areaAtiva(menu, caminho);
  const iniciais = usuario.nome.trim()[0]?.toUpperCase() ?? '?';

  const arvore = (faixa: boolean) => (
    <div className="grid gap-1">
      {menu.map((s, n) => (
        <section key={s.titulo ?? n} aria-label={s.titulo} className="grid gap-0.5">
          {s.titulo && (faixa
            ? <div aria-hidden="true" className="mx-3 my-2 border-t border-creme/10" />
            : <h2 className="px-3 pt-4 pb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-areia/60">{s.titulo}</h2>)}
          <ul className="grid gap-0.5">
            {s.itens.map(i => <li key={i.href}><Item item={i} ativo={atual?.href === i.href} faixa={faixa} /></li>)}
          </ul>
        </section>
      ))}
    </div>
  );

  const rodape = (faixa: boolean) => (
    <div className={`border-t border-creme/10 p-3 ${faixa ? 'grid gap-1 justify-items-center' : ''}`}>
      <div className={`flex items-center gap-3 ${faixa ? 'justify-center' : 'px-1'}`}>
        <span title={faixa ? `${usuario.nome} · ${usuario.papel}` : undefined} className="size-9 shrink-0 grid place-items-center rounded-full bg-caramelo text-creme text-sm font-bold">{iniciais}</span>
        {!faixa && <div className="min-w-0 flex-1"><div className="text-sm text-creme font-semibold truncate">{usuario.nome}</div><div className="text-xs text-areia/80">{usuario.papel}</div></div>}
        {!faixa && <AcoesConta sair={sair} />}
      </div>
      {faixa && <AcoesConta sair={sair} coluna />}
    </div>
  );

  return (
    <>
      {/* Computador: coluna. A largura sai do estado para o servidor desenhar igual, sem piscar. */}
      <aside data-recolhido={recolhido || undefined} className={`hidden lg:flex flex-col sticky top-0 h-dvh shrink-0 bg-marrom-950 text-creme transition-[width] duration-200 motion-reduce:transition-none ${recolhido ? 'w-[76px]' : 'w-[256px]'}`}>
        <div className={`flex items-center h-[72px] shrink-0 ${recolhido ? 'justify-center' : 'justify-between pl-5 pr-3'}`}>
          <Link href="/painel" aria-label="Início do painel" className={`rounded-lg ${FOCO}`}>
            {recolhido ? <span aria-hidden="true" className="titulo text-2xl text-creme">{monograma}</span> : logo}
          </Link>
          {!recolhido && (
            <button type="button" onClick={alternarRecolhido} aria-label="Recolher o menu" title="Recolher o menu" className={`size-8 grid place-items-center rounded-lg text-areia hover:text-creme hover:bg-creme/[.07] ${FOCO}`}>
              <IconeSeta className="size-4 rotate-180" />
            </button>
          )}
        </div>
        <nav ref={lista} aria-label="Painel" className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden sem-barra pb-3 px-3">
          {recolhido && (
            <button type="button" onClick={alternarRecolhido} aria-label="Expandir o menu" title="Expandir o menu" className={`${LINHA} w-full h-9 mb-1 justify-center ${CALMO}`}>
              <IconeSeta className="size-4" />
            </button>
          )}
          {arvore(recolhido)}
        </nav>
        {rodape(recolhido)}
      </aside>

      {/* Celular: uma linha só, para sobrar tela. */}
      <header className="lg:hidden bg-marrom-950 text-creme flex items-center justify-between gap-3 px-4 h-16">
        <Link href="/painel" aria-label="Início do painel" className={`shrink-0 rounded-lg ${FOCO}`}>{logo}</Link>
        {atual && <span className="flex-1 min-w-0 text-sm text-areia truncate text-center">{atual.rotulo}</span>}
        <button ref={abrirGaveta} type="button" onClick={() => setGavetaEm(caminho)} aria-expanded={gaveta} className={`h-10 px-4 shrink-0 rounded-full bg-creme/10 text-sm font-semibold flex items-center gap-2 ${FOCO}`}>
          <IconeMenu className="size-4" /> Menu
        </button>
      </header>
      {gaveta && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu do painel">
          <button type="button" tabIndex={-1} aria-label="Fechar o menu" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setGavetaEm(null)} />
          <div className="relative h-dvh w-[min(85vw,320px)] bg-marrom-950 text-creme flex flex-col shadow-2xl rounded-r-3xl animate-[aparecer_.2s_ease-out] motion-reduce:animate-none">
            <div className="flex items-center justify-between h-16 shrink-0 pl-4 pr-2">
              {logo}
              <button ref={fecharGaveta} type="button" onClick={() => setGavetaEm(null)} className={`size-10 grid place-items-center rounded-full text-areia hover:bg-creme/10 ${FOCO}`} aria-label="Fechar"><IconeFechar className="size-5" /></button>
            </div>
            <nav aria-label="Painel" className="flex-1 min-h-0 overflow-y-auto sem-barra px-3 pb-3">{arvore(false)}</nav>
            {rodape(false)}
          </div>
        </div>
      )}
    </>
  );
}

function AcoesConta({ sair, coluna }: { sair: () => Promise<void>; coluna?: boolean }) {
  const classe = `size-9 grid place-items-center rounded-lg text-areia hover:text-creme hover:bg-creme/[.07] transition-colors ${FOCO}`;
  return (
    <div className={`flex shrink-0 ${coluna ? 'flex-col items-center gap-0.5' : 'items-center'}`}>
      <Link href="/" aria-label="Ver loja" title="Ver loja" className={classe}><IconeLoja className="size-[1.1rem]" /></Link>
      <form action={sair}><button aria-label="Sair" title="Sair" className={classe}><IconeSair className="size-[1.1rem]" /></button></form>
    </div>
  );
}

function Item({ item, ativo, faixa }: { item: ItemMenu; ativo: boolean; faixa: boolean }) {
  return (
    <Link href={item.href} aria-current={ativo ? 'page' : undefined} title={faixa ? item.rotulo : undefined} aria-label={nomeAcessivel(item)}
      className={`${LINHA} h-11 text-sm ${faixa ? 'justify-center' : 'px-3 justify-between'} ${ativo ? ATIVO : CALMO}`}>
      {ativo && <span aria-hidden="true" className={MARCA} />}
      {faixa
        ? <span className="relative grid place-items-center size-6"><Icone chave={item.icone} />{!!item.contador && <Selo n={item.contador} sobreIcone />}</span>
        : <>
            <span className="flex items-center gap-3 min-w-0"><Icone chave={item.icone} /><span className="truncate">{item.rotulo}</span></span>
            {item.contador ? <Selo n={item.contador} /> : item.telaPropria ? <IconeExterno className="size-3.5 opacity-50 shrink-0" /> : null}
          </>}
    </Link>
  );
}

/**
 * Abas no topo das páginas de uma área (D-35): Pedidos | Vendas do mês, Clientes | Interesse… Trocam entre as páginas
 * irmãs sem voltar ao menu. Só na página principal de cada aba, não nas fichas e detalhes.
 */
export function AbasDaPagina({ menu }: { menu: SecaoMenu[] }) {
  const caminho = usePathname();
  const r = abasDaPagina(menu, caminho);
  if (!r) return null;
  return (
    <nav aria-label={`Páginas de ${r.area.rotulo}`} className="mb-6 flex gap-1 p-1 rounded-full bg-card border border-borda w-fit max-w-full overflow-x-auto sem-barra">
      {r.abas.map(a => {
        const ativa = a.href === r.ativa;
        return (
          <Link key={a.href} href={a.href} aria-current={ativa ? 'page' : undefined}
            className={`shrink-0 px-4 h-9 inline-flex items-center gap-2 rounded-full text-sm font-semibold transition-colors ${ativa ? 'bg-marrom-950 text-creme' : 'text-suave hover:text-marrom-950 hover:bg-creme'}`}>
            {a.rotulo}{!!a.contador && <span className={`h-5 px-1.5 min-w-5 grid place-items-center rounded-full text-[0.62rem] font-bold ${ativa ? 'bg-creme text-marrom-950' : 'bg-caramelo text-creme'}`}>{a.contador}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
