import Link from 'next/link';
import { numeroEmUso } from '@/lib/numeros';
import { after } from 'next/server';
import { Convite } from '@/components/painel/convite';
import { Barra, Cartao, Vazio } from '@/components/ui/basicos';
import { IconeAtividade, IconeBrilho, IconeCaixaLoja, IconeCheck, IconeGrafico, IconePessoa, IconeRecibo, IconeTrofeu } from '@/components/ui/icones';
import { BotaoLink } from '@/components/ui/botao';
import { formatarData, mesDe, nomeDoMes } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { formatarTelefone } from '@/lib/telefone';
import { EQUIPE, exigirPapel } from '@/server/permissoes';
import { corDaMeta, metasDoMes, vendidoPorVendedor } from '@/server/relatorios';
import { urlDoSite } from '@/server/site';
import { vendedoresDoResumo } from '@/server/consultas/equipe';
import { contarPendentes, listarPedidos } from '@/server/consultas/pedidos';
import { Foto } from '@/components/loja/foto';
import { IconeWhatsApp } from '@/components/loja/previa-whatsapp';
import { valoresDoPedido } from '@/lib/pedido';
import { vendasRecentes } from '@/server/consultas/vendas';
import { interessadosAgora } from '@/server/consultas/navegacao';
import { talvezManutencao } from '@/server/navegacao';
import { lerConfig } from '@/server/config';
import { tempoDesde } from '@/lib/atividade';
import { linkWhatsApp, mensagemContato } from '@/lib/whatsapp';
import { TOM } from '@/lib/marca';
import { nomeDaLoja } from '@/lib/loja';

