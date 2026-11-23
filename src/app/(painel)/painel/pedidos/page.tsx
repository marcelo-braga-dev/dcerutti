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

  return (
    <>
      <CabecalhoPagina sobre="Loja online e seleções" titulo="Pedidos" acoes={<BotaoLink href="/painel/pedidos/novo">+ Novo pedido</BotaoLink>} />
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <nav aria-label="Situação dos pedidos" className="flex gap-1 p-1 rounded-full bg-card border border-borda w-fit max-w-full overflow-x-auto sem-barra">
          {ABAS.map(([s, rotulo]) => (
            <Link key={s} href={url({ status: s })} aria-current={status === s ? 'page' : undefined}
              className={`shrink-0 px-4 h-9 inline-flex items-center gap-2 rounded-full text-sm font-semibold transition-colors ${status === s ? 'bg-marrom-950 text-creme' : 'text-suave hover:text-marrom-950 hover:bg-creme'}`}>
              {rotulo}<span className={`text-[0.7rem] tabular-nums ${status === s ? 'text-areia' : 'text-suave/70'}`}>{n(s)}</span>
            </Link>
          ))}
        </nav>
        <form className="flex items-center gap-2 h-10 pl-4 pr-1 rounded-full border border-borda-forte bg-card focus-within:border-marrom-950 w-full sm:w-auto">
          {Object.entries(atual).filter(([k, v]) => v && k !== 'q').map(([k, v]) => <input key={k} type="hidden" name={k} value={v!} />)}
          <input name="q" defaultValue={q} placeholder="Código ou cliente" className="flex-1 min-w-0 sm:w-56 bg-transparent outline-none text-sm" aria-label="Buscar pedido" />
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
      {pedidos.length === 0 ? (
        <Vazio>Nenhum pedido {status !== 'todos' ? ABAS.find(a => a[0] === status)![1].toLowerCase() : ''}.</Vazio>
      ) : (
        <ul className="grid gap-2.5">
          {pedidos.map(p => {
            const pecas = p.itens.filter(i => i.situacao !== 'devolvido').reduce((t, i) => t + i.quantidade, 0);
            const fim = p.status === 'pendente' ? expiraEm(p.criadoEm, cfg.diasExpiracao) : null;
            const vencido = p.status === 'pendente' && prazoVencido(p, cfg.diasExpiracao);
            const dias = fim ? diasAte(fim) : null;
            // Esperando há mais de 1 dia sem resposta: a lista chama a atenção (D-36, a cliente está esperando).
            const esperando = p.status === 'pendente' && maisDeUmDia(p.criadoEm);
            return (
              <li key={p.id} className={`group relative bg-card border rounded-2xl p-3 sm:p-4 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 sm:gap-5 transition-colors hover:border-marrom-950 ${vencido ? 'border-vermelho/50' : 'border-borda'}`}>
                <div className="flex -space-x-5 sm:-space-x-4 w-[5.25rem] sm:w-[6.5rem] shrink-0" aria-hidden="true">
                  {p.itens.filter(i => i.situacao !== 'devolvido').slice(0, 3).map((i, n) => (
                    <span key={i.id} className="relative w-11 sm:w-12 aspect-[3/4] rounded-lg overflow-hidden bg-bege ring-2 ring-card" style={{ zIndex: 3 - n }}><Foto src={i.imagem} alt="" sizes="48px" /></span>
                  ))}
                </div>
                <div className="min-w-0 grid gap-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/painel/pedidos/${p.id}`} className="font-display font-extrabold text-marrom-950 after:absolute after:inset-0 after:rounded-2xl">{p.codigo}</Link>
                    <EtiquetaTipo tipo={p.tipo} />
                    {status === 'todos' && <EtiquetaStatus status={p.status} />}
                    {p.origem === 'vendedor' && <span className="text-[0.68rem] text-suave">Seleção</span>}
                    {p.origem === 'balcao' && <span className="text-[0.68rem] text-suave">Na loja</span>}
                    {p.pagamentoSituacao === 'pago' && <span className="h-5 px-2 rounded-full bg-oliva/15 text-oliva text-[0.65rem] font-bold inline-flex items-center">Pago</span>}
                    {vencido && <span className="h-5 px-2 rounded-full bg-vermelho text-creme text-[0.65rem] font-bold inline-flex items-center">Prazo vencido</span>}
                    {!vencido && dias != null && dias <= 2 && <span className="text-[0.7rem] font-semibold text-vermelho">{dias ? `Vence em ${dias} dia${dias === 1 ? '' : 's'}` : 'Vence hoje'}</span>}
                    {p.status === 'cancelado' && textoCancelamento(p.motivoCancelamento, false) && <span className="text-[0.7rem] text-suave">{textoCancelamento(p.motivoCancelamento, false)}</span>}
                  </div>
                  <div className="text-sm text-suave truncate">
                    <strong className="text-marrom-950 font-semibold">{p.nomeCliente}</strong>
                    <span> · {pecas} {pecas === 1 ? 'peça' : 'peças'}</span>
                    <span className={esperando ? ' text-caramelo font-semibold' : ''}> · {p.status === 'pendente' ? `esperando ${tempoDesde(p.criadoEm)}` : formatarDataHora(p.criadoEm)}</span>
                    {gestor && <span> · {p.vendedor.name.split(' ')[0]}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="font-display font-extrabold text-marrom-950 whitespace-nowrap">{brl(valoresDoPedido(p).total)}</span>
                  {p.telefoneCliente && p.status === 'pendente' && (
                    <a href={linkWhatsApp(p.telefoneCliente, mensagemContato(p.nomeCliente, p.tipo, p.codigo))} target="_blank" rel="noopener" data-acao="contato" data-pedido={p.id}
                      className="relative z-10 size-9 rounded-full bg-whatsapp text-white grid place-items-center hover:bg-whatsapp-escuro" aria-label={`WhatsApp de ${p.nomeCliente}`} title="WhatsApp da cliente">
                      <IconeWhatsApp className="size-4" />
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {total > pedidos.length && (
        <div className="mt-6 text-center">
          <p className="text-sm text-suave mb-3">Mostrando {pedidos.length} de {total}</p>
          <Link href={url({ pagina: String(pagina + 1) })} scroll={false} className={botao('secundario')}>Carregar mais</Link>
        </div>
      )}
    </>
  );
}
