import Link from 'next/link';
import { SeletorMes } from '@/components/painel/seletor-mes';
import { CabecalhoPagina, Cartao, Vazio } from '@/components/ui/basicos';
import { formatarData, mesDe, mesValido } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { excluirVenda } from '@/server/acoes/clientes';
import { EQUIPE, exigirPapel } from '@/server/permissoes';
import { vendasDoMes } from '@/server/consultas/vendas';
import { BotaoAcao } from '@/components/ui/botao-acao';

export const metadata = { title: 'Vendas' };

export default async function Vendas({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const u = await exigirPapel(EQUIPE);
  const atual = mesDe();
  const sp = await searchParams;
  const mes = mesValido(sp.mes) && sp.mes <= atual ? sp.mes : atual;
  const vendas = await vendasDoMes(u, mes);
  const total = vendas.reduce((a, v) => a + Number(v.valor), 0);

  return (
    <>
      <CabecalhoPagina sobre="Pedidos confirmados e vendas na loja" titulo="Vendas" acoes={<SeletorMes mes={mes} atual={atual} base="/painel/vendas" />}>
        {vendas.length} {vendas.length === 1 ? 'venda' : 'vendas'} · <strong className="text-marrom-950">{brl(total)}</strong>
      </CabecalhoPagina>
      {vendas.length === 0 ? <Vazio>Nenhuma venda neste mês.</Vazio> : (
        <Cartao className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left rotulo text-suave border-b border-borda">
              <tr><th className="p-4">Data</th><th className="p-4">Cliente</th>{u.papel === 'gestor' && <th className="p-4">Vendedor</th>}<th className="p-4">Origem</th><th className="p-4 text-right">Valor</th><th className="p-4" /></tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {vendas.map(v => (
                <tr key={v.id}>
                  <td className="p-4 whitespace-nowrap">{formatarData(v.data)}</td>
                  <td className="p-4">{v.cliente ? <Link href={`/painel/clientes/${v.cliente.id}`} className="hover:underline">{v.cliente.nome}</Link> : '—'}</td>
                  {u.papel === 'gestor' && <td className="p-4">{v.vendedor.name}</td>}
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
