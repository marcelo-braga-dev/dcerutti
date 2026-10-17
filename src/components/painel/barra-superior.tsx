'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconeCaixaLoja, IconeLoja, IconeLupa, IconeMais, IconePessoa, IconeRecibo, IconeSino } from '@/components/ui/icones';
import { tempoDesde } from '@/lib/atividade';
import { TIPOS_NOTIFICACAO, type TipoNotificacao } from '@/lib/notificacoes';
import { marcarLidaAcao, resumoNotificacoesAcao } from '@/server/acoes/notificacoes';

type Notif = { id: string; tipo: TipoNotificacao; titulo: string; texto: string | null; link: string | null; lidaEm: Date | null; criadaEm: Date };
type Resumo = { naoLidas: number; ultimas: Notif[] };

/** Fecha o menu ao clicar fora ou apertar Esc. */
function useFora(aberto: boolean, fechar: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) fechar(); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && fechar();
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto, fechar]);
  return ref;
}

const botaoIcone = 'relative size-11 grid place-items-center text-marrom-950 hover:bg-bege';
function Selo({ n }: { n: number }) {
  if (!n) return null;
  return <span className="absolute top-1 right-1 min-w-4.5 h-4.5 px-1 rounded-full bg-caramelo text-creme text-[0.62rem] font-bold leading-[1.15rem] text-center">{n > 99 ? '99+' : n}</span>;
}

/**
 * Barra superior do painel (D-28): busca geral, "+ Novo", pedidos pendentes, caixa, notificações (sino com o número
 * de não lidas, consultado a cada minuto), a loja e o perfil. Os mesmos atalhos no celular e no computador.
 */
