import Link from 'next/link';
import { Convite } from '@/components/painel/convite';
import { Barra, CabecalhoPagina, Cartao, Kpi, Vazio } from '@/components/ui/basicos';
import { BotaoLink } from '@/components/ui/botao';
import { formatarData, intervaloDoMes, mesDe, nomeDoMes } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { celularValido } from '@/lib/telefone';
import { db } from '@/server/db';
import { EQUIPE, escopoVendedor, exigirPapel } from '@/server/permissoes';
import { corDaMeta, metasDoMes, vendidoPorVendedor } from '@/server/relatorios';
import { urlDoSite } from '@/server/site';

export default async function Resumo() {
  const u = await exigirPapel(EQUIPE);
  const gestor = u.papel === 'gestor';
  const mes = mesDe();
  const vendedores = await db.user.findMany({
    where: { papel: 'vendedor', ativo: true, ...(gestor ? {} : { id: u.id }) },
    select: { id: true, name: true, telefone: true, _count: { select: { clientes: true } } },
    orderBy: { name: 'asc' },
  });
  const [metas, vendido, pendentes, recentes] = await Promise.all([
    metasDoMes(vendedores.map(v => v.id), mes),
    vendidoPorVendedor(mes, gestor ? undefined : u.id),
    db.pedido.count({ where: { status: 'pendente', ...escopoVendedor(u) } }),
    db.venda.findMany({
      where: { data: intervaloDoMes(mes), ...escopoVendedor(u) },
      orderBy: { data: 'desc' },
      take: 8,
      include: { cliente: { select: { nome: true } } },
    }),
  ]);

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
                      <div className="font-semibold text-marrom-950">{r.name}</div>
                      <div className="text-xs" style={{ color: celularValido(r.telefone) ? '#5E6B43' : '#B8462F' }}>
                        {celularValido(r.telefone) ? `WhatsApp ${r.telefone}` : 'WhatsApp incompleto — pedidos vão para a loja'} · {r._count.clientes} clientes
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
                      <div className="text-marrom-950">{v.cliente?.nome ?? '—'}</div>
                      <div className="text-suave">{formatarData(v.data)} · {v.observacao}</div>
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
