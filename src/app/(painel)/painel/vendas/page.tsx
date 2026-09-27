import Link from 'next/link';
import { SeletorMes } from '@/components/painel/seletor-mes';
import { CabecalhoPagina, Cartao, Vazio } from '@/components/ui/basicos';
import { formatarData, intervaloDoMes, mesDe, mesValido } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { excluirVenda } from '@/server/acoes/clientes';
import { db } from '@/server/db';
import { EQUIPE, escopoVendedor, exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Vendas' };

export default async function Vendas({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const u = await exigirPapel(EQUIPE);
  const atual = mesDe();
  const sp = await searchParams;
  const mes = mesValido(sp.mes) && sp.mes <= atual ? sp.mes : atual;
  const vendas = await db.venda.findMany({
    where: { data: intervaloDoMes(mes), ...escopoVendedor(u) },
    orderBy: { data: 'desc' },
    include: { cliente: { select: { id: true, nome: true } }, pedido: { select: { id: true, codigo: true } } },
  });
  const vendedores = new Map((await db.user.findMany({ where: { papel: { in: ['vendedor', 'gestor'] } }, select: { id: true, name: true } })).map(v => [v.id, v.name]));
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
                  {u.papel === 'gestor' && <td className="p-4">{vendedores.get(v.vendedorId) ?? '—'}</td>}
                  <td className="p-4">{v.pedido ? <Link href={`/painel/pedidos/${v.pedido.id}`} className="underline">{v.pedido.codigo}</Link> : <span className="text-suave">{v.observacao}</span>}</td>
                  <td className="p-4 text-right font-display font-extrabold whitespace-nowrap">{brl(v.valor)}</td>
                  <td className="p-4 text-right">
                    {!v.pedidoId && (
                      <form action={excluirVenda.bind(null, v.id)}>
                        <button className="rotulo text-vermelho hover:underline" title="Excluir venda manual">Excluir</button>
                      </form>
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