export function BarraSuperior({ resumoInicial, pendentes, nome, papel, sair }: { resumoInicial: Resumo; pendentes: number; nome: string; papel: string; sair: () => Promise<void> }) {
  const router = useRouter();
  const [resumo, setResumo] = useState(resumoInicial);
  const [aberto, setAberto] = useState<'novo' | 'sino' | 'perfil' | 'busca' | null>(null);
  const fechar = () => setAberto(null);
  const refNovo = useFora(aberto === 'novo', fechar), refSino = useFora(aberto === 'sino', fechar), refPerfil = useFora(aberto === 'perfil', fechar);

  // A cada minuto (e ao voltar para a aba): o número de não lidas e as últimas.
  useEffect(() => {
    let vivo = true;
    const buscar = () => resumoNotificacoesAcao().then(r => { if (vivo) setResumo(r as Resumo); }).catch(() => {});
    const t = setInterval(() => document.visibilityState === 'visible' && buscar(), 60_000);
    const aoVoltar = () => document.visibilityState === 'visible' && buscar();
    document.addEventListener('visibilitychange', aoVoltar);
    return () => { vivo = false; clearInterval(t); document.removeEventListener('visibilitychange', aoVoltar); };
  }, []);
  // O número de não lidas também no título da aba. O Next troca o título a cada página (e às vezes depois da
  // hidratação), por isso reaplica ao mudar de página e quando o <title> muda.
  const caminho = usePathname();
  useEffect(() => {
    const aplicar = () => {
      const base = document.title.replace(/^\(\d+\+?\) /, '');
      const novo = resumo.naoLidas ? `(${resumo.naoLidas > 99 ? '99+' : resumo.naoLidas}) ${base}` : base;
      if (document.title !== novo) document.title = novo;
    };
    aplicar();
    const t = setTimeout(aplicar, 300);
    const titulo = document.querySelector('title');
    const obs = titulo ? new MutationObserver(aplicar) : null;
    if (titulo) obs!.observe(titulo, { childList: true, characterData: true, subtree: true });
    return () => { clearTimeout(t); obs?.disconnect(); };
  }, [resumo.naoLidas, caminho]);

  const abrirNotificacao = async (n: Notif) => {
    fechar();
    if (!n.lidaEm) {
      setResumo(r => ({ naoLidas: Math.max(0, r.naoLidas - 1), ultimas: r.ultimas.map(x => (x.id === n.id ? { ...x, lidaEm: new Date() } : x)) }));
      marcarLidaAcao(n.id).catch(() => {});
    }
    if (n.link) router.push(n.link);
  };
  const lerTodas = () => {
    setResumo(r => ({ naoLidas: 0, ultimas: r.ultimas.map(x => ({ ...x, lidaEm: x.lidaEm ?? new Date() })) }));
    marcarLidaAcao().catch(() => {});
  };

  return (
    <div className="sticky top-0 z-30 -mx-4 sm:-mx-8 -mt-4 sm:-mt-8 mb-6 px-2 sm:px-6 h-14 bg-card/95 backdrop-blur border-b border-borda flex items-center gap-1">
      {/* Busca geral: clientes, pedidos e peças. */}
      <form action="/painel/busca" className={`${aberto === 'busca' ? 'flex' : 'hidden'} md:flex flex-1 max-w-md items-center gap-2 h-10 px-3 border border-borda-forte bg-creme focus-within:border-marrom-950 max-md:absolute max-md:inset-x-2 max-md:top-2 max-md:bg-card max-md:z-10`}>
        <IconeLupa className="size-4 text-suave shrink-0" />
        <input name="q" placeholder="Buscar cliente, pedido ou peça…" aria-label="Buscar" className="flex-1 min-w-0 bg-transparent outline-none text-sm" autoFocus={aberto === 'busca'} onBlur={() => aberto === 'busca' && setTimeout(fechar, 150)} />
      </form>
      <button type="button" onClick={() => setAberto('busca')} className={`${botaoIcone} md:hidden`} aria-label="Buscar"><IconeLupa /></button>

      <div className="ml-auto flex items-center gap-0.5">
        <Menu refDiv={refNovo} aberto={aberto === 'novo'} alternar={() => setAberto(a => (a === 'novo' ? null : 'novo'))} rotulo="Novo"
          gatilho={<span className="h-10 px-3 inline-flex items-center gap-1.5 bg-marrom-950 text-creme rotulo !text-[0.62rem]"><IconeMais className="size-4" /><span className="hidden sm:inline">Novo</span></span>}>
          {[['/painel/pedidos/novo', 'Novo pedido'], ['/painel/sugestoes/nova', 'Nova sugestão'], ['/painel/clientes/novo', 'Nova cliente'], ['/caixa', 'Venda no caixa']].map(([href, rotulo]) => (
            <Link key={href} href={href} onClick={fechar} className="block px-4 py-2.5 text-sm hover:bg-bege">{rotulo}</Link>
          ))}
        </Menu>

        <Link href="/painel/pedidos" className={botaoIcone} aria-label={`Pedidos pendentes: ${pendentes}`} title="Pedidos pendentes"><IconeRecibo /><Selo n={pendentes} /></Link>
        <Link href="/caixa" className={`${botaoIcone} max-sm:hidden`} aria-label="Caixa da loja" title="Caixa da loja"><IconeCaixaLoja /></Link>

        <Menu refDiv={refSino} aberto={aberto === 'sino'} alternar={() => setAberto(a => (a === 'sino' ? null : 'sino'))} rotulo={resumo.naoLidas ? `Notificações: ${resumo.naoLidas} ${resumo.naoLidas === 1 ? 'não lida' : 'não lidas'}` : 'Notificações'} largo
          gatilho={<span className={botaoIcone}><IconeSino /><Selo n={resumo.naoLidas} /></span>}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-borda">
            <span className="rotulo !text-[0.65rem]">Notificações</span>
            {resumo.naoLidas > 0 && <button type="button" onClick={lerTodas} className="text-xs text-caramelo underline underline-offset-2">Marcar todas como lidas</button>}
          </div>
          {resumo.ultimas.length === 0 ? <p className="px-4 py-6 text-sm text-suave text-center">Nenhuma notificação ainda.</p> : (
            <ul className="max-h-[60vh] overflow-y-auto divide-y divide-borda">
              {resumo.ultimas.map(n => (
                <li key={n.id}>
                  <button type="button" onClick={() => abrirNotificacao(n)} className={`w-full text-left px-4 py-3 grid gap-0.5 hover:bg-bege ${n.lidaEm ? '' : 'bg-caramelo/5'}`}>
                    <span className="flex items-start gap-2">
                      {!n.lidaEm && <span className="mt-1.5 size-2 rounded-full bg-caramelo shrink-0" aria-label="Não lida" />}
                      <span className={`text-sm leading-snug ${n.lidaEm ? 'text-marrom-900' : 'text-marrom-950 font-semibold'}`}>{n.titulo}</span>
                    </span>
                    {n.texto && <span className="text-xs text-suave pl-4">{n.texto}</span>}
                    <span className="text-[0.68rem] text-suave pl-4">{TIPOS_NOTIFICACAO[n.tipo].rotulo} · {tempoDesde(n.criadaEm)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link href="/painel/notificacoes" onClick={fechar} className="block px-4 py-3 border-t border-borda text-center text-sm rotulo !text-[0.62rem] hover:bg-bege">Ver todas e preferências</Link>
        </Menu>

        <Link href="/" className={`${botaoIcone} max-sm:hidden`} aria-label="Ver a loja" title="Ver a loja"><IconeLoja /></Link>

        <Menu refDiv={refPerfil} aberto={aberto === 'perfil'} alternar={() => setAberto(a => (a === 'perfil' ? null : 'perfil'))} rotulo="Perfil"
          gatilho={<span className={botaoIcone}><IconePessoa /></span>}>
          <div className="px-4 py-3 border-b border-borda"><div className="text-sm font-semibold text-marrom-950">{nome}</div><div className="rotulo !text-[0.6rem] text-suave">{papel}</div></div>
          <Link href="/painel/notificacoes" onClick={fechar} className="block px-4 py-2.5 text-sm hover:bg-bege">Notificações e preferências</Link>
          <Link href="/" onClick={fechar} className="block px-4 py-2.5 text-sm hover:bg-bege sm:hidden">Ver a loja</Link>
          <Link href="/caixa" onClick={fechar} className="block px-4 py-2.5 text-sm hover:bg-bege sm:hidden">Caixa da loja</Link>
          <form action={sair}><button className="w-full text-left px-4 py-2.5 text-sm text-vermelho hover:bg-bege">Sair</button></form>
        </Menu>
      </div>
    </div>
  );
}

function Menu({ refDiv, aberto, alternar, rotulo, gatilho, largo, children }: {
  refDiv: React.RefObject<HTMLDivElement | null>; aberto: boolean; alternar: () => void; rotulo: string; gatilho: ReactNode; largo?: boolean; children: ReactNode;
}) {
  return (
    <div ref={refDiv} className="relative">
      <button type="button" onClick={alternar} aria-expanded={aberto} aria-haspopup="true" aria-label={rotulo} title={rotulo}>{gatilho}</button>
      {aberto && (
        <div className={`absolute right-0 top-full mt-1 bg-card border border-borda shadow-2xl z-40 ${largo ? 'w-[min(92vw,380px)] max-sm:fixed max-sm:inset-x-2 max-sm:top-14 max-sm:w-auto' : 'w-56'}`}>{children}</div>
      )}
    </div>
  );
}
