import Link from 'next/link';
import { SeletorMes } from '@/components/painel/seletor-mes';
import { LinhaFiltro, PainelFiltros } from '@/components/painel/filtros';
import { CabecalhoPagina, Cartao, Etiqueta, Kpi, Vazio } from '@/components/ui/basicos';
import { formatarDataHora, intervaloDoMes, mesDe, mesValido } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { COR_STATUS, descreverMeio, ROTULO_METODO, ROTULO_STATUS, type StatusCobranca } from '@/lib/pagamento';
import { comFiltros } from '@/lib/url';
import { listarCobrancas } from '@/server/consultas/pagamentos';
import { gatewayConfigurado } from '@/server/pagamentos/gateway';
import { exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Pagamentos online' };

const FILTROS: { valor: string | null; rotulo: string }[] = [
  { valor: null, rotulo: 'Todos' }, { valor: 'pagas', rotulo: 'Pagos' }, { valor: 'abertas', rotulo: 'Aguardando' },
  { valor: 'estornada', rotulo: 'Estornados' }, { valor: 'problemas', rotulo: 'Precisam de atenção' },
];
const COR = { oliva: 'oliva', cinza: 'cinza', escuro: 'escuro', vermelho: 'vermelho', padrao: 'bege' } as const;

/** Conferência do pagamento online (docs/27): o que entrou, taxas, líquido, abertos e o que precisa de atenção. */
export default async function Pagamentos({ searchParams }: { searchParams: Promise<{ mes?: string; status?: string; pagina?: string }> }) {
  const u = await exigirPapel(['gestor']);
  const sp = await searchParams;
  const atual = mesDe();
  const mes = mesValido(sp.mes) && sp.mes <= atual ? sp.mes : atual;
  const { gte, lt } = intervaloDoMes(mes);
  const status = FILTROS.some(f => f.valor === sp.status) ? (sp.status as StatusCobranca) : null;
  const pagina = Math.max(1, Math.min(20, Number(sp.pagina) || 1));
  const { lista, total, resumo } = await listarCobrancas(u, { status, de: gte, ate: lt, pagina });
  const url = (mudar: Record<string, string | null>) => comFiltros('/painel/pagamentos', { mes: sp.mes ?? null, status }, mudar);

  return (
    <>
      <CabecalhoPagina sobre="Mercado Pago" titulo="Pagamentos online" acoes={<SeletorMes mes={mes} atual={atual} base={status ? `/painel/pagamentos?status=${status}` : '/painel/pagamentos'} />}>
        {resumo.pagamentos} {resumo.pagamentos === 1 ? 'pagamento aprovado' : 'pagamentos aprovados'} no mês
      </CabecalhoPagina>
      <p className="mb-4 text-xs text-suave">Tarifas e líquido como o Mercado Pago informa em cada order. Confira com o relatório de liberações do Mercado Pago, que é o valor que cai na conta.</p>
      {!gatewayConfigurado() && <p className="mb-4 text-sm text-vermelho">As credenciais do Mercado Pago não estão no servidor: nenhuma cobrança nova pode ser criada.</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi rotulo="Recebido" valor={brl(resumo.bruto)} detalhe={resumo.porMeio.map(m => `${ROTULO_METODO[m.metodo]}: ${brl(m.valor)}`).join(' · ') || '—'} tom="escuro" />
        <Kpi rotulo="Tarifas informadas pelo MP" valor={brl(resumo.taxas)} detalhe={resumo.bruto ? `${((resumo.taxas / resumo.bruto) * 100).toFixed(1).replace('.', ',')}% do recebido` : undefined} />
        <Kpi rotulo="Estornado" valor={brl(resumo.estornado)} />
        <Kpi rotulo="Líquido" valor={brl(resumo.liquido)} detalhe={`${resumo.abertas.quantidade} aguardando (${brl(resumo.abertas.valor)})`} tom="oliva" />
      </div>

      <PainelFiltros>
        <LinhaFiltro rotulo="Situação" opcoes={FILTROS.map(f => ({ rotulo: f.rotulo, href: url({ status: f.valor, pagina: null }), ativo: status === f.valor }))} />
      </PainelFiltros>

      {lista.length === 0 ? <Vazio>Nenhuma cobrança neste mês{status ? ' com esta situação' : ''}.</Vazio> : (
        <Cartao className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left rotulo text-suave border-b border-borda">
              <tr><th className="p-4">Criada</th><th className="p-4">Pedido</th><th className="p-4">Meio</th><th className="p-4">Situação</th><th className="p-4 text-right">Valor</th><th className="p-4 text-right" title="Como o Mercado Pago informa na order; confira com o extrato.">Tarifa</th></tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {lista.map(c => (
                <tr key={c.id}>
                  <td className="p-4 whitespace-nowrap">{formatarDataHora(c.criadaEm)}</td>
                  <td className="p-4"><Link href={`/painel/pedidos/${c.pedido.id}`} className="underline underline-offset-4">{c.pedido.codigo}</Link><div className="text-suave">{c.pedido.nomeCliente} · {c.pedido.vendedor.name.split(' ')[0]}</div></td>
                  <td className="p-4">{c.paga || c.status === 'estornada' ? descreverMeio(c) : ROTULO_METODO[c.metodo]}</td>
                  <td className="p-4"><div className="flex flex-wrap gap-1"><Etiqueta cor={COR[COR_STATUS[c.status]]}>{ROTULO_STATUS[c.status]}</Etiqueta>{c.semEstoque && <Etiqueta cor="vermelho">Peça esgotada</Etiqueta>}</div>{c.aprovadaEm && <div className="text-suave text-xs mt-1">pago {formatarDataHora(c.aprovadaEm)}</div>}</td>
                  <td className="p-4 text-right font-display font-extrabold whitespace-nowrap">{brl(c.valor)}{c.valorEstornado > 0 && <div className="text-xs font-normal text-suave">−{brl(c.valorEstornado)} estornado</div>}</td>
                  <td className="p-4 text-right whitespace-nowrap text-suave">{c.taxa != null ? brl(c.taxa) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {lista.length < total && <div className="p-4 text-center"><Link href={url({ pagina: String(pagina + 1) })} className="underline underline-offset-4">Carregar mais ({total - lista.length})</Link></div>}
        </Cartao>
      )}
    </>
  );
}
