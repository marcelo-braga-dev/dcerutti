import Link from 'next/link';
import { LinhaFiltro, PainelFiltros } from '@/components/painel/filtros';
import { CabecalhoPagina, Cartao, Kpi, Vazio } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { tempoDesde } from '@/lib/atividade';
import { formatarData, formatarDataHora, TZ } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { ACOES, duracao, ehAcao, type Acao, type Grupo } from '@/lib/equipe';
import { comFiltros } from '@/lib/url';
import { exigirPapel } from '@/server/permissoes';
import { acompanhamentoDaEquipe, historicoDaEquipe, listarVendedores, PERIODOS_EQUIPE, type PeriodoEquipe } from '@/server/consultas/equipe';

export const metadata = { title: 'Equipe' };

type Busca = { periodo?: string; ordem?: string; pessoa?: string; acao?: string; pagina?: string };

const ORDENS = { vendido: 'Mais vendido', tempo: 'Mais tempo de uso', acoes: 'Mais ações', acesso: 'Acesso mais recente', nome: 'Nome' } as const;
type Ordem = keyof typeof ORDENS;

/** Cor da etiqueta de cada grupo de ação. */
const COR_GRUPO: Record<Grupo, string> = {
  acesso: 'bg-bege text-marrom-900', clientes: 'bg-caramelo/15 text-caramelo', pedidos: 'bg-marrom-950/10 text-marrom-950',
  contatos: 'bg-whatsapp/15 text-whatsapp', vendas: 'bg-oliva/15 text-oliva',
};

/**
 * Acompanhamento da equipe (D-26), só o gestor: presença e trabalho de cada vendedor no período (tabela) e o histórico
 * de ações de toda a equipe, com filtros. Os filtros ficam no endereço.
 */