export default async function Resumo() {
  const u = await exigirPapel(EQUIPE);
  const gestor = u.papel === 'gestor';
  const mes = mesDe();
  const vendedores = await vendedoresDoResumo(u);
  const [metas, vendido, pendentes, recentes, cfg] = await Promise.all([
    metasDoMes(vendedores.map(v => v.id), mes),
    vendidoPorVendedor(mes, gestor ? undefined : u.id),
    contarPendentes(u),
    vendasRecentes(u, mes),
    lerConfig(),
  ]);
  // Histórico do cliente (docs/21): quem está de olho em alguma peça; a manutenção (sacola parada, retenção) roda depois.
  const interessados = cfg.historico.ligado ? await interessadosAgora(u) : [];
  // Vendedora (D-36): no lugar da meta repetida, o que pede ação agora — os pedidos em aberto, mais antigos primeiro.
  const aResponder = gestor ? [] : (await listarPedidos(u, { status: 'pendente', q: '', pagina: 1 })).pedidos.sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime()).slice(0, 6);
  after(() => talvezManutencao());

  const ranking = vendedores
    .map(v => {
      const meta = metas.get(v.id) ?? 0;
      const valor = vendido.get(v.id)?.valor ?? 0;
      const pct = meta ? (valor / meta) * 100 : 0;
      return { ...v, meta, valor, pct };
    })
    .sort((a, b) => b.valor - a.valor);

  const totalVendido = [...vendido.values()].reduce((a, x) => a + x.valor, 0);
  const totalMeta = ranking.reduce((a, r) => a + r.meta, 0);
  const eu = ranking.find(r => r.id === u.id);

  const pctEquipe = totalMeta ? (totalVendido / totalMeta) * 100 : 0;
  const hora = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }).format(new Date()));
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const pctMeu = eu?.pct ?? 0;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <div className="text-sm text-suave">{saudacao}, <strong className="text-marrom-950">{u.name.split(' ')[0]}</strong> · {nomeDoMes(mes)}</div>
          <h1 className="titulo text-3xl sm:text-4xl mt-1">{gestor ? 'Resumo da equipe' : 'Meu painel'}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <BotaoLink href="/caixa" variante="secundario">Abrir o caixa</BotaoLink>
          <BotaoLink href="/painel/pedidos/novo">+ Novo pedido</BotaoLink>
        </div>
      </div>

      {/* Destaque: a meta do mês (da equipe ou a minha) e os números principais. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1.35fr_1fr_1fr]">
        <section className="col-span-2 lg:col-span-1 relative overflow-hidden rounded-3xl bg-marrom-950 text-creme p-6 sm:p-7 flex items-center gap-6 lg:row-span-2">
          <div aria-hidden="true" className="absolute -right-16 -top-16 size-56 rounded-full bg-caramelo/40 blur-3xl" />
          <Anel pct={gestor ? pctEquipe : pctMeu} />
          <div className="relative min-w-0">
            <div className="text-sm text-areia">{gestor ? 'Vendido no mês' : 'Minha meta'}</div>
            <div className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-1">{brl(gestor ? totalVendido : eu?.valor ?? 0)}</div>
            <div className="text-sm text-areia mt-1">
              {gestor
                ? totalMeta ? <>de {brl(totalMeta)} da meta da equipe</> : 'Defina metas por vendedor'
                : eu?.meta ? <>de {brl(eu.meta)} · {pctMeu >= 100 ? 'meta batida!' : `faltam ${brl(Math.max(0, eu.meta - eu.valor))}`}</> : 'Sem meta neste mês'}
            </div>
            {!gestor && <div className="mt-3 text-xs text-areia/80">Vendido no mês · {vendido.get(u.id)?.n ?? 0} vendas</div>}
          </div>
        </section>
        <Numero icone={<IconeRecibo />} rotulo="Pedidos pendentes" valor={pendentes} href="/painel/pedidos" detalhe={pendentes ? 'Responda logo: a cliente está esperando' : 'Tudo em dia'} alerta={pendentes > 0} />
        {gestor ? (
          <>
            <Numero icone={<IconeTrofeu />} rotulo="Bateram a meta" valor={`${ranking.filter(r => r.meta && r.pct >= 100).length}/${ranking.length}`} detalhe="Vendedores ativos" />
            <Numero icone={<IconeGrafico />} rotulo="Meta da equipe" valor={brl(totalMeta)} detalhe={totalMeta ? `${Math.round(pctEquipe)}% atingido` : 'Defina metas por vendedor'} />
            <Numero icone={<IconeAtividade />} rotulo="Vendas no mês" valor={[...vendido.values()].reduce((a, x) => a + x.n, 0)} href="/painel/vendas" detalhe="Ver todas as vendas" />
          </>
        ) : (
          <>
            <Numero icone={<IconeGrafico />} rotulo="Falta para a meta" valor={brl(Math.max(0, (eu?.meta ?? 0) - (eu?.valor ?? 0)))} detalhe={pctMeu >= 100 ? 'Meta batida!' : 'Continue assim'} />
            <Numero icone={<IconePessoa />} rotulo="Meus clientes" valor={eu?._count.clientes ?? 0} href="/painel/clientes" detalhe="Ver a carteira" />
            <Numero icone={<IconeAtividade />} rotulo="Vendas no mês" valor={vendido.get(u.id)?.n ?? 0} href="/painel/vendas" detalhe="Ver minhas vendas" />
          </>
        )}
      </div>

      {/* Atalhos do dia a dia. */}
      <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {([
          ['/painel/pedidos/novo', 'Novo pedido', 'Monte para a cliente', <IconeRecibo key="p" />],
          ['/painel/sugestoes/nova', 'Nova sugestão', 'Separe peças por link', <IconeBrilho key="s" />],
          ['/painel/clientes/novo', 'Nova cliente', 'Cadastre na carteira', <IconePessoa key="c" />],
          ['/caixa', 'Venda no caixa', 'Balcão da loja', <IconeCaixaLoja key="x" />],
        ] as const).map(([href, t, d, i]) => (
          <Link key={href} href={href} className="group rounded-2xl bg-card border border-borda p-4 flex items-center gap-3 hover:border-marrom-950 transition-colors">
            <span className="size-11 shrink-0 grid place-items-center rounded-xl bg-creme text-caramelo group-hover:bg-marrom-950 group-hover:text-creme transition-colors">{i}</span>
            <span className="min-w-0"><span className="block text-sm font-semibold text-marrom-950">{t}</span><span className="block text-xs text-suave truncate">{d}</span></span>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6 mt-8">
        {!gestor ? (
          <Cartao className="p-5 sm:p-7 content-start">
            <div className="flex justify-between items-center gap-3 mb-5">
              <h2 className="titulo text-2xl flex items-center gap-2">Para responder agora{pendentes > 0 && <span className="h-6 px-2 grid place-items-center rounded-full bg-imperdivel/10 text-imperdivel text-xs font-bold font-[family-name:var(--font-loja)]">{pendentes}</span>}</h2>
              <Link href="/painel/pedidos" className="text-sm font-semibold underline underline-offset-4 decoration-borda-forte hover:decoration-marrom-950">Todos</Link>
            </div>
            {aResponder.length === 0 ? (
              <div className="rounded-2xl bg-creme p-6 text-center grid gap-2 justify-items-center">
                <span className="size-11 rounded-full bg-oliva text-creme grid place-items-center" aria-hidden="true"><IconeCheck className="size-5" /></span>
                <p className="font-semibold text-marrom-950">Tudo respondido!</p>
                <p className="text-sm text-suave">Que tal montar uma sugestão para uma cliente da sua carteira?</p>
                <Link href="/painel/sugestoes/nova" className="text-sm underline underline-offset-4">Nova sugestão</Link>
              </div>
            ) : (
              <ul className="grid gap-2">
                {aResponder.map(p => (
                  <li key={p.id} className="relative flex items-center gap-3 rounded-2xl border border-borda p-2.5 pr-3 hover:border-marrom-950 transition-colors">
                    <span className="flex -space-x-4 shrink-0" aria-hidden="true">
                      {p.itens.slice(0, 2).map((i, n) => <span key={i.id} className="relative w-10 aspect-[3/4] rounded-lg overflow-hidden bg-bege ring-2 ring-card" style={{ zIndex: 2 - n }}><Foto src={i.imagem} alt="" sizes="40px" /></span>)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <Link href={`/painel/pedidos/${p.id}`} className="block font-semibold text-marrom-950 truncate after:absolute after:inset-0 after:rounded-2xl">{p.nomeCliente}</Link>
                      <span className="block text-xs text-suave truncate">{p.codigo} · {p.tipo === 'condicional' ? 'Condicional' : 'Pedido'} · <span className={tempoDesde(p.criadoEm).includes('dia') ? 'text-caramelo font-semibold' : ''}>esperando {tempoDesde(p.criadoEm)}</span></span>
                    </span>
                    <span className="font-display font-extrabold text-sm whitespace-nowrap">{brl(valoresDoPedido(p).total)}</span>
                    {p.telefoneCliente && (
                      <a href={linkWhatsApp(p.telefoneCliente, mensagemContato(p.nomeCliente, p.tipo, p.codigo))} target="_blank" rel="noopener" data-acao="contato" data-pedido={p.id}
                        className="relative z-10 size-9 shrink-0 rounded-full bg-whatsapp text-white grid place-items-center hover:bg-whatsapp-escuro" aria-label={`WhatsApp de ${p.nomeCliente}`}>
                        <IconeWhatsApp className="size-4" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        ) : (
        <Cartao className="p-5 sm:p-7">
          <div className="flex justify-between items-center gap-3 mb-6">
            <h2 className="titulo text-2xl">{gestor ? 'Metas por vendedor' : 'Minha meta'}</h2>
            {gestor && <Link href="/painel/resultados" className="text-sm font-semibold underline underline-offset-4 decoration-borda-forte hover:decoration-marrom-950">Resultados</Link>}
          </div>
          {ranking.length === 0 ? (
            <Vazio>Nenhum vendedor ativo. <Link href="/painel/vendedores/novo" className="underline">Cadastrar</Link></Vazio>
          ) : (
            <ul className="grid gap-5">
              {ranking.map((r, i) => (
                <li key={r.id} className="grid grid-cols-[2.75rem_1fr] gap-3 items-start">
                  <span className={`relative size-11 grid place-items-center rounded-full font-bold ${i === 0 && gestor && r.valor > 0 ? 'bg-caramelo text-creme' : 'bg-creme text-marrom-950'}`}>
                    {r.name[0]}
                    {gestor && r.valor > 0 && i < 3 && <span className="absolute -bottom-1 -right-1 size-5 grid place-items-center rounded-full bg-card text-[0.6rem] font-bold ring-1 ring-borda">{i + 1}º</span>}
                  </span>
                  <div className="min-w-0">
                    <div className="flex justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        {gestor ? <Link href={`/painel/vendedores/${r.id}`} className="font-semibold text-marrom-950 hover:underline">{r.name}</Link> : <div className="font-semibold text-marrom-950">{r.name}</div>}
                        <div className="text-xs" style={{ color: numeroEmUso(r.numeroPrincipal) ? TOM.bom : TOM.ruim }}>
                          {numeroEmUso(r.numeroPrincipal) ? `${r.numeroPrincipal!.apelido} · ${formatarTelefone(r.numeroPrincipal!.telefone)}` : 'Sem número — as clientes falam com o número padrão'} · <Link href={gestor ? `/painel/clientes?vendedor=${r.id}` : '/painel/clientes'} className="underline underline-offset-2">{r._count.clientes} clientes</Link>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-extrabold">{brl(r.valor)} <span className="text-suave font-normal text-sm">/ {r.meta ? brl(r.meta) : 'sem meta'}</span></div>
                        <div className="text-sm font-bold" style={{ color: corDaMeta(r.pct) }}>{Math.round(r.pct)}%</div>
                      </div>
                    </div>
                    <div className="mt-2"><Barra pct={r.pct} cor={corDaMeta(r.pct)} /></div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
        )}

        <div className="grid grid-cols-1 gap-6 content-start">
          {!gestor && <Convite link={`${await urlDoSite()}/cadastro?v=${u.id}`} nome={u.name} />}
          {cfg.historico.ligado && (
            <Cartao className="p-5 sm:p-6">
              <div className="flex justify-between items-center mb-3 gap-3">
                <h2 className="titulo text-xl flex items-center gap-2">Clientes interessados agora{interessados.length > 0 && <span className="h-6 px-2 grid place-items-center rounded-full bg-imperdivel/10 text-imperdivel text-xs font-bold font-[family-name:var(--font-loja)]">{interessados.length}</span>}</h2>
                <Link href="/painel/interesse" className="text-sm font-semibold underline underline-offset-4 decoration-borda-forte hover:decoration-marrom-950">Interesse</Link>
              </div>
              {interessados.length === 0 ? (
                <p className="text-suave text-sm">Nenhuma cliente com sacola aberta ou de olho em uma peça nos últimos 7 dias.</p>
              ) : (
                <ul className="grid grid-cols-1 gap-1">
                  {interessados.map(c => (
                    <li key={c.id} className="-mx-2 px-2 py-2.5 rounded-xl hover:bg-creme flex items-center justify-between gap-3 text-sm">
                      <span className="size-9 shrink-0 grid place-items-center rounded-full bg-creme text-caramelo font-bold">{c.nome[0]}</span>
                      <div className="min-w-0 flex-1">
                        <Link href={`/painel/clientes/${c.id}`} className="font-medium text-marrom-950 hover:underline">{c.nome}</Link>
                        <div className="text-suave text-xs truncate">{c.motivos.join(' · ')}</div>
                        <div className="text-xs text-suave">{tempoDesde(c.ultimoAcessoEm)}{gestor ? ` · ${c.vendedor.name}` : ''}</div>
                      </div>
                      {c.telefone && <a href={linkWhatsApp(c.telefone, `Olá, ${c.nome.split(' ')[0]}! Aqui é da ${nomeDaLoja()}.`)} target="_blank" rel="noopener" className="h-8 px-3 grid place-items-center rounded-full bg-whatsapp text-white text-xs font-semibold shrink-0">WhatsApp</a>}
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>
          )}
          <Cartao className="p-5 sm:p-6">
            <div className="flex justify-between items-center mb-3">
              <h2 className="titulo text-xl">Vendas recentes</h2>
              <Link href="/painel/vendas" className="text-sm font-semibold underline underline-offset-4 decoration-borda-forte hover:decoration-marrom-950">Todas</Link>
            </div>
            {recentes.length === 0 ? (
              <p className="text-suave text-sm">Nenhuma venda registrada neste mês.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-1">
                {recentes.map(v => (
                  <li key={v.id} className="-mx-2 px-2 py-2.5 rounded-xl hover:bg-creme flex items-center justify-between gap-3 text-sm">
                    <span className="size-9 shrink-0 grid place-items-center rounded-full bg-oliva/10 text-oliva"><IconeCheck className="size-4" /></span>
                    <div className="min-w-0 flex-1">
                      {v.cliente ? <Link href={`/painel/clientes/${v.cliente.id}`} className="font-medium text-marrom-950 hover:underline">{v.cliente.nome}</Link> : <div>—</div>}
                      <div className="text-suave text-xs truncate">{formatarData(v.data)} · {v.observacao}{gestor ? ` · ${v.vendedor.name.split(' ')[0]}` : ''}</div>
                    </div>
                    <div className="font-extrabold whitespace-nowrap">{brl(v.valor)}</div>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </div>
      </div>
    </>
  );
}

/** Anel de progresso da meta (até 100% fecha a volta; acima disso, fica cheio). */
function Anel({ pct }: { pct: number }) {
  const r = 42, volta = 2 * Math.PI * r, cheio = Math.min(100, Math.max(0, pct));
  return (
    <div className="relative size-28 sm:size-32 shrink-0" role="img" aria-label={`${Math.round(pct)}% da meta`}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="9" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={pct >= 100 ? '#86efac' : 'var(--color-areia)'} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(cheio / 100) * volta} ${volta}`} />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-center">
        <span><span className="block text-2xl font-extrabold">{Math.round(pct)}%</span><span className="block text-[0.65rem] text-areia -mt-0.5">da meta</span></span>
      </span>
    </div>
  );
}

function Numero({ icone, rotulo, valor, detalhe, href, alerta }: { icone: React.ReactNode; rotulo: string; valor: React.ReactNode; detalhe?: React.ReactNode; href?: string; alerta?: boolean }) {
  const corpo = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs sm:text-sm text-suave leading-tight">{rotulo}</span>
        <span className={`size-9 grid place-items-center rounded-xl ${alerta ? 'bg-imperdivel/10 text-imperdivel' : 'bg-creme text-caramelo'}`}>{icone}</span>
      </div>
      <div className="mt-2 text-xl sm:text-[1.7rem] font-extrabold tracking-tight text-marrom-950 truncate">{valor}</div>
      {detalhe && <div className={`mt-0.5 text-xs ${alerta ? 'text-imperdivel font-medium' : 'text-suave'}`}>{detalhe}</div>}
    </>
  );
  const classe = `min-w-0 rounded-3xl bg-card border p-4 sm:p-5 ${alerta ? 'border-imperdivel/30' : 'border-borda'}`;
  return href ? <Link href={href} className={`${classe} hover:border-marrom-950 transition-colors`}>{corpo}</Link> : <div className={classe}>{corpo}</div>;
}
