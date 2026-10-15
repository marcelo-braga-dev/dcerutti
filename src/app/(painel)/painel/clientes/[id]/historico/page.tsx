import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { StatusPedido, TipoPedido } from '@prisma/client';
import { Foto } from '@/components/loja/foto';
import { CabecalhoPagina, Cartao, Vazio } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { EtiquetaStatus, EtiquetaTipo } from '@/components/ui/status-pedido';
import { descreverFiltros, duracaoEmPalavras, type FiltrosAtivos } from '@/lib/atividade';
import { formatarData, TZ } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { EQUIPE, exigirPapel } from '@/server/permissoes';
import { FILTROS_LINHA, linhaDoTempo, type FiltroLinha, type ItemLinhaDoTempo } from '@/server/consultas/navegacao';

export const metadata = { title: 'Histórico do cliente' };

const POR_PAGINA = 200;

const PAGINAS: Record<string, string> = {
  '/': 'Início', '/catalogo': 'Catálogo', '/sacola': 'Sacola', '/minha-conta': 'Minha conta',
  '/minha-conta/pedidos': 'Meus pedidos', '/minha-conta/cupons': 'Meus cupons', '/privacidade': 'Política de privacidade',
};
const nomeDaPagina = (c: string | null) => (c ? PAGINAS[c.split('?')[0]] ?? c : 'loja');
const hora = (d: Date) => d.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ filtro?: string; mais?: string }> };

export default async function HistoricoCliente({ params, searchParams }: Props) {
  const u = await exigirPapel(EQUIPE);
  const { id } = await params;
  const sp = await searchParams;
  const filtro = sp.filtro && sp.filtro in FILTROS_LINHA ? (sp.filtro as FiltroLinha) : undefined;
  const paginas = Math.min(10, Math.max(1, Number(sp.mais) || 1));
  const h = await linhaDoTempo(u, id, POR_PAGINA * paginas, filtro);
  if (!h) notFound();
  const url = (mudar: { filtro?: string | null; mais?: number }) => {
    const q = new URLSearchParams();
    const f = mudar.filtro === undefined ? filtro : mudar.filtro;
    if (f) q.set('filtro', f);
    if (mudar.mais && mudar.mais > 1) q.set('mais', String(mudar.mais));
    const s = q.toString();
    return `/painel/clientes/${id}/historico${s ? `?${s}` : ''}`;
  };

  return (
    <>
      <Link href={`/painel/clientes/${id}`} className="rotulo text-suave hover:text-marrom-950">← Ficha do cliente</Link>
      <div className="mt-4" />
      <CabecalhoPagina sobre="Histórico na loja" titulo={h.cliente.nome}>
        Páginas, peças, buscas, sacola e pedidos, do mais novo para o mais antigo. Guardado por 12 meses.
      </CabecalhoPagina>

      <div className="flex flex-wrap gap-2 mb-6" aria-label="Filtrar">
        <Link href={url({ filtro: null })} className={`px-3 py-2 rotulo border ${!filtro ? 'bg-marrom-950 text-creme border-marrom-950' : 'border-borda-forte bg-card'}`}>Tudo</Link>
        {(Object.entries(FILTROS_LINHA) as [FiltroLinha, { rotulo: string }][]).map(([k, f]) => (
          <Link key={k} href={url({ filtro: k })} className={`px-3 py-2 rotulo border ${filtro === k ? 'bg-marrom-950 text-creme border-marrom-950' : 'border-borda-forte bg-card'}`}>{f.rotulo}</Link>
        ))}
      </div>

      {h.visitas.length === 0 ? <Vazio>Nada registrado{filtro ? ' com este filtro' : ''}.</Vazio> : (
        <div className="grid gap-4 max-w-4xl">
          {h.visitas.map(v => {
            const tempo = v.eventos.reduce((a, i) => a + (i.tipo === 'atividade' ? i.evento.duracaoSeg ?? 0 : 0), 0);
            const aparelho = v.eventos.find((i): i is Extract<ItemLinhaDoTempo, { tipo: 'atividade' }> => i.tipo === 'atividade' && !!i.evento.aparelho)?.evento.aparelho;
            return (
              <Cartao key={v.eventos[0].id} className="p-4 sm:p-5">
                <div className="flex flex-wrap justify-between gap-2 mb-3 border-b border-borda pb-2">
                  <h2 className="font-semibold text-marrom-950">{formatarData(v.inicio)} · {hora(v.inicio)}{v.inicio.getTime() !== v.fim.getTime() ? ` – ${hora(v.fim)}` : ''}</h2>
                  <span className="text-sm text-suave">{[aparelho, tempo ? duracaoEmPalavras(tempo) : null, `${v.eventos.length} ${v.eventos.length === 1 ? 'registro' : 'registros'}`].filter(Boolean).join(' · ')}</span>
                </div>
                <ol className="grid gap-2">
                  {v.eventos.map(i => <Linha key={`${i.tipo}-${i.id}`} item={i} nomes={h.nomes} />)}
                </ol>
              </Cartao>
            );
          })}
        </div>
      )}

      {h.total > h.mostrando && (
        <div className="mt-6">
          <p className="text-sm text-suave mb-3">Mostrando {h.mostrando} de {h.total} registros</p>
          {paginas < 10 && <Link href={url({ mais: paginas + 1 })} scroll={false} className={botao('secundario')}>Carregar mais</Link>}
        </div>
      )}
    </>
  );
}