export default async function Equipe({ searchParams }: { searchParams: Promise<Busca> }) {
  const u = await exigirPapel(['gestor']);
  const sp = await searchParams;
  const periodo: PeriodoEquipe = sp.periodo && sp.periodo in PERIODOS_EQUIPE ? (sp.periodo as PeriodoEquipe) : '7d';
  const ordem: Ordem = sp.ordem && sp.ordem in ORDENS ? (sp.ordem as Ordem) : 'vendido';
  const acao: Acao | null = ehAcao(sp.acao) ? sp.acao : null;
  const pagina = Math.min(20, Math.max(1, Number(sp.pagina) || 1));
  const [{ dias, linhas }, pessoas] = await Promise.all([acompanhamentoDaEquipe(u, periodo), listarVendedores(u)]);
  const pessoa = sp.pessoa && (pessoas.some(p => p.id === sp.pessoa) || sp.pessoa === u.id) ? sp.pessoa : null;
  const { acoes, total } = await historicoDaEquipe(u, { usuarioId: pessoa, tipo: acao, periodo, pagina });

  const atual = { periodo: periodo === '7d' ? null : periodo, ordem: ordem === 'vendido' ? null : ordem, pessoa, acao };
  const url = (mudar: Record<string, string | null>) => comFiltros('/painel/equipe', atual, mudar);

  const nAcoes = (l: (typeof linhas)[number]) => l.resumo.clientes + l.resumo.pedidos + l.resumo.contatos + l.resumo.vendasConfirmadas + l.resumo.cancelamentos;
  const ordenadas = [...linhas].sort((a, b) =>
    ordem === 'nome' ? a.name.localeCompare(b.name, 'pt-BR')
    : ordem === 'tempo' ? b.resumo.segundos - a.resumo.segundos
    : ordem === 'acoes' ? nAcoes(b) - nAcoes(a)
    : ordem === 'acesso' ? (b.ultimoAcessoEm?.getTime() ?? 0) - (a.ultimoAcessoEm?.getTime() ?? 0)
    : b.vendido - a.vendido);
  const max = {
    segundos: Math.max(1, ...linhas.map(l => l.resumo.segundos)), clientes: Math.max(1, ...linhas.map(l => l.resumo.clientes)),
    pedidos: Math.max(1, ...linhas.map(l => l.resumo.pedidos)), contatos: Math.max(1, ...linhas.map(l => l.resumo.contatos)),
    vendido: Math.max(1, ...linhas.map(l => l.vendido)), dia: Math.max(1, ...linhas.flatMap(l => [...l.resumo.porDia.values()])),
  };
  const onlineAgora = linhas.filter(l => l.online).length;
  const tempoTotal = linhas.reduce((a, l) => a + l.resumo.segundos, 0);
  const vendidoTotal = linhas.reduce((a, l) => a + l.vendido, 0);

  // Histórico agrupado por dia, na ordem em que chegou.
  const porDia = new Map<string, typeof acoes>();
  for (const a of acoes) {
    const d = a.criadoEm.toLocaleDateString('sv-SE', { timeZone: TZ });
    porDia.set(d, [...(porDia.get(d) ?? []), a]);
  }

  return (
    <>
      <CabecalhoPagina sobre="Acompanhamento" titulo="Equipe">
        Quem está usando o painel, por quanto tempo e o que cada um fez. Clique no nome para ver o perfil.
      </CabecalhoPagina>

      <PainelFiltros>
        <LinhaFiltro rotulo="Período" opcoes={(Object.keys(PERIODOS_EQUIPE) as PeriodoEquipe[]).map(k => ({ rotulo: PERIODOS_EQUIPE[k], href: url({ periodo: k === '7d' ? null : k }), ativo: periodo === k }))} />
        <LinhaFiltro rotulo="Ordenar por" opcoes={(Object.keys(ORDENS) as Ordem[]).map(k => ({ rotulo: ORDENS[k], href: url({ ordem: k === 'vendido' ? null : k }), ativo: ordem === k }))} />
      </PainelFiltros>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi rotulo="Online agora" valor={`${onlineAgora} de ${linhas.length}`} detalhe="Com o painel ou o caixa aberto" tom={onlineAgora ? 'oliva' : 'claro'} />
        <Kpi rotulo="Tempo de uso" valor={duracao(tempoTotal)} detalhe={`${PERIODOS_EQUIPE[periodo].toLowerCase()}, somando a equipe`} />
        <Kpi rotulo="Ações registradas" valor={linhas.reduce((a, l) => a + nAcoes(l), 0)} detalhe="Clientes, pedidos, envios e vendas" />
        <Kpi rotulo="Vendido" valor={brl(vendidoTotal)} detalhe={PERIODOS_EQUIPE[periodo]} tom="escuro" />
      </div>

      <Cartao className="mt-6 overflow-x-auto">
        <table className="w-full text-sm min-w-[980px]">
          <thead className="text-left rotulo !text-[0.6rem] text-suave border-b border-borda">
            <tr>
              <th className="p-4 min-w-52">Vendedor</th>
              <th className="p-4 min-w-40">Uso no período</th>
              <th className="p-4">{dias.length > 1 ? 'Por dia' : ''}</th>
              <th className="p-4 text-right">Clientes novas</th>
              <th className="p-4 text-right">Pedidos montados</th>
              <th className="p-4 text-right">Envios e contatos</th>
              <th className="p-4 text-right">Vendas</th>
              <th className="p-4 text-right">Cancelados</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {ordenadas.map(l => {
              const on = l.online;
              const r = l.resumo;
              return (
                <tr key={l.id} className="align-middle">
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <span className={`size-2.5 rounded-full shrink-0 ${on ? 'bg-oliva shadow-[0_0_0_3px] shadow-oliva/20' : 'bg-borda-forte'}`} title={on ? 'Online agora' : 'Offline'} />
                      <Link href={`/painel/vendedores/${l.id}`} className="font-semibold text-marrom-950 hover:underline">{l.name}</Link>
                    </div>
                    <div className="text-xs text-suave mt-0.5 pl-4.5" title={l.ultimoAcessoEm ? formatarDataHora(l.ultimoAcessoEm) : undefined}>
                      {on ? 'Online agora' : l.ultimoAcessoEm ? `Visto ${tempoDesde(l.ultimoAcessoEm)}` : 'Sem acesso registrado'}
                      {l.ultimoLoginEm && ` · login ${formatarData(l.ultimoLoginEm)}`}
                    </div>
                  </td>
                  <td className="p-4">
                    <Medida valor={r.segundos} max={max.segundos}><strong>{duracao(r.segundos)}</strong></Medida>
                    <div className="text-xs text-suave mt-1">{r.diasAtivos} de {dias.length} {dias.length === 1 ? 'dia' : 'dias'} · {r.logins} {r.logins === 1 ? 'login' : 'logins'}</div>
                  </td>
                  <td className="p-4">
                    {dias.length > 1 && (
                      <div className="flex items-end gap-px h-8" aria-label="Tempo de uso por dia">
                        {dias.map(d => {
                          const s = r.porDia.get(d);
                          return <span key={d} title={`${formatarData(`${d}T12:00:00-03:00`)}: ${s == null ? 'sem uso' : duracao(s)}`}
                            className={`flex-1 min-w-[3px] max-w-3 ${s == null ? 'bg-borda h-[2px]' : 'bg-caramelo'}`} style={s == null ? undefined : { height: `${Math.max(12, (s / max.dia) * 100)}%` }} />;
                        })}
                      </div>
                    )}
                  </td>
                  <td className="p-4 text-right"><Medida valor={r.clientes} max={max.clientes} direita><Numero n={r.clientes} href={url({ pessoa: l.id, acao: 'cliente_cadastrado' }) + '#historico'} /></Medida><div className="text-xs text-suave mt-1">{l.carteira} na carteira</div></td>
                  <td className="p-4 text-right"><Medida valor={r.pedidos} max={max.pedidos} direita><Numero n={r.pedidos} href={url({ pessoa: l.id, acao: 'pedido_criado' }) + '#historico'} /></Medida></td>
                  <td className="p-4 text-right"><Medida valor={r.contatos} max={max.contatos} direita><Numero n={r.contatos} href={url({ pessoa: l.id, acao: null }) + '#historico'} /></Medida></td>
                  <td className="p-4 text-right">
                    <Medida valor={l.vendido} max={max.vendido} direita><strong className="font-display">{brl(l.vendido)}</strong></Medida>
                    <div className="text-xs text-suave mt-1"><Link href={`/painel/vendas?vendedor=${l.id}`} className="hover:underline">{l.vendas} {l.vendas === 1 ? 'venda' : 'vendas'}</Link></div>
                  </td>
                  <td className={`p-4 text-right ${r.cancelamentos ? 'text-vermelho' : 'text-suave'}`}>{r.cancelamentos || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {linhas.length === 0 && <div className="p-6"><Vazio>Nenhum vendedor ativo.</Vazio></div>}
      </Cartao>
      <p className="mt-2 text-xs text-suave">
        Uso: tempo com o painel ou o caixa aberto e visível na tela (aba escondida não conta). Vendas: o que foi creditado ao vendedor no período, como nas metas.
        Envios e contatos: seleções enviadas, cupons, convites e conversas abertas no WhatsApp pelo painel.
      </p>

      <section id="historico" className="mt-10 scroll-mt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
          <h2 className="titulo text-xl">Histórico de ações</h2>
          <span className="text-sm text-suave">{total} {total === 1 ? 'ação' : 'ações'} · {PERIODOS_EQUIPE[periodo].toLowerCase()}</span>
        </div>
        <PainelFiltros limpar={pessoa || acao ? url({ pessoa: null, acao: null }) + '#historico' : null}>
          <LinhaFiltro rotulo="Pessoa" opcoes={[
            { rotulo: 'Toda a equipe', href: url({ pessoa: null }) + '#historico', ativo: !pessoa },
            { rotulo: `${u.name.split(' ')[0]} (você)`, href: url({ pessoa: u.id }) + '#historico', ativo: pessoa === u.id },
            ...pessoas.map(p => ({ rotulo: p.name.split(' ')[0] + (p.ativo ? '' : ' (inativo)'), href: url({ pessoa: p.id }) + '#historico', ativo: pessoa === p.id })),
          ]} />
          <LinhaFiltro rotulo="Ação" opcoes={[
            { rotulo: 'Todas as ações', href: url({ acao: null }) + '#historico', ativo: !acao },
            ...(Object.keys(ACOES) as Acao[]).map(k => ({ rotulo: ACOES[k].rotulo, href: url({ acao: k }) + '#historico', ativo: acao === k })),
          ]} />
        </PainelFiltros>

        {acoes.length === 0 ? <Vazio>Nenhuma ação com esses filtros no período.</Vazio> : (
          <div className="grid gap-5">
            {[...porDia.entries()].map(([d, lista]) => (
              <div key={d}>
                <div className="rotulo !text-[0.62rem] text-suave mb-2">{formatarData(`${d}T12:00:00-03:00`)}</div>
                <Cartao className="divide-y divide-borda">
                  {lista.map(a => {
                    const info = ACOES[a.tipo as Acao];
                    return (
                      <div key={String(a.id)} className="grid grid-cols-[3.5rem_minmax(0,1fr)] sm:grid-cols-[3.5rem_9rem_10.5rem_minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-4 py-2.5 items-center text-sm">
                        <span className="text-suave tabular-nums">{a.criadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ })}</span>
                        <Link href={url({ pessoa: a.usuario.id }) + '#historico'} className="font-semibold text-marrom-950 hover:underline truncate">{a.usuario.name.split(' ')[0]}{a.usuario.papel === 'gestor' ? ' · gestor' : ''}</Link>
                        <span className={`justify-self-start col-start-2 sm:col-start-auto px-2 py-0.5 text-xs font-semibold ${COR_GRUPO[info.grupo]}`}>{info.rotulo}</span>
                        <span className="min-w-0 col-start-2 sm:col-start-auto text-marrom-900 truncate">
                          {a.clienteId ? <Link href={`/painel/clientes/${a.clienteId}`} className="hover:underline">{a.descricao ?? 'Ver cliente'}</Link> : a.descricao}
                          {a.pedidoId && <> · <Link href={`/painel/pedidos/${a.pedidoId}`} className="underline underline-offset-2 text-suave">pedido</Link></>}
                          {a.aparelho && a.tipo === 'login' && <span className="text-suave">no {a.aparelho}</span>}
                        </span>
                        <span className="col-start-2 sm:col-start-auto sm:text-right font-display font-bold whitespace-nowrap">{a.valor != null ? brl(a.valor) : ''}</span>
                      </div>
                    );
                  })}
                </Cartao>
              </div>
            ))}
          </div>
        )}
        {total > acoes.length && (
          <div className="mt-6 text-center">
            <p className="text-sm text-suave mb-3">Mostrando {acoes.length} de {total}</p>
            <Link href={url({ pagina: String(pagina + 1) }) + '#historico'} scroll={false} className={botao('secundario')}>Carregar mais</Link>
          </div>
        )}
      </section>
    </>
  );
}

/** Número com uma barra de fundo do tamanho dele em relação ao maior da coluna: dá para comparar de relance. */
function Medida({ valor, max, direita, children }: { valor: number; max: number; direita?: boolean; children: React.ReactNode }) {
  const pct = valor > 0 ? Math.max(6, (valor / max) * 100) : 0;
  return (
    <div className={`relative inline-flex min-w-24 ${direita ? 'justify-end' : ''}`}>
      <span aria-hidden="true" className={`absolute inset-y-0 ${direita ? 'right-0' : 'left-0'} bg-caramelo/12`} style={{ width: `${pct}%` }} />
      <span className="relative px-2 py-1">{children}</span>
    </div>
  );
}

function Numero({ n, href }: { n: number; href: string }) {
  return n ? <Link href={href} className="font-display font-bold hover:underline">{n}</Link> : <span className="text-suave">—</span>;
}
