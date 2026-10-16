import Link from 'next/link';
import { after } from 'next/server';
import { Convite } from '@/components/painel/convite';
import { Barra, CabecalhoPagina, Cartao, Kpi, Vazio } from '@/components/ui/basicos';
import { BotaoLink } from '@/components/ui/botao';
import { formatarData, mesDe, nomeDoMes } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { celularValido } from '@/lib/telefone';
import { EQUIPE, exigirPapel } from '@/server/permissoes';
import { corDaMeta, metasDoMes, vendidoPorVendedor } from '@/server/relatorios';
import { urlDoSite } from '@/server/site';
import { vendedoresDoResumo } from '@/server/consultas/equipe';
import { contarPendentes } from '@/server/consultas/pedidos';
import { vendasRecentes } from '@/server/consultas/vendas';
import { interessadosAgora } from '@/server/consultas/navegacao';
import { talvezManutencao } from '@/server/navegacao';
import { lerConfig } from '@/server/config';
import { tempoDesde } from '@/lib/atividade';
import { linkWhatsApp } from '@/lib/whatsapp';
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

  return (
    <>
      <CabecalhoPagina sobre={nomeDoMes(mes)} titulo={gestor ? 'Resumo da equipe' : 'Meu painel'}
        acoes={<BotaoLink href="/painel/pedidos/novo">+ Novo pedido</BotaoLink>} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {gestor ? (
          <>
            <Kpi rotulo="Vendido no mês" valor={brl(totalVendido)} detalhe="Soma de toda a equipe" />
            <Kpi rotulo="Meta da equipe" valor={brl(totalMeta)} detalhe={totalMeta ? `${Math.round((totalVendido / totalMeta) * 100)}% atingido` : 'Defina metas por vendedor'} />
            <Kpi rotulo="Vendedores" valor={ranking.length} detalhe={`${ranking.filter(r => r.meta && r.pct >= 100).length} bateram a meta`} />
            <Kpi rotulo="Pedidos pendentes" valor={pendentes} detalhe={<Link href="/painel/pedidos" className="underline">Ver pedidos</Link>} tom={pendentes ? 'escuro' : 'claro'} />
          </>
        ) : (
          <>
            <Kpi rotulo="Vendido no mês" valor={brl(eu?.valor ?? 0)} detalhe={`${vendido.get(u.id)?.n ?? 0} vendas`} />
            <Kpi rotulo="Minha meta" valor={brl(eu?.meta ?? 0)} detalhe={`${Math.round(eu?.pct ?? 0)}% atingido`} />
            <Kpi rotulo="Falta para a meta" valor={brl(Math.max(0, (eu?.meta ?? 0) - (eu?.valor ?? 0)))} detalhe={(eu?.pct ?? 0) >= 100 ? 'Meta batida!' : 'Continue assim'} tom={(eu?.pct ?? 0) >= 100 ? 'oliva' : 'claro'} />
            <Kpi rotulo="Pedidos pendentes" valor={pendentes} detalhe={<Link href="/painel/pedidos" className="underline">Ver pedidos</Link>} tom={pendentes ? 'escuro' : 'claro'} />
          </>
        )}
      </div>

      <div className="grid xl:grid-cols-[1.4fr_1fr] gap-6 mt-8">
        <Cartao className="p-5 sm:p-6">
          <h2 className="titulo text-lg mb-5">{gestor ? 'Metas por vendedor' : 'Minha meta'}</h2>
          {ranking.length === 0 ? (
            <Vazio>Nenhum vendedor ativo. <Link href="/painel/vendedores/novo" className="underline">Cadastrar</Link></Vazio>
          ) : (
            <ul className="grid gap-6">
              {ranking.map(r => (
                <li key={r.id}>
                  <div className="flex justify-between gap-3 flex-wrap">
                    <div>
                      {gestor ? <Link href={`/painel/vendedores/${r.id}`} className="font-semibold text-marrom-950 hover:underline">{r.name}</Link> : <div className="font-semibold text-marrom-950">{r.name}</div>}
                      <div className="text-xs" style={{ color: celularValido(r.telefone) ? TOM.bom : TOM.ruim }}>
                        {celularValido(r.telefone) ? `WhatsApp ${r.telefone}` : 'WhatsApp incompleto — pedidos vão para a loja'} · <Link href={gestor ? `/painel/clientes?vendedor=${r.id}` : '/painel/clientes'} className="underline underline-offset-2">{r._count.clientes} clientes</Link>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-display font-extrabold">{brl(r.valor)} <span className="text-suave font-normal text-sm">/ {r.meta ? brl(r.meta) : 'sem meta'}</span></div>
                      <div className="text-sm font-bold" style={{ color: corDaMeta(r.pct) }}>{Math.round(r.pct)}%</div>
                    </div>
                  </div>
                  <div className="mt-2"><Barra pct={r.pct} cor={corDaMeta(r.pct)} /></div>
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        <div className="grid gap-6 content-start">
          {!gestor && <Convite link={`${await urlDoSite()}/cadastro?v=${u.id}`} nome={u.name} />}
          {cfg.historico.ligado && (
            <Cartao className="p-5 sm:p-6">
              <div className="flex justify-between items-center mb-4 gap-3">
                <h2 className="titulo text-lg">Clientes interessados agora</h2>
                <Link href="/painel/interesse" className="rotulo underline underline-offset-4">Interesse</Link>
              </div>
              {interessados.length === 0 ? (
                <p className="text-suave text-sm">Nenhuma cliente com sacola aberta ou de olho em uma peça nos últimos 7 dias.</p>
              ) : (
                <ul className="divide-y divide-borda">
                  {interessados.map(c => (
                    <li key={c.id} className="py-3 flex justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <Link href={`/painel/clientes/${c.id}`} className="text-marrom-950 hover:underline">{c.nome}</Link>
                        <div className="text-suave">{c.motivos.join(' · ')}</div>
                        <div className="text-xs text-suave">{tempoDesde(c.ultimoAcessoEm)}{gestor ? ` · ${c.vendedor.name}` : ''}</div>
                      </div>
                      {c.telefone && <a href={linkWhatsApp(c.telefone, `Olá, ${c.nome.split(' ')[0]}! Aqui é da ${nomeDaLoja()}.`)} target="_blank" rel="noopener" className="rotulo !text-[0.62rem] text-oliva underline underline-offset-4 shrink-0">WhatsApp</a>}
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>
          )}
          <Cartao className="p-5 sm:p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="titulo text-lg">Vendas recentes</h2>
              <Link href="/painel/vendas" className="rotulo underline underline-offset-4">Todas</Link>
            </div>
            {recentes.length === 0 ? (
              <p className="text-suave text-sm">Nenhuma venda registrada neste mês.</p>
            ) : (
              <ul className="divide-y divide-borda">
                {recentes.map(v => (
                  <li key={v.id} className="py-3 flex justify-between gap-3 text-sm">
                    <div>
                      {v.cliente ? <Link href={`/painel/clientes/${v.cliente.id}`} className="text-marrom-950 hover:underline">{v.cliente.nome}</Link> : <div>—</div>}
                      <div className="text-suave">{formatarData(v.data)} · {v.observacao}{gestor ? ` · ${v.vendedor.name.split(' ')[0]}` : ''}</div>
                    </div>
                    <div className="font-display font-extrabold whitespace-nowrap">{brl(v.valor)}</div>
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
