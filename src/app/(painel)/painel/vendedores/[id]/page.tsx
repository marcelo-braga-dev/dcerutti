import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FormVendedor } from '@/components/painel/form-vendedor';
import { Barra, CabecalhoPagina, Cartao, Etiqueta, Kpi } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { BotaoEnviar, Campo, Formulario } from '@/components/ui/formulario';
import { formatarData, intervaloDoMes, mesDe, nomeDoMes, somarMeses } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { desativarVendedor, reativarVendedor, salvarMeta } from '@/server/acoes/gestao';
import { exigirPapel } from '@/server/permissoes';
import { corDaMeta, metasDoMes } from '@/server/relatorios';
import { perfilDoVendedor, ultimasAcoes, vendedorParaEdicao } from '@/server/consultas/equipe';
import { ACOES, type Acao } from '@/lib/equipe';
import { tempoDesde } from '@/lib/atividade';
import { BotaoAcao } from '@/components/ui/botao-acao';
import { plural } from '@/lib/pedido';
import { celularValido } from '@/lib/telefone';
import { EtiquetaTipo } from '@/components/ui/status-pedido';

export default async function EditarVendedor({ params }: { params: Promise<{ id: string }> }) {
  const u = await exigirPapel(['gestor']);
  const r = await vendedorParaEdicao(u, (await params).id);
  if (!r) notFound();
  const { vendedor: v, outros } = r;
  const mes = mesDe();
  const [metas, p, { acoes, acesso, online: estaOnline }] = await Promise.all([metasDoMes([v.id], mes), perfilDoVendedor(u, v.id, intervaloDoMes(mes)), ultimasAcoes(u, v.id)]);
  const metaAtual = metas.get(v.id);
  const pct = metaAtual ? (p.vendidoMes / metaAtual) * 100 : 0;
  const primeiro = v.name.split(' ')[0];
  const link = 'underline underline-offset-4 text-marrom-950';

  return (
    <>
      <Link href="/painel/vendedores" className="rotulo text-suave hover:text-marrom-950">← Vendedores</Link>
      <div className="mt-4" />
      <CabecalhoPagina sobre="Vendedor" titulo={v.name}
        acoes={<>
          <Link href={`/painel/clientes?vendedor=${v.id}`} className={botao('secundario')}>Clientes</Link>
          <Link href={`/painel/pedidos?vendedor=${v.id}`} className={botao('secundario')}>Pedidos</Link>
          <Link href={`/painel/vendas?vendedor=${v.id}`} className={botao('secundario')}>Vendas</Link>
        </>}>
        {!v.ativo && <><Etiqueta cor="cinza">Inativo</Etiqueta> · </>}
        <span className={estaOnline ? 'text-oliva font-semibold' : ''}>{estaOnline ? '● Online agora' : acesso?.ultimoAcessoEm ? `Visto ${tempoDesde(acesso.ultimoAcessoEm)}` : 'Sem acesso registrado'}</span> · {v.email} · {celularValido(v.telefone) ? `WhatsApp ${v.telefone}` : <span className="text-vermelho">WhatsApp incompleto</span>}
      </CabecalhoPagina>

      {/* Perfil: os números do mês e a carteira; cada número leva à lista já filtrada por este vendedor. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi rotulo={`Vendido em ${nomeDoMes(mes).split(' ')[0].toLowerCase()}`} valor={brl(p.vendidoMes)}
          detalhe={<><Link href={`/painel/vendas?vendedor=${v.id}`} className="underline">{plural(p.vendasMes, 'venda', 'vendas')}</Link>{metaAtual ? ` · ${Math.round(pct)}% da meta` : ' · sem meta'}</>} tom="escuro" />
        <Kpi rotulo="Clientes" valor={<Link href={`/painel/clientes?vendedor=${v.id}`} className="hover:underline">{p.clientes}</Link>} detalhe={`${p.comAcesso} com acesso à loja`} />
        <Kpi rotulo="Pedidos em aberto" valor={<Link href={`/painel/pedidos?vendedor=${v.id}`} className="hover:underline">{p.nAbertos}</Link>} detalhe="Pendentes de confirmar" />
        <Kpi rotulo="Ticket médio do mês" valor={brl(p.vendasMes ? p.vendidoMes / p.vendasMes : 0)} detalhe={`${p.compraram} clientes já compraram`} />
      </div>
      {metaAtual ? <div className="mt-3"><Barra pct={pct} cor={corDaMeta(pct)} /></div> : null}

      <div className="grid xl:grid-cols-[1.3fr_1fr] gap-6 mt-8 items-start">
        <Cartao className="p-5 sm:p-6">
          <div className="flex flex-wrap justify-between items-baseline gap-3 mb-4">
            <h2 className="titulo text-lg">Melhores clientes</h2>
            <Link href={`/painel/clientes?vendedor=${v.id}&ordem=total`} className="rotulo underline underline-offset-4">Todos por total</Link>
          </div>
          {p.melhores.length === 0 ? <p className="text-sm text-suave">Nenhuma cliente de {primeiro} comprou ainda.</p> : (
            <ul className="divide-y divide-borda text-sm">
              {p.melhores.map(c => (
                <li key={c.id} className="py-2.5 flex justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/painel/clientes/${c.id}`} className="font-semibold text-marrom-950 hover:underline">{c.nome}</Link>
                    <div className="text-suave">{c.ultima ? `Última compra em ${formatarData(c.ultima)}` : ''}</div>
                  </div>
                  <span className="font-display font-extrabold whitespace-nowrap">{brl(c.total)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 pt-4 border-t border-borda flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link href={`/painel/clientes?vendedor=${v.id}&compra=nunca`} className={link}>{plural(p.nuncaCompraram, 'nunca comprou', 'nunca compraram')}</Link>
            <Link href={`/painel/clientes?vendedor=${v.id}&compra=parada`} className={link}>{plural(p.paradas, 'sem comprar há 90 dias', 'sem comprar há 90 dias')}</Link>
            <Link href={`/painel/clientes?vendedor=${v.id}&sacola=1`} className={link}>com sacola aberta</Link>
          </div>
        </Cartao>
        <div className="grid gap-6">
          <Cartao className="p-5 sm:p-6">
            <div className="flex justify-between items-baseline gap-3 mb-4">
              <h2 className="titulo text-lg">Pedidos em aberto</h2>
              <Link href={`/painel/pedidos?vendedor=${v.id}`} className="rotulo underline underline-offset-4">Todos</Link>
            </div>
            {p.abertos.length === 0 ? <p className="text-sm text-suave">Nenhum pedido em aberto.</p> : (
              <ul className="divide-y divide-borda text-sm">
                {p.abertos.map(o => (
                  <li key={o.id} className="py-2.5 flex justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/painel/pedidos/${o.id}`} className="font-display font-bold hover:underline">{o.codigo}</Link> <EtiquetaTipo tipo={o.tipo} />
                      <div className="text-suave"><Link href={`/painel/clientes/${o.clienteId}`} className="hover:underline">{o.nomeCliente}</Link> · {formatarData(o.criadoEm)}</div>
                    </div>
                    <span className="font-display font-extrabold whitespace-nowrap">{brl(o.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
          <Cartao className="p-5 sm:p-6">
            <div className="flex justify-between items-baseline gap-3 mb-4">
              <h2 className="titulo text-lg">Últimas ações</h2>
              <Link href={`/painel/equipe?pessoa=${v.id}#historico`} className="rotulo underline underline-offset-4">Histórico</Link>
            </div>
            {acesso?.ultimoLoginEm && <p className="text-xs text-suave mb-3">Último login em {formatarData(acesso.ultimoLoginEm)}</p>}
            {acoes.length === 0 ? <p className="text-sm text-suave">Nenhuma ação registrada ainda.</p> : (
              <ul className="divide-y divide-borda text-sm">
                {acoes.map(a => (
                  <li key={String(a.id)} className="py-2 flex justify-between gap-3">
                    <div className="min-w-0">
                      <span className="font-semibold text-marrom-950">{ACOES[a.tipo as Acao].rotulo}</span>
                      {a.descricao && <span className="text-suave"> · {a.clienteId ? <Link href={`/painel/clientes/${a.clienteId}`} className="hover:underline">{a.descricao}</Link> : a.descricao}</span>}
                    </div>
                    <span className="text-xs text-suave whitespace-nowrap">{tempoDesde(a.criadoEm)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
          <Cartao className="p-5 sm:p-6">
            <div className="flex justify-between items-baseline gap-3 mb-4">
              <h2 className="titulo text-lg">Vendas recentes</h2>
              <Link href={`/painel/vendas?vendedor=${v.id}`} className="rotulo underline underline-offset-4">Todas do mês</Link>
            </div>
            {p.recentes.length === 0 ? <p className="text-sm text-suave">Nenhuma venda ainda.</p> : (
              <ul className="divide-y divide-borda text-sm">
                {p.recentes.map(x => (
                  <li key={x.id} className="py-2.5 flex justify-between gap-3">
                    <div className="min-w-0">
                      {x.cliente ? <Link href={`/painel/clientes/${x.cliente.id}`} className="text-marrom-950 hover:underline">{x.cliente.nome}</Link> : '—'}
                      <div className="text-suave">{formatarData(x.data)} · {x.pedido ? <Link href={`/painel/pedidos/${x.pedido.id}`} className="underline">{x.pedido.codigo}</Link> : x.observacao}</div>
                    </div>
                    <span className="font-display font-extrabold whitespace-nowrap">{brl(x.valor)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </div>
      </div>

      <details className="mt-8 group" open={!v.ativo}>
        <summary className="cursor-pointer list-none flex items-center gap-2 titulo text-lg mb-4">
          <span className="transition-transform group-open:rotate-90" aria-hidden="true">›</span> Dados, metas e acesso
        </summary>
      <div className="grid xl:grid-cols-[1.3fr_1fr] gap-6 items-start">
        <Cartao className="p-5 sm:p-8"><FormVendedor vendedor={v} meta={metaAtual} /></Cartao>
        <div className="grid gap-6">
          <Cartao className="p-5 sm:p-6">
            <h2 className="titulo text-lg mb-4">Metas mensais</h2>
            <Formulario acao={salvarMeta} className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end mb-5">
              <input type="hidden" name="vendedorId" value={v.id} />
              <Campo nome="mes" rotulo="Mês" tipo="month" padrao={somarMeses(mes, 1)} />
              <Campo nome="valor" rotulo="Meta (R$)" placeholder="15000" />
              <BotaoEnviar>Salvar</BotaoEnviar>
            </Formulario>
            {v.metas.length === 0 ? <p className="text-sm text-suave">Nenhuma meta cadastrada.</p> : (
              <ul className="divide-y divide-borda text-sm">
                {v.metas.map(m => <li key={m.id} className="py-2 flex justify-between"><span>{nomeDoMes(m.mes)}</span><strong>{brl(m.valor)}</strong></li>)}
              </ul>
            )}
            <p className="mt-3 text-xs text-suave">Mês sem meta própria usa a meta mais recente anterior.</p>
          </Cartao>
          <Cartao className="p-5 sm:p-6">
            {v.ativo ? (
              <>
                <h2 className="titulo text-lg mb-2">Desativar acesso</h2>
                <p className="text-sm text-suave mb-4">O vendedor deixa de entrar no painel. Vendas e pedidos continuam registrados.</p>
                <Formulario acao={desativarVendedor} className="grid gap-4">
                  <input type="hidden" name="id" value={v.id} />
                  {(v._count.clientes > 0 || v._count.pedidos > 0) && (
                    <Campo nome="transferirPara" rotulo={`Transferir ${[v._count.clientes && plural(v._count.clientes, 'cliente', 'clientes'), v._count.pedidos && plural(v._count.pedidos, 'pedido em aberto', 'pedidos em aberto')].filter(Boolean).join(' e ')} para`} tipo="select"
                      opcoes={[{ valor: '', rotulo: 'Escolha…' }, ...outros.map(o => ({ valor: o.id, rotulo: o.name }))]} />
                  )}
                  <BotaoEnviar variante="perigo" pendente="Desativando…">Desativar vendedor</BotaoEnviar>
                </Formulario>
              </>
            ) : (
              <div>
                <h2 className="titulo text-lg mb-2">Vendedor inativo</h2>
                <BotaoAcao acao={reativarVendedor.bind(null, v.id)} className={botao('oliva')}>Reativar acesso</BotaoAcao>
              </div>
            )}
          </Cartao>
        </div>
      </div>
      </details>
    </>
  );
}
