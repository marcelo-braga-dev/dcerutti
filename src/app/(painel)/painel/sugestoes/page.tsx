import Link from 'next/link';
import { BotaoEnviarSugestao, BotaoLembrar } from '@/components/painel/botoes-sugestao';
import { FunilSugestoes } from '@/components/painel/funil-sugestoes';
import { LinhaFiltro, PainelFiltros } from '@/components/painel/filtros';
import { CabecalhoPagina, Cartao, Etiqueta, Vazio } from '@/components/ui/basicos';
import { BotaoLink, botao } from '@/components/ui/botao';
import { tempoDesde } from '@/lib/atividade';
import { formatarData } from '@/lib/datas';
import { ATENCAO, mensagemDaSugestao, mensagemLembrete, SITUACOES, type Situacao } from '@/lib/sugestoes';
import { comFiltros } from '@/lib/url';
import { linkWhatsApp } from '@/lib/whatsapp';
import { listarVendedores } from '@/server/consultas/equipe';
import { linkDaSugestao } from '@/server/link-pedido';
import { marcaAtual } from '@/server/marca';
import { EQUIPE, exigirPapel } from '@/server/permissoes';
import { urlDoSite } from '@/server/site';
import { conversaoRecente, listarSugestoes } from '@/server/sugestoes';

export const metadata = { title: 'Sugestões enviadas' };

const ORDEM: Situacao[] = ['aEnviar', 'enviada', 'vista', 'respondida', 'convertida', 'vencida', 'cancelada'];

/**
 * Sugestões enviadas (D-27): o que precisa de atenção agora (para enviar, sem abrir, viu e não respondeu, pensando,
 * vencendo), com a ação de cada um, os filtros e o funil de conversão.
 */
