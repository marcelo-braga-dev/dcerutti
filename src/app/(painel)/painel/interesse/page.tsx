import Link from 'next/link';
import { Foto } from '@/components/loja/foto';
import { Alerta, Barra, CabecalhoPagina, Cartao, Kpi, Vazio } from '@/components/ui/basicos';
import { tempoDesde } from '@/lib/atividade';
import { formatarData } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { lerConfig } from '@/server/config';
import { EQUIPE, exigirPapel } from '@/server/permissoes';
import { relatorioInteresse } from '@/server/consultas/navegacao';

export const metadata = { title: 'Interesse' };

const PERIODOS = [7, 30, 90] as const;
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Histórico do cliente (docs/21): o que as clientes veem, procuram e separam. O vendedor vê as clientes dele. */
export default async function Interesse({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const u = await exigirPapel(EQUIPE);
  const gestor = u.papel === 'gestor';
  const pedido = Number((await searchParams).dias);
  const dias = PERIODOS.find(p => p === pedido) ?? 30;
  const [r, cfg] = await Promise.all([relatorioInteresse(u, dias), lerConfig()]);
  const maxDia = Math.max(1, ...r.porDia.map(d => d.n));

  return (
    <>
      <CabecalhoPagina sobre={gestor ? 'Todas as clientes' : 'Minhas clientes'} titulo="Interesse na loja"
        acoes={
          <div className="flex gap-2" aria-label="Período">
            {PERIODOS.map(p => (
              <Link key={p} href={`/painel/interesse?dias=${p}`} className={`px-3 py-2 rotulo border ${p === dias ? 'bg-marrom-950 text-creme border-marrom-950' : 'border-borda-forte bg-card'}`}>{p} dias</Link>
            ))}
          </div>
        }>
        Peças vistas, buscas e sacolas das clientes nos últimos {dias} dias.
      </CabecalhoPagina>

      {!cfg.historico.ligado && <div className="mb-6"><Alerta tipo="aviso">O registro da navegação está desligado em Configurações. Os dados abaixo são de antes.</Alerta></div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi rotulo="Clientes que acessaram" valor={r.kpis.clientesAtivas} />
        <Kpi rotulo="Visitas" valor={r.kpis.visitas} detalhe={r.aparelhos.map(a => `${a.valor} ${pct(a.parte)}`).join(' · ') || undefined} />
        <Kpi rotulo="Peças vistas" valor={r.kpis.vistas} />
        <Kpi rotulo="Sacolas abertas agora" valor={r.kpis.sacolasAbertas} detalhe={<Link href="/painel/clientes?sacola=1" className="underline">Ver clientes</Link>} tom={r.kpis.sacolasAbertas ? 'escuro' : 'claro'} />
      </div>

      {r.kpis.clientesAtivas === 0 ? <div className="mt-8"><Vazio>Nenhuma navegação registrada no período.</Vazio></div> : (
        <div className="grid xl:grid-cols-[1.4fr_1fr] gap-6 mt-8 items-start">
          <Cartao className="p-5 sm:p-6 overflow-x-auto">
            <h2 className="titulo text-lg mb-1">Peças mais vistas</h2>
            <p className="text-sm text-suave mb-4">Vistas → clientes diferentes → postas na sacola → pedidas no período.</p>
            <table className="w-full text-sm">
              <thead><tr className="text-left rotulo !text-[0.6rem] text-suave">
                <th className="pb-2">Peça</th>
                {['Vistas', 'Clientes', 'Sacola', 'Pedidas'].map(t => <th key={t} className="pb-2 pl-4 text-right whitespace-nowrap">{t}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-borda">
                {r.produtos.map(x => (
                  <tr key={x.produto.id}>
                    <td className="py-2">
                      <div className="flex gap-3 items-center">
                        <div className="relative w-9 aspect-[3/4] bg-bege shrink-0"><Foto src={x.produto.imagem} alt="" sizes="36px" /></div>
                        <div>
                          <Link href={`/produto/${x.produto.referencia}`} target="_blank" className="text-marrom-950 hover:underline">{x.produto.nome}</Link>
                          <div className="text-xs text-suave">{brl(x.produto.preco)} · {x.produto.disponivel ? `${x.produto.disponivel} em estoque` : 'esgotado'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="pl-4 text-right">{x.vistas}</td>
                    <td className="pl-4 text-right">{x.clientes}</td>
                    <td className="pl-4 text-right">{x.sacola}</td>
                    <td className={`pl-4 text-right ${x.pedidas ? 'text-oliva font-semibold' : 'text-suave'}`}>{x.pedidas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Cartao>

          <div className="grid gap-6">
            <Cartao className="p-5 sm:p-6">
              <h2 className="titulo text-lg mb-4">Clientes mais ativas</h2>
              <ul className="divide-y divide-borda">
                {r.maisAtivas.map(c => (
                  <li key={c.id} className="py-2 flex justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <Link href={`/painel/clientes/${c.id}/historico`} className="text-marrom-950 hover:underline">{c.nome}</Link>
                      <div className="text-xs text-suave">{tempoDesde(c.ultimoAcessoEm)}{gestor ? ` · ${c.vendedor}` : ''}</div>
                    </div>
                    <span className="text-suave whitespace-nowrap">{c.paginas} páginas</span>
                  </li>
                ))}
              </ul>
            </Cartao>

            {r.semResultado.length > 0 && (
              <Cartao className="p-5 sm:p-6">
                <h2 className="titulo text-lg mb-1">Buscas sem resultado</h2>
                <p className="text-sm text-suave mb-4">O que procuraram e a loja não tem (ou está com outro nome).</p>
                <Termos itens={r.semResultado} />
              </Cartao>
            )}

            <Cartao className="p-5 sm:p-6">
              <h2 className="titulo text-lg mb-4">Mais buscadas</h2>
              {r.maisBuscadas.length ? <Termos itens={r.maisBuscadas} /> : <p className="text-sm text-suave">Nenhuma busca no período.</p>}
            </Cartao>

            {gestor && r.porVendedor.length > 0 && (
              <Cartao className="p-5 sm:p-6">
                <h2 className="titulo text-lg mb-4">Clientes ativas por vendedor</h2>
                <ul className="grid gap-3 text-sm">
                  {r.porVendedor.map(v => (
                    <li key={v.valor}>
                      <div className="flex justify-between"><span>{v.valor}</span><span className="text-suave">{v.n}</span></div>
                      <div className="mt-1"><Barra pct={v.parte * 100} /></div>
                    </li>
                  ))}
                </ul>
              </Cartao>
            )}

            <Cartao className="p-5 sm:p-6">
              <h2 className="titulo text-lg mb-4">Visitas por dia</h2>
              <ul className="grid gap-1.5 text-sm">
                {r.porDia.map(d => (
                  <li key={d.valor} className="grid grid-cols-[5.5rem_1fr_2rem] gap-2 items-center">
                    <span className="text-suave">{formatarData(`${d.valor}T12:00:00-03:00`)}</span>
                    <Barra pct={(d.n / maxDia) * 100} />
                    <span className="text-right">{d.n}</span>
                  </li>
                ))}
              </ul>
            </Cartao>
          </div>
        </div>
      )}
    </>
  );
}

function Termos({ itens }: { itens: { valor: string; n: number }[] }) {
  return (
    <div className="flex flex-wrap gap-2 text-sm">
      {itens.map(t => <span key={t.valor} className="px-2 py-1 border border-borda">“{t.valor}” <span className="text-suave">· {t.n}</span></span>)}
    </div>
  );
}
