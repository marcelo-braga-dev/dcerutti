import Link from 'next/link';
import { Cartao, Kpi } from '@/components/ui/basicos';
import { brl } from '@/lib/dinheiro';
import type { conversaoSugestoes } from '@/server/sugestoes';

type Conversao = Awaited<ReturnType<typeof conversaoSugestoes>>;
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');

/**
 * Funil das sugestões enviadas (D-27, fase 2): enviados → vistos → respondidos → viraram pedido, e o valor vendido
 * (pedidos confirmados). Com `porVendedor`, a tabela por vendedor (para o gestor).
 */
export function FunilSugestoes({ c, periodo, porVendedor }: { c: Conversao; periodo: string; porVendedor?: boolean }) {
  const t = c.total;
  return (
    <Cartao className="p-5 sm:p-6 overflow-x-auto">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-5">
        <h2 className="titulo text-lg">Sugestões enviadas · {periodo}</h2>
        <Link href="/painel/sugestoes" className="rotulo text-suave underline underline-offset-4">Ver sugestões</Link>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <Kpi rotulo="Enviados" valor={String(t.enviados)} detalhe="Sugestões com o link mandado" />
        <Kpi rotulo="Vistos" valor={String(t.vistos)} detalhe={`${pct(t.vistos, t.enviados)} dos enviados`} />
        <Kpi rotulo="Respondidos" valor={String(t.respondidos)} detalhe={`${pct(t.respondidos, t.enviados)} dos enviados`} />
        <Kpi rotulo="Viraram pedido" valor={String(t.pedidos)} detalhe={`${pct(t.pedidos, t.enviados)} de conversão`} tom="oliva" />
        <Kpi rotulo="Vendido" valor={brl(t.vendido)} detalhe="Pedidos confirmados" tom="escuro" />
      </div>
      {porVendedor && c.porVendedor.length > 0 && (
        <table className="w-full text-sm min-w-[560px] mt-6">
          <thead className="text-left rotulo text-suave border-b border-borda"><tr><th className="py-2">Vendedor</th><th>Enviados</th><th>Vistos</th><th>Respondidos</th><th>Pedidos</th><th>Conversão</th><th className="text-right">Vendido</th></tr></thead>
          <tbody className="divide-y divide-borda">
            {c.porVendedor.map(v => (
              <tr key={v.id}>
                <td className="py-2"><Link href={`/painel/sugestoes?vendedor=${v.id}`} className="font-semibold text-marrom-950 hover:underline">{v.nome}</Link></td>
                <td>{v.enviados}</td><td>{v.vistos}</td><td>{v.respondidos}</td><td>{v.pedidos}</td><td>{pct(v.pedidos, v.enviados)}</td>
                <td className="text-right font-display font-bold">{brl(v.vendido)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Cartao>
  );
}
