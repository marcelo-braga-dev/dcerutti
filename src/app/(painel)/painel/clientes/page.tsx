import Link from 'next/link';
import { CabecalhoPagina, Cartao, Vazio } from '@/components/ui/basicos';
import { BotaoLink, botao } from '@/components/ui/botao';
import { formatarData } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { db } from '@/server/db';
import { EQUIPE, escopoVendedor, exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Clientes' };

export default async function Clientes({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const u = await exigirPapel(EQUIPE);
  const q = ((await searchParams).q ?? '').trim();
  const clientes = await db.cliente.findMany({
    where: {
      ...escopoVendedor(u),
      ...(q ? { OR: [{ nome: { contains: q } }, { telefone: { contains: q } }, { cidade: { contains: q } }, { endereco: { contains: q } }, { email: { contains: q } }] } : {}),
    },
    include: { vendedor: { select: { name: true } } },
    orderBy: { nome: 'asc' },
    take: 300,
  });
  const vendas = await db.venda.groupBy({ by: ['clienteId'], where: { clienteId: { in: clientes.map(c => c.id) } }, _sum: { valor: true }, _max: { data: true } });
  const porCliente = new Map(vendas.map(v => [v.clienteId, v]));

  return (
    <>
      <CabecalhoPagina sobre={`${clientes.length} ${clientes.length === 1 ? 'cliente' : 'clientes'}`} titulo={u.papel === 'gestor' ? 'Todos os clientes' : 'Meus clientes'}
        acoes={<BotaoLink href="/painel/clientes/novo">+ Novo cliente</BotaoLink>} />
      <form className="flex mb-6 max-w-lg">
        <input name="q" defaultValue={q} placeholder="Nome, telefone, cidade ou endereço" aria-label="Buscar cliente" className="flex-1 h-11 px-3 border border-borda-forte bg-card outline-none focus:border-marrom-950" />
        <button className="h-11 px-4 bg-marrom-950 text-creme rotulo">Buscar</button>
      </form>
      {clientes.length === 0 ? (
        <Vazio>{q ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda.'}</Vazio>
      ) : (
        <div className="grid md:grid-cols-2 2xl:grid-cols-3 gap-3">
          {clientes.map(c => {
            const v = porCliente.get(c.id);
            return (
              <Cartao key={c.id} className="p-5 grid gap-3">
                <div className="flex justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/painel/clientes/${c.id}`} className="font-semibold text-marrom-950 hover:underline">{c.nome}</Link>
                    <div className="text-sm text-suave">{c.telefone}</div>
                    <div className="text-sm text-suave truncate">{[c.endereco, c.cidade].filter(Boolean).join(' · ') || '—'}</div>
                  </div>
                  {c.userId && <span className="rotulo !text-[0.6rem] text-oliva shrink-0">Acesso à loja</span>}
                </div>
                {c.preferencias && <div className="text-sm bg-bege px-2 py-1 justify-self-start">{c.preferencias}</div>}
                <div className="grid grid-cols-2 gap-2 text-sm border-t border-borda pt-3">
                  <div><div className="rotulo !text-[0.6rem] text-suave">Total comprado</div>{v?._sum.valor ? brl(v._sum.valor) : '—'}</div>
                  <div><div className="rotulo !text-[0.6rem] text-suave">Última compra</div>{v?._max.data ? formatarData(v._max.data) : 'Sem compras'}</div>
                  {u.papel === 'gestor' && <div className="col-span-2"><span className="rotulo !text-[0.6rem] text-suave">Vendedor </span>{c.vendedor.name}</div>}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Link href={`/painel/pedidos/novo?cliente=${c.id}`} className={botao('oliva', 'p')}>Montar pedido</Link>
                  <Link href={`/painel/clientes/${c.id}`} className={botao('secundario', 'p')}>Ficha</Link>
                </div>
              </Cartao>
            );
          })}
        </div>
      )}
    </>
  );
}
