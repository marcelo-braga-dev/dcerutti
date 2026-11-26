import Link from 'next/link';
import type { StatusPedido } from '@prisma/client';
import { Foto } from '@/components/loja/foto';
import { CabecalhoPagina, Vazio } from '@/components/ui/basicos';
import { BotaoLink, botao } from '@/components/ui/botao';
import { EtiquetaStatus, EtiquetaTipo } from '@/components/ui/status-pedido';
import { formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { EQUIPE, exigirPapel } from '@/server/permissoes';
import { listarPedidos } from '@/server/consultas/pedidos';
import { clienteDoFiltro } from '@/server/consultas/clientes';
import { listarVendedores } from '@/server/consultas/equipe';
import { LinhaFiltro, PainelFiltros } from '@/components/painel/filtros';
import { comFiltros } from '@/lib/url';
import { lerConfig } from '@/server/config';
import { expiraEm, prazoVencido } from '@/server/expiracao';
import { diasAte, textoCancelamento, valoresDoPedido } from '@/lib/pedido';
import { tempoDesde } from '@/lib/atividade';
import { linkWhatsApp, mensagemContato } from '@/lib/whatsapp';
import { IconeWhatsApp } from '@/components/loja/previa-whatsapp';
import { IconeAlerta, IconeCaixaLoja, IconeLoja, IconeLupa, IconeMais, IconePessoa, IconeRelogio, IconeSeta } from '@/components/ui/icones';

export const metadata = { title: 'Pedidos' };

/** Pedido em aberto há mais de 1 dia: a lista destaca o tempo de espera. */
const maisDeUmDia = (d: Date) => Date.now() - d.getTime() > 86_400_000;

const ABAS: [StatusPedido | 'todos', string][] = [['pendente', 'Pendentes'], ['confirmado', 'Confirmados'], ['cancelado', 'Cancelados'], ['todos', 'Todos']];

export default async function Pedidos({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; pagina?: string; vendedor?: string; cliente?: string }> }) {
  const u = await exigirPapel(EQUIPE);
  const sp = await searchParams;
  const status = (ABAS.find(a => a[0] === sp.status)?.[0] ?? 'pendente') as StatusPedido | 'todos';
  const q = (sp.q ?? '').trim();
  const pagina = Math.min(50, Math.max(1, Number(sp.pagina) || 1));
  const gestor = u.papel === 'gestor';
  const [cliente, vendedores] = await Promise.all([clienteDoFiltro(u, sp.cliente), gestor ? listarVendedores(u) : Promise.resolve([])]);
  const vendedor = gestor ? vendedores.find(v => v.id === sp.vendedor) ?? null : null;
  const [{ pedidos, contagens, total }, cfg] = await Promise.all([listarPedidos(u, { status, q, pagina, vendedor: vendedor?.id, cliente: cliente?.id }), lerConfig()]);
  // Filtros no endereço: os links do perfil do vendedor e da lista de clientes caem aqui já filtrados.
  const atual = { status, q: q || null, vendedor: vendedor?.id ?? null, cliente: cliente?.id ?? null };
  const url = (mudar: Record<string, string | null>) => comFiltros('/painel/pedidos', atual, mudar);
  const n = (s: string) => (s === 'todos' ? contagens.reduce((a, c) => a + c._count, 0) : contagens.find(c => c.status === s)?._count ?? 0);

  // Avisos da lista carregada: quem venceu o prazo e quem espera há mais de 1 dia (D-36).
  const vencidos = pedidos.filter(p => p.status === 'pendente' && prazoVencido(p, cfg.diasExpiracao)).length;
  const esperandoMuito = pedidos.filter(p => p.status === 'pendente' && maisDeUmDia(p.criadoEm)).length;

  return (
    <>
      <CabecalhoPagina sobre="Loja online e seleções" titulo="Pedidos" acoes={<BotaoLink href="/painel/pedidos/novo"><IconeMais className="size-4" />Novo pedido</BotaoLink>} />
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <nav aria-label="Situação dos pedidos" className="flex gap-1 p-1 rounded-full bg-card border border-borda w-fit max-w-full overflow-x-auto sem-barra">
          {ABAS.map(([s, rotulo]) => (
            <Link key={s} href={url({ status: s })} aria-current={status === s ? 'page' : undefined}
              className={`shrink-0 px-3.5 h-8 inline-flex items-center gap-2 rounded-full text-sm font-semibold transition-colors ${status === s ? 'bg-marrom-950 text-creme' : 'text-suave hover:text-marrom-950 hover:bg-creme'}`}>
              {rotulo}<span className={`min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full text-[0.65rem] tabular-nums ${status === s ? 'bg-white/15 text-creme' : 'bg-creme text-suave'}`}>{n(s)}</span>
            </Link>
          ))}
        </nav>
        <form className="flex items-center gap-2 h-10 pl-3 pr-1 rounded-full border border-borda-forte bg-card focus-within:border-marrom-950 w-full sm:w-auto">
          {Object.entries(atual).filter(([k, v]) => v && k !== 'q').map(([k, v]) => <input key={k} type="hidden" name={k} value={v!} />)}
          <IconeLupa className="size-4 text-suave shrink-0" />
          <input name="q" defaultValue={q} placeholder="Código ou cliente" className="flex-1 min-w-0 sm:w-52 bg-transparent outline-none text-sm" aria-label="Buscar pedido" />
          <button className="h-8 px-4 rounded-full bg-marrom-950 text-creme text-sm font-semibold">Buscar</button>
        </form>
      </div>

      {(gestor || cliente) && (
        <PainelFiltros limpar={vendedor || cliente ? url({ vendedor: null, cliente: null }) : null}>
          {gestor && (
            <LinhaFiltro rotulo="Vendedor" opcoes={[
              { rotulo: 'Todos', href: url({ vendedor: null }), ativo: !vendedor },
              ...vendedores.filter(v => v.ativo).map(v => ({ rotulo: v.name.split(' ')[0], href: url({ vendedor: v.id }), ativo: vendedor?.id === v.id })),
            ]} />
          )}
          {cliente && (
            <p className="text-sm self-end h-10 inline-flex items-center">Só os pedidos de&nbsp;<Link href={`/painel/clientes/${cliente.id}`} className="font-semibold text-marrom-950 underline underline-offset-4">{cliente.nome}</Link></p>
          )}
        </PainelFiltros>
      )}

      {(vencidos > 0 || esperandoMuito > 0) && (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-caramelo/30 bg-bege/60 px-4 py-2 text-sm" role="status">
          <IconeAlerta className="size-4 text-caramelo shrink-0" />
          {vencidos > 0 && <span><strong className="text-vermelho">{vencidos}</strong> com prazo vencido</span>}
          {esperandoMuito > 0 && <span><strong className="text-caramelo">{esperandoMuito}</strong> esperando há mais de 1 dia</span>}
          <span className="text-suave text-xs">Responda primeiro: a cliente está esperando.</span>
        </div>
      )}

      {pedidos.length === 0 ? (
        <Vazio>Nenhum pedido {status !== 'todos' ? ABAS.find(a => a[0] === status)![1].toLowerCase() : ''}.</Vazio>
      ) : (
        <ul className="grid gap-2">
          {pedidos.map(p => {
            const ativos = p.itens.filter(i => i.situacao !== 'devolvido');
            const pecas = ativos.reduce((t, i) => t + i.quantidade, 0);
            const fim = p.status === 'pendente' ? expiraEm(p.criadoEm, cfg.diasExpiracao) : null;
            const vencido = p.status === 'pendente' && prazoVencido(p, cfg.diasExpiracao);
            const dias = fim ? diasAte(fim) : null;
            // Esperando há mais de 1 dia sem resposta: a lista chama a atenção (D-36, a cliente está esperando).
            const esperando = p.status === 'pendente' && maisDeUmDia(p.criadoEm);
            const faixa = vencido ? 'bg-vermelho' : p.status === 'pendente' ? (esperando ? 'bg-caramelo' : 'bg-areia') : p.status === 'confirmado' ? 'bg-oliva' : 'bg-borda-forte';
            const Origem = p.origem === 'balcao' ? IconeCaixaLoja : p.origem === 'vendedor' ? IconePessoa : IconeLoja;
            return (
              <li key={p.id} className={`group relative overflow-hidden bg-card border rounded-2xl pl-4 pr-3 py-2.5 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 sm:gap-4 transition hover:border-marrom-950 hover:shadow-sm ${vencido ? 'border-vermelho/50' : 'border-borda'} ${p.status === 'cancelado' ? 'opacity-70' : ''}`}>
                <span className={`absolute left-0 inset-y-0 w-1 ${faixa}`} aria-hidden="true" />
                <div className="flex -space-x-4 w-[4.5rem] sm:w-[5.25rem] shrink-0" aria-hidden="true">
                  {ativos.slice(0, 3).map((i, n) => (
                    <span key={i.id} className="relative w-9 sm:w-10 aspect-[3/4] rounded-md overflow-hidden bg-bege ring-2 ring-card" style={{ zIndex: 3 - n }}><Foto src={i.imagem} alt="" sizes="40px" /></span>
                  ))}
                </div>
                <div className="min-w-0 grid gap-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Link href={`/painel/pedidos/${p.id}`} className="font-display font-extrabold text-marrom-950 after:absolute after:inset-0 after:rounded-2xl">{p.codigo}</Link>
                    <EtiquetaTipo tipo={p.tipo} />
                    {status === 'todos' && <EtiquetaStatus status={p.status} />}
                    <span className="inline-flex items-center gap-1 text-[0.68rem] text-suave" title={p.origem === 'vendedor' ? 'Seleção do vendedor' : p.origem === 'balcao' ? 'Venda na loja' : 'Loja online'}>
                      <Origem className="size-3.5" />{p.origem === 'vendedor' ? 'Seleção' : p.origem === 'balcao' ? 'Na loja' : 'Online'}
                    </span>
                    {p.pagamentoSituacao === 'pago' && <span className="h-5 px-2 rounded-full bg-oliva/15 text-oliva text-[0.65rem] font-bold inline-flex items-center">Pago</span>}
                    {vencido && <span className="h-5 px-2 rounded-full bg-vermelho text-creme text-[0.65rem] font-bold inline-flex items-center">Prazo vencido</span>}
                    {!vencido && dias != null && dias <= 2 && <span className="h-5 px-2 rounded-full bg-vermelho/10 text-vermelho text-[0.65rem] font-bold inline-flex items-center">{dias ? `Vence em ${dias} dia${dias === 1 ? '' : 's'}` : 'Vence hoje'}</span>}
                    {p.status === 'cancelado' && textoCancelamento(p.motivoCancelamento, false) && <span className="text-[0.7rem] text-suave">{textoCancelamento(p.motivoCancelamento, false)}</span>}
                  </div>
                  <div className="text-sm text-suave truncate">
                    <strong className="text-marrom-950 font-semibold">{p.nomeCliente}</strong>
                    <span> · {pecas} {pecas === 1 ? 'peça' : 'peças'}</span>
                    <span className={esperando ? ' text-caramelo font-semibold' : ''}> · {p.status === 'pendente' ? <><IconeRelogio className="inline size-3.5 -mt-0.5" /> {tempoDesde(p.criadoEm)}</> : formatarDataHora(p.criadoEm)}</span>
                    {gestor && <span> · {p.vendedor.name.split(' ')[0]}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-display font-extrabold text-marrom-950 whitespace-nowrap">{brl(valoresDoPedido(p).total)}</span>
                  {p.telefoneCliente && p.status === 'pendente' && (
                    <a href={linkWhatsApp(p.telefoneCliente, mensagemContato(p.nomeCliente, p.tipo, p.codigo))} target="_blank" rel="noopener" data-acao="contato" data-pedido={p.id}
                      className="relative z-10 size-8 rounded-full bg-whatsapp text-white grid place-items-center hover:bg-whatsapp-escuro" aria-label={`WhatsApp de ${p.nomeCliente}`} title="WhatsApp da cliente">
                      <IconeWhatsApp className="size-4" />
                    </a>
                  )}
                  <IconeSeta className="hidden sm:block size-4 text-suave transition-transform group-hover:translate-x-0.5" />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {total > pedidos.length && (
        <div className="mt-5 text-center">
          <p className="text-xs text-suave mb-2">Mostrando {pedidos.length} de {total}</p>
          <Link href={url({ pagina: String(pagina + 1) })} scroll={false} className={botao('secundario', 'p')}>Carregar mais</Link>
        </div>
      )}
    </>
  );
}
