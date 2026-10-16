import Link from 'next/link';
import { SeletorMes } from '@/components/painel/seletor-mes';
import { CabecalhoPagina, Cartao, Vazio } from '@/components/ui/basicos';
import { formatarData, mesDe, mesValido } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { excluirVenda } from '@/server/acoes/clientes';
import { EQUIPE, exigirPapel } from '@/server/permissoes';
import { vendasDoMes } from '@/server/consultas/vendas';
import { listarVendedores } from '@/server/consultas/equipe';
import { LinhaFiltro, PainelFiltros } from '@/components/painel/filtros';
import { comFiltros } from '@/lib/url';
import { BotaoAcao } from '@/components/ui/botao-acao';

export const metadata = { title: 'Vendas' };

export default async function Vendas({ searchParams }: { searchParams: Promise<{ mes?: string; vendedor?: string }> }) {
  const u = await exigirPapel(EQUIPE);
  const atual = mesDe();
  const sp = await searchParams;
  const mes = mesValido(sp.mes) && sp.mes <= atual ? sp.mes : atual;
  const gestor = u.papel === 'gestor';
  const vendedores = gestor ? await listarVendedores(u) : [];
  const vendedor = vendedores.find(v => v.id === sp.vendedor) ?? null;
  const [vendas, todas] = await Promise.all([vendasDoMes(u, mes, vendedor?.id), gestor && vendedor ? vendasDoMes(u, mes) : null]);
  const total = vendas.reduce((a, v) => a + Number(v.valor), 0);
  // Total de cada vendedor no mês (sobre todas as vendas, mesmo com um vendedor escolhido), para o filtro.
  const porVendedor = new Map<string, number>();
  for (const v of todas ?? vendas) porVendedor.set(v.vendedorId, (porVendedor.get(v.vendedorId) ?? 0) + Number(v.valor));
  const url = (mudar: Record<string, string | null>) => comFiltros('/painel/vendas', { mes: sp.mes ?? null, vendedor: vendedor?.id ?? null }, mudar);

  return (
    <>
      <CabecalhoPagina sobre="Pedidos confirmados e vendas na loja" titulo="Vendas" acoes={<SeletorMes mes={mes} atual={atual} base={vendedor ? `/painel/vendas?vendedor=${vendedor.id}` : '/painel/vendas'} />}>
        {vendas.length} {vendas.length === 1 ? 'venda' : 'vendas'} · <strong className="text-marrom-950">{brl(total)}</strong>
      </CabecalhoPagina>
      {gestor && (
        <PainelFiltros>
          <LinhaFiltro rotulo="Vendedor" opcoes={[
            { rotulo: 'Todos', href: url({ vendedor: null }), ativo: !vendedor },
            ...vendedores.filter(v => v.ativo || porVendedor.get(v.id)).map(v => ({ rotulo: `${v.name.split(' ')[0]} · ${brl(porVendedor.get(v.id) ?? 0)}`, href: url({ vendedor: v.id }), ativo: vendedor?.id === v.id })),
          ]} />
          {vendedor && <p className="text-sm self-end h-10 inline-flex items-center gap-1"><Link href={`/painel/vendedores/${vendedor.id}`} className="underline underline-offset-4 text-marrom-950">Perfil de {vendedor.name}</Link> · <Link href={`/painel/clientes?vendedor=${vendedor.id}`} className="underline underline-offset-4 text-marrom-950">clientes</Link></p>}
        </PainelFiltros>
      )}
      {vendas.length === 0 ? <Vazio>Nenhuma venda neste mês.</Vazio> : (
        <Cartao className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left rotulo text-suave border-b border-borda">
              <tr><th className="p-4">Data</th><th className="p-4">Cliente</th>{gestor && <th className="p-4">Vendedor</th>}<th className="p-4">Origem</th><th className="p-4 text-right">Valor</th><th className="p-4" /></tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {vendas.map(v => (
                <tr key={v.id}>
                  <td className="p-4 whitespace-nowrap">{formatarData(v.data)}</td>
                  <td className="p-4">{v.cliente ? <Link href={`/painel/clientes/${v.cliente.id}`} className="hover:underline">{v.cliente.nome}</Link> : '—'}</td>
                  {gestor && <td className="p-4"><Link href={url({ vendedor: v.vendedor.id })} className="hover:underline">{v.vendedor.name}</Link></td>}
                  <td className="p-4">{v.pedido ? <Link href={`/painel/pedidos/${v.pedido.id}`} className="underline">{v.pedido.codigo}</Link> : <span className="text-suave">{v.observacao}</span>}</td>
                  <td className="p-4 text-right font-display font-extrabold whitespace-nowrap">{brl(v.valor)}</td>
                  <td className="p-4 text-right">
                    {!v.pedidoId && (
                      <BotaoAcao acao={excluirVenda.bind(null, v.id)} confirmar="Excluir esta venda manual?" className="rotulo text-vermelho hover:underline">Excluir</BotaoAcao>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Cartao>
      )}
    </>
  );
}