export default async function Sugestoes({ searchParams }: { searchParams: Promise<{ vendedor?: string; situacao?: string; q?: string; pagina?: string }> }) {
  const u = await exigirPapel(EQUIPE);
  const gestor = u.papel === 'gestor';
  const sp = await searchParams;
  const pagina = Math.min(20, Math.max(1, Number(sp.pagina) || 1));
  const vendedores = gestor ? await listarVendedores(u) : [];
  const vendedor = vendedores.find(v => v.id === sp.vendedor)?.id ?? null;
  const situacao = sp.situacao === 'atencao' || ORDEM.includes(sp.situacao as Situacao) ? (sp.situacao as Situacao | 'atencao') : null;
  const q = (sp.q ?? '').trim().slice(0, 60) || null;
  const [{ lista, total, contagem, atencao, totalAtencao }, conversao, site, loja] = await Promise.all([
    listarSugestoes(u, { vendedor, situacao, q, pagina }), conversaoRecente(u, 30), urlDoSite(), marcaAtual(),
  ]);
  const atual = { vendedor, situacao, q };
  const url = (m: Record<string, string | null>) => comFiltros('/painel/sugestoes', atual, m);
  const algum = !!(vendedor || situacao || q);

  // Mensagem de cada ação: enviar (Para enviar) ou lembrar (enviado e parado).
  const acao = (s: (typeof atencao)[number]) => {
    const link = linkDaSugestao(site, s.codigo);
    if (s.situacao === 'aEnviar')
      return <BotaoEnviarSugestao id={s.id} enviada={false} tamanho="p" url={linkWhatsApp(s.cliente.telefone, mensagemDaSugestao({ nomeCliente: s.cliente.nome, nomeVendedor: s.vendedor.name, loja: loja.nome, titulo: s.titulo, mensagem: s.mensagem, link, pecas: s.itens.length, validaAte: s.validaAte, temOferta: false, cupom: s.cupomCodigo }))} />;
    return <BotaoLembrar id={s.id} tamanho="p" lembretes={s.lembretes} url={linkWhatsApp(s.cliente.telefone, mensagemLembrete({ nomeCliente: s.cliente.nome, nomeVendedor: s.vendedor.name, situacao: s.situacao, link, validaAte: s.validaAte, temOferta: false }))} />;
  };

  return (
    <>
      <CabecalhoPagina sobre="Vendas · sugestões" titulo="Sugestões enviadas" acoes={<BotaoLink href="/painel/sugestoes/nova">+ Montar sugestão</BotaoLink>}>
        Monte uma sugestão de peças para a cliente e envie pelo WhatsApp. Ela abre o link, marca o que quer, escolhe cor e tamanho e devolve como pedido.
      </CabecalhoPagina>

      {!algum && atencao.length > 0 && (
        <Cartao className="mb-6 divide-y divide-borda border-caramelo/50">
          <div className="px-5 py-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="titulo text-lg">Precisa de atenção <span className="text-caramelo">{totalAtencao}</span></h2>
            {totalAtencao > atencao.length && <Link href={url({ situacao: 'atencao' })} className="rotulo !text-[0.62rem] underline underline-offset-4">Ver todos</Link>}
          </div>
          {atencao.map(s => (
            <div key={s.id} className="grid sm:grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 px-5 py-3 items-center text-sm">
              <div className="min-w-0">
                <Link href={`/painel/sugestoes/${s.id}`} className="font-semibold text-marrom-950 hover:underline">{s.cliente.nome}</Link>
                <span className="text-suave"> · {s.titulo}</span>
                <div className="text-xs text-caramelo">{ATENCAO[s.atencao!]}{s.lembretes ? ` · já lembrada ${s.lembretes}×` : ''}</div>
              </div>
              <div className="flex gap-2">{acao(s)}</div>
            </div>
          ))}
        </Cartao>
      )}

      {conversao.total.enviados > 0 && !algum && <div className="mb-6"><FunilSugestoes c={conversao} periodo="últimos 30 dias" porVendedor={gestor} /></div>}

      <form className="flex mb-3 max-w-lg">
        {vendedor && <input type="hidden" name="vendedor" value={vendedor} />}
        {situacao && <input type="hidden" name="situacao" value={situacao} />}
        <input name="q" defaultValue={q ?? ''} placeholder="Cliente, título ou código (SUG-…)" aria-label="Buscar sugestão" className="flex-1 min-w-0 h-11 px-3 border border-borda-forte bg-card outline-none focus:border-marrom-950" />
        <button className="h-11 px-4 bg-marrom-950 text-creme rotulo">Buscar</button>
      </form>
      <PainelFiltros limpar={algum ? '/painel/sugestoes' : null}>
        <LinhaFiltro rotulo="Situação" opcoes={[
          { rotulo: 'Todas', href: url({ situacao: null }), ativo: !situacao },
          { rotulo: 'Precisa de atenção', href: url({ situacao: 'atencao' }), ativo: situacao === 'atencao', n: totalAtencao },
          ...ORDEM.map(k => ({ rotulo: SITUACOES[k].rotulo, href: url({ situacao: k }), ativo: situacao === k, n: contagem.get(k) ?? 0 })),
        ]} />
        {gestor && <LinhaFiltro rotulo="Vendedor" opcoes={[{ rotulo: 'Todos', href: url({ vendedor: null }), ativo: !vendedor }, ...vendedores.filter(v => v.ativo).map(v => ({ rotulo: v.name.split(' ')[0], href: url({ vendedor: v.id }), ativo: vendedor === v.id }))]} />}
      </PainelFiltros>

      {lista.length === 0 ? <Vazio>{algum ? 'Nenhuma sugestão com esses filtros.' : <>Nenhuma sugestão ainda. <Link href="/painel/sugestoes/nova" className="underline">Monte a primeira</Link>.</>}</Vazio> : (
        <Cartao className="divide-y divide-borda">
          {lista.map(s => {
            const conta = (e: string) => s.itens.filter(i => i.escolha === e).length;
            return (
              <Link key={s.id} href={`/painel/sugestoes/${s.id}`} className="grid sm:grid-cols-[8rem_minmax(0,1fr)_auto] gap-x-4 gap-y-1 px-5 py-3.5 hover:bg-bege/40 items-center text-sm">
                <div><span className="font-display font-bold">{s.codigo}</span><div className="text-xs text-suave">{formatarData(s.criadaEm)}</div></div>
                <div className="min-w-0">
                  <div className="font-semibold text-marrom-950 truncate">{s.cliente.nome} <span className="font-normal text-suave">· {s.titulo}</span></div>
                  <div className="text-xs text-suave">
                    {s.itens.length} {s.itens.length === 1 ? 'peça' : 'peças'}
                    {s.vistaEm ? ` · vista ${tempoDesde(s.vistaEm)} (${s.vezesVista}×)` : s.enviadaEm ? ' · ainda não abriu' : ' · não enviada'}
                    {conta('quero') + conta('talvez') + conta('nao') > 0 && ` · quer ${conta('quero')}, talvez ${conta('talvez')}, não ${conta('nao')}`}
                    {s.lembretes > 0 && ` · lembrada ${s.lembretes}×`}
                    {gestor && ` · ${s.vendedor.name.split(' ')[0]}`}
                  </div>
                  {s.atencao && <div className="text-xs text-caramelo">{ATENCAO[s.atencao]}</div>}
                </div>
                <div className="flex items-center gap-3 sm:justify-end">
                  <Etiqueta cor={SITUACOES[s.situacao].cor}>{SITUACOES[s.situacao].rotulo}</Etiqueta>
                  <span className="text-xs text-suave whitespace-nowrap">{s.situacao === 'vencida' || s.situacao === 'convertida' || s.situacao === 'cancelada' ? '' : `até ${formatarData(s.validaAte)}`}</span>
                </div>
              </Link>
            );
          })}
        </Cartao>
      )}
      {total > lista.length && (
        <div className="mt-6 text-center"><Link href={url({ pagina: String(pagina + 1) })} scroll={false} className={botao('secundario')}>Carregar mais ({total - lista.length})</Link></div>
      )}
    </>
  );
}
