import { Logo } from '@/components/ui/logo';
import { marcaAtual } from '@/server/marca';
import Link from 'next/link';
import { Foto } from '@/components/loja/foto';
import { IconeWhatsApp } from '@/components/loja/previa-whatsapp';
import { descreverPagamento, rotuloForma } from '@/lib/caixa';
import { diaDe, formatarData, TZ } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { linkCompartilharWhatsApp } from '@/lib/whatsapp';
import { vendasDoCaixa } from '@/server/consultas/caixa';
import { EQUIPE, exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Vendas do dia' };

const hora = (d: Date) => d.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

/** Vendas do caixa no dia e o fechamento: total por forma de pagamento (para conferir a gaveta e as maquininhas) e por vendedora. */
export default async function VendasDoDia({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const u = await exigirPapel(EQUIPE);
  const r = await vendasDoCaixa(u, (await searchParams).dia);
  const hoje = diaDe();
  const ontem = diaDe(new Date(new Date(`${r.dia}T12:00:00-03:00`).getTime() - 86_400_000));
  const amanha = diaDe(new Date(new Date(`${r.dia}T12:00:00-03:00`).getTime() + 86_400_000));
  const fechamento = [
    `*Fechamento do caixa · ${formatarData(`${r.dia}T12:00:00-03:00`)}*${u.papel === 'gestor' ? '' : ` · ${u.name.split(' ')[0]}`}`,
    `${r.vendas} ${r.vendas === 1 ? 'venda' : 'vendas'} · ${r.pecas} peças · *${brl(r.total)}*`,
    '',
    ...r.porForma.map(f => `${rotuloForma(f.forma)}: ${brl(f.valor)} (${f.n})`),
    ...(r.troco > 0 ? [`Troco dado em dinheiro: ${brl(r.troco)}`] : []),
    ...(r.porVendedor.length > 1 ? ['', ...r.porVendedor.map(v => `${v.nome}: ${brl(v.valor)} (${v.n})`)] : []),
    ...(r.desfeitas ? ['', `${r.desfeitas} ${r.desfeitas === 1 ? 'venda desfeita' : 'vendas desfeitas'}`] : []),
  ].join('\n');

  return (
    <div className="min-h-dvh">
      <header className="h-14 bg-marrom-950 text-creme flex items-center gap-4 px-4 lg:px-6">
        <Logo img={(await marcaAtual()).logoClara} className="h-9 w-auto" />
        <span className="rotulo text-areia border-l border-creme/20 pl-4">Vendas do dia</span>
        <Link href="/caixa" className="ml-auto h-10 px-4 grid place-items-center bg-creme text-marrom-950 rotulo !text-[0.65rem]">← Voltar ao caixa</Link>
      </header>

      <main className="mx-auto max-w-6xl px-4 lg:px-6 py-6 grid gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="rotulo text-caramelo">{r.dia === hoje ? 'Hoje' : 'Dia'}</div>
            <h1 className="titulo text-3xl">{formatarData(`${r.dia}T12:00:00-03:00`)}</h1>
          </div>
          <nav className="flex gap-2" aria-label="Escolher o dia">
            <Link href={`/caixa/vendas?dia=${ontem}`} className="h-10 px-3 grid place-items-center border border-borda-forte bg-card rotulo !text-[0.62rem]">← Dia anterior</Link>
            {r.dia !== hoje && <Link href="/caixa/vendas" className="h-10 px-3 grid place-items-center border border-borda-forte bg-card rotulo !text-[0.62rem]">Hoje</Link>}
            {r.dia < hoje && <Link href={`/caixa/vendas?dia=${amanha}`} className="h-10 px-3 grid place-items-center border border-borda-forte bg-card rotulo !text-[0.62rem]">Próximo →</Link>}
          </nav>
        </div>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Numero rotulo="Total vendido" valor={brl(r.total)} escuro />
          <Numero rotulo="Vendas" valor={String(r.vendas)} />
          <Numero rotulo="Peças" valor={String(r.pecas)} />
          <Numero rotulo="Ticket médio" valor={brl(r.ticketMedio)} />
        </section>

        <section className="grid lg:grid-cols-[1fr_1fr_1.2fr] gap-4 items-start">
          <div className="bg-card border border-borda p-5">
            <h2 className="titulo text-lg mb-4">Por forma de pagamento</h2>
            {r.porForma.length === 0 ? <p className="text-sm text-suave">Nenhuma venda.</p> : (
              <ul className="grid gap-3">
                {r.porForma.map(f => (
                  <li key={f.forma} className="flex items-baseline justify-between gap-3">
                    <span>{rotuloForma(f.forma)} <span className="text-xs text-suave">· {f.n}</span></span>
                    <span className="font-display font-extrabold">{brl(f.valor)}</span>
                  </li>
                ))}
                {r.troco > 0 && <li className="flex justify-between text-sm text-suave border-t border-borda pt-2"><span>Troco dado no dinheiro</span><span>{brl(r.troco)}</span></li>}
              </ul>
            )}
          </div>
          <div className="bg-card border border-borda p-5">
            <h2 className="titulo text-lg mb-4">Por vendedora</h2>
            {r.porVendedor.length === 0 ? <p className="text-sm text-suave">Nenhuma venda.</p> : (
              <ul className="grid gap-3">
                {r.porVendedor.map(v => (
                  <li key={v.nome} className="flex items-baseline justify-between gap-3"><span>{v.nome} <span className="text-xs text-suave">· {v.n}</span></span><span className="font-display font-extrabold">{brl(v.valor)}</span></li>
                ))}
              </ul>
            )}
          </div>
          <div className="bg-card border border-borda p-5 grid gap-3">
            <h2 className="titulo text-lg">Fechamento</h2>
            <pre className="whitespace-pre-wrap text-sm bg-creme border border-borda p-3 font-sans">{fechamento.replace(/\*/g, '')}</pre>
            <a href={linkCompartilharWhatsApp(fechamento)} target="_blank" rel="noopener" className="h-12 flex items-center justify-center gap-2 bg-whatsapp text-white rotulo !text-[0.68rem]">
              <IconeWhatsApp className="size-5" />Enviar o fechamento no WhatsApp
            </a>
          </div>
        </section>

        <section className="bg-card border border-borda">
          <h2 className="titulo text-lg px-5 py-4 border-b border-borda">Vendas ({r.pedidos.length})</h2>
          {r.pedidos.length === 0 ? <p className="px-5 py-10 text-center text-suave">Nenhuma venda no caixa neste dia.</p> : (
            <ul className="divide-y divide-borda">
              {r.pedidos.map(p => {
                const desfeita = p.status === 'cancelado';
                const pecas = p.itens.reduce((a, i) => a + i.quantidade, 0);
                return (
                  <li key={p.id} className={desfeita ? 'opacity-55' : ''}>
                    <details className="group">
                      <summary className="list-none cursor-pointer px-5 py-3 grid grid-cols-[3.5rem_1fr_auto] sm:grid-cols-[3.5rem_1fr_1fr_auto] gap-3 items-center hover:bg-creme">
                        <span className="font-display font-bold tabular-nums">{hora(p.criadoEm)}</span>
                        <span className="min-w-0">
                          <span className="block font-semibold text-marrom-950">{p.codigo}{desfeita && <span className="ml-2 rotulo !text-[0.58rem] text-vermelho">Desfeita</span>}</span>
                          <span className="block text-xs text-suave truncate">{p.nomeCliente || 'Consumidor final'} · {pecas} {pecas === 1 ? 'peça' : 'peças'}</span>
                        </span>
                        <span className="hidden sm:block text-sm text-suave truncate">{p.pagamentos.map(g => rotuloForma(g.forma)).join(' + ') || '—'} · {p.vendedor.name.split(' ')[0]}</span>
                        <span className="font-display font-extrabold">{brl(Number(p.total))}</span>
                      </summary>
                      <div className="px-5 pb-4 grid sm:grid-cols-[1fr_auto] gap-4">
                        <ul className="flex flex-wrap gap-2">
                          {p.itens.map((i, k) => (
                            <li key={k} className="flex items-center gap-2 text-sm bg-creme border border-borda pr-3">
                              <span className="relative w-9 aspect-[3/4] bg-bege"><Foto src={i.imagem} alt="" sizes="36px" /></span>
                              <span>{i.quantidade}× {i.nome.slice(0, 40)} · {i.tamanho}</span>
                            </li>
                          ))}
                        </ul>
                        <div className="text-sm grid gap-1 content-start sm:text-right">
                          {p.pagamentos.map((g, k) => <span key={k}>{descreverPagamento({ forma: g.forma, valor: Number(g.valor), parcelas: g.parcelas, recebido: g.recebido == null ? null : Number(g.recebido) }, brl)}: {brl(Number(g.valor))}</span>)}
                          {p.codigoCupom && <span className="text-oliva">Cupom {p.codigoCupom}</span>}
                          <Link href={`/painel/pedidos/${p.id}`} className="text-caramelo underline underline-offset-4">{desfeita ? 'Ver no painel' : 'Ver ou desfazer no painel'}</Link>
                        </div>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function Numero({ rotulo, valor, escuro = false }: { rotulo: string; valor: string; escuro?: boolean }) {
  return (
    <div className={`p-5 ${escuro ? 'bg-marrom-950 text-creme' : 'bg-card border border-borda'}`}>
      <div className={`rotulo !text-[0.62rem] ${escuro ? 'text-areia' : 'text-suave'}`}>{rotulo}</div>
      <div className="font-display font-extrabold text-2xl mt-1">{valor}</div>
    </div>
  );
}
