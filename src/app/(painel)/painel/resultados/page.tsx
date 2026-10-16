import Link from 'next/link';
import { Foto } from '@/components/loja/foto';
import { SeletorMes } from '@/components/painel/seletor-mes';
import { Barra, CabecalhoPagina, Cartao, Kpi, Vazio } from '@/components/ui/basicos';
import { intervaloDoMes, mesDe, mesValido, nomeDoMes } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { exigirPapel } from '@/server/permissoes';
import { resultados, resultadosCupons } from '@/server/relatorios';
import { TOM } from '@/lib/marca';
import { plural } from '@/lib/pedido';

export const metadata = { title: 'Resultados' };

const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`);

export default async function Resultados({ searchParams }: { searchParams: Promise<{ mes?: string; periodo?: string }> }) {
  await exigirPapel(['gestor']);
  const sp = await searchParams;
  const atual = mesDe();
  const tudo = sp.periodo === 'tudo';
  const mes = mesValido(sp.mes) && sp.mes <= atual ? sp.mes : atual;
  const periodo = tudo ? { rotulo: 'Todo o período' } : { rotulo: nomeDoMes(mes), data: intervaloDoMes(mes) };
  const [r, cupons] = await Promise.all([resultados(periodo), resultadosCupons(periodo)]);
  const maxLucroCat = Math.max(1, ...r.porCategoria.map(c => c.lucro));

  return (
    <>
      <CabecalhoPagina sobre={tudo ? 'Todo o período' : nomeDoMes(mes)} titulo="Resultados e lucro"
        acoes={
          <div className="flex flex-wrap gap-2 items-center">
            {!tudo && <SeletorMes mes={mes} atual={atual} base="/painel/resultados" />}
            <Link href={tudo ? '/painel/resultados' : '/painel/resultados?periodo=tudo'} className="px-3 py-2 rotulo border border-borda-forte bg-card">{tudo ? 'Ver por mês' : 'Todo o período'}</Link>
          </div>
        } />

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi rotulo="Faturamento" valor={brl(r.receita)} detalhe={`${plural(r.vendas, 'venda', 'vendas')} · ${plural(r.pecas, 'peça', 'peças')} de pedidos`} />
        <Kpi rotulo="Custo das peças" valor={brl(r.custo)} detalhe={r.semCusto ? `${plural(r.semCusto, 'venda', 'vendas')} sem custo (${plural(r.manuais, 'manual', 'manuais')})` : 'Todas as vendas com custo'} />
        <Kpi rotulo="Lucro bruto" valor={brl(r.lucro)} detalhe="Receita menos custo das peças" tom="escuro" />
        <Kpi rotulo="Margem" valor={pct(r.margem)} detalhe="Sobre as vendas com custo" tom="oliva" />
      </div>

      {r.vendas === 0 ? <div className="mt-8"><Vazio>Nenhuma venda no período.</Vazio></div> : (
        <div className="grid xl:grid-cols-2 gap-6 mt-8">
          <Cartao className="p-5 sm:p-6">
            <h2 className="titulo text-lg mb-5">Por vendedor</h2>
            <ul className="grid gap-5">
              {r.porVendedor.map(v => (
                <li key={v.chave}>
                  <div className="flex justify-between gap-3 text-sm">
                    <Link href={`/painel/vendedores/${v.chave}`} className="font-semibold text-marrom-950 hover:underline">{v.nome}</Link>
                    <span>{brl(v.receita)} · lucro <strong>{brl(v.lucro)}</strong> · {pct(v.margem)}</span>
                  </div>
                  <div className="mt-2 h-2 flex bg-bege">
                    <div className="bg-caramelo" style={{ width: `${v.receita ? (v.custo / v.receita) * 100 : 0}%` }} title="Custo" />
                    <div className="bg-oliva" style={{ width: `${v.receita ? (Math.max(0, v.lucro) / v.receita) * 100 : 0}%` }} title="Lucro" />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-suave"><span className="inline-block size-2 bg-caramelo" /> custo · <span className="inline-block size-2 bg-oliva" /> lucro · parte clara = vendas sem custo (manuais)</p>
          </Cartao>

          <Cartao className="p-5 sm:p-6">
            <h2 className="titulo text-lg mb-5">Lucro por categoria</h2>
            {r.porCategoria.length === 0 ? <p className="text-sm text-suave">Sem pedidos confirmados no período.</p> : (
              <ul className="grid gap-4">
                {r.porCategoria.map(c => (
                  <li key={c.chave}>
                    <div className="flex justify-between text-sm"><span>{c.nome} <span className="text-suave">· {plural(c.n, 'peça', 'peças')}</span></span><strong>{brl(c.lucro)}</strong></div>
                    <div className="mt-1"><Barra pct={(Math.max(0, c.lucro) / maxLucroCat) * 100} cor={TOM.bom} /></div>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>

          <Cartao className="p-5 sm:p-6 xl:col-span-2 overflow-x-auto">
            <h2 className="titulo text-lg mb-5">Produtos que mais deram lucro</h2>
            {r.porProduto.length === 0 ? <p className="text-sm text-suave">Sem pedidos confirmados no período.</p> : (
              <table className="w-full text-sm min-w-[640px]">
                <thead className="text-left rotulo text-suave border-b border-borda"><tr><th className="py-2">Produto</th><th>Peças</th><th>Receita</th><th>Custo</th><th>Lucro</th><th>Margem</th></tr></thead>
                <tbody className="divide-y divide-borda">
                  {r.porProduto.map(p => (
                    <tr key={p.chave}>
                      <td className="py-2">
                        <div className="flex gap-3 items-center">
                          <div className="relative w-9 aspect-[3/4] bg-bege shrink-0"><Foto src={p.imagem} alt="" sizes="36px" /></div>
                          <div><div className="text-marrom-950">{p.nome}</div><div className="text-xs text-suave">{p.extra}</div></div>
                        </div>
                      </td>
                      <td>{p.n}</td><td>{brl(p.receita)}</td><td>{brl(p.custo)}</td><td className="font-bold">{brl(p.lucro)}</td><td>{pct(p.margem)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Cartao>
        </div>
      )}

      {(cupons.pedidos > 0 || cupons.proxima.gerados > 0) && (
        <Cartao className="p-5 sm:p-6 mt-6 overflow-x-auto">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-5">
            <h2 className="titulo text-lg">Cupons</h2>
            <Link href="/painel/cupons" className="rotulo text-suave underline underline-offset-4">Ver cupons</Link>
          </div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
            <Kpi rotulo="Pedidos com cupom" valor={String(cupons.pedidos)} detalhe={cupons.totalPedidos ? `${pct(cupons.pedidos / cupons.totalPedidos)} dos pedidos confirmados` : 'Nenhum pedido confirmado'} />
            <Kpi rotulo="Desconto dado" valor={brl(cupons.desconto)} detalhe={cupons.fretes ? `e ${plural(cupons.fretes, 'frete grátis', 'fretes grátis')}` : 'Nas peças'} />
            <Kpi rotulo="Faturamento com cupom" valor={brl(cupons.receita)} detalhe="Vendas já com o desconto" tom="escuro" />
            <Kpi rotulo="Próxima compra" valor={`${cupons.proxima.voltaram} de ${cupons.proxima.gerados}`}
              detalhe={cupons.proxima.gerados ? `cupons gerados no período voltaram como venda (${pct(cupons.proxima.voltaram / cupons.proxima.gerados)}) · ${brl(cupons.proxima.receita)}` : 'Nenhum cupom gerado no período'} tom="oliva" />
          </div>
          {cupons.porCupom.length === 0 ? <p className="text-sm text-suave">Nenhum pedido confirmado com cupom no período.</p> : (
            <table className="w-full text-sm min-w-[640px]">
              <thead className="text-left rotulo text-suave border-b border-borda"><tr><th className="py-2">Cupom</th><th>Pedidos</th><th>Desconto</th><th>Fretes grátis</th><th>Faturamento</th><th>Lucro</th><th>Margem</th></tr></thead>
              <tbody className="divide-y divide-borda">
                {cupons.porCupom.map(c => (
                  <tr key={c.chave}>
                    <td className="py-2">
                      <span className="font-display font-bold tracking-wide text-marrom-950">{c.nome}</span>
                      {c.origem === 'primeiraCompra' && <span className="text-xs text-suave"> · primeira compra</span>}
                    </td>
                    <td>{c.pedidos}</td><td>{brl(c.desconto)}</td><td>{c.fretes || '—'}</td><td>{brl(c.receita)}</td><td className="font-bold">{brl(c.lucro)}</td><td>{pct(c.margem)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-4 text-xs text-suave">Pedidos confirmados no período. Lucro e margem sobre as vendas com custo; o desconto do vendedor já está no preço das peças.</p>
        </Cartao>
      )}
    </>
  );
}