function Linha({ item: i, nomes }: { item: ItemLinhaDoTempo; nomes: { categorias: Map<string, string>; marcas: Map<string, string> } }) {
  if (i.tipo === 'pedido') {
    const p = i.pedido;
    return (
      <li className="flex flex-wrap items-center gap-2 text-sm bg-bege px-3 py-2">
        <span className="text-suave w-12 shrink-0">{hora(i.criadoEm)}</span>
        <Link href={`/painel/pedidos/${p.id}`} className="font-semibold text-marrom-950 hover:underline">{p.origem === 'loja' ? 'Enviou o pedido' : 'Pedido da equipe'} {p.codigo}</Link>
        <EtiquetaTipo tipo={p.tipo as TipoPedido} /><EtiquetaStatus status={p.status as StatusPedido} />
        <span className="ml-auto">{brl(p.total)}</span>
      </li>
    );
  }
  const e = i.evento;
  const p = i.produto;
  const dados = (e.dados ?? {}) as { filtros?: FiltrosAtivos; resultados?: number; delta?: number; ok?: boolean; erro?: string };
  const tempo = e.duracaoSeg ? <span className="text-suave"> · {duracaoEmPalavras(e.duracaoSeg)}</span> : null;
  const nomeProduto = p ? <Link href={`/produto/${p.referencia}`} target="_blank" className="text-marrom-950 hover:underline">{p.nome}</Link> : <span className="text-suave">produto removido</span>;
  const filtros = descreverFiltros(dados.filtros, nomes);

  const texto = (() => {
    switch (e.tipo) {
      case 'login': return <><strong className="text-marrom-950">Entrou com a senha</strong></>;
      case 'acesso': return <><strong className="text-marrom-950">Abriu a loja</strong> em {nomeDaPagina(e.caminho)}</>;
      case 'pagina': return <>Abriu {nomeDaPagina(e.caminho)}{tempo}</>;
      case 'produto': return <>Viu {nomeProduto}{p && <span className="text-suave"> · {brl(p.preco)}</span>}{tempo}</>;
      case 'busca': return <>Buscou <strong className="text-marrom-950">“{e.termo}”</strong>{dados.resultados != null && <span className={dados.resultados ? 'text-suave' : 'text-vermelho'}> · {dados.resultados ? `${dados.resultados} resultados` : 'nada encontrado'}</span>}{filtros && <span className="text-suave"> · {filtros}</span>}{tempo}</>;
      case 'filtro': return <>Filtrou o catálogo: {filtros}{tempo}</>;
      case 'tamanho': return <>Escolheu o tam. <strong className="text-marrom-950">{e.termo}</strong> de {nomeProduto}</>;
      case 'sacola': {
        const d = dados.delta ?? 0;
        return <>{d > 0 ? 'Pôs na sacola' : 'Tirou da sacola'} {Math.abs(d)}× {nomeProduto}{e.termo && <span className="text-suave"> · tam. {e.termo}</span>}</>;
      }
      case 'cupom': return <>Tentou o cupom <strong className="text-marrom-950">{e.termo}</strong>{dados.ok ? <span className="text-oliva"> · aceito</span> : <span className="text-suave"> · recusado{dados.erro ? `: ${dados.erro}` : ''}</span>}</>;
      case 'whatsapp': return <>Clicou no WhatsApp em {nomeDaPagina(e.caminho)}</>;
    }
  })();

  return (
    <li className="flex items-center gap-2 text-sm">
      <span className="text-suave w-12 shrink-0">{hora(i.criadoEm)}</span>
      {p && ['produto', 'tamanho', 'sacola'].includes(e.tipo) && <div className="relative w-7 aspect-[3/4] bg-bege shrink-0"><Foto src={p.imagem} alt="" sizes="28px" /></div>}
      <span className="min-w-0">{texto}</span>
    </li>
  );
}
