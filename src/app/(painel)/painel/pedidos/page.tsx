import Link from 'next/link';
import type { Prisma, StatusPedido } from '@prisma/client';
import { Foto } from '@/components/loja/foto';
import { CabecalhoPagina, Cartao, Vazio } from '@/components/ui/basicos';
import { BotaoLink } from '@/components/ui/botao';
import { EtiquetaStatus, EtiquetaTipo } from '@/components/ui/status-pedido';
import { formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { db } from '@/server/db';
import { EQUIPE, escopoVendedor, exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Pedidos' };

const ABAS: [StatusPedido | 'todos', string][] = [['pendente', 'Pendentes'], ['confirmado', 'Confirmados'], ['cancelado', 'Cancelados'], ['todos', 'Todos']];

export default async function Pedidos({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const u = await exigirPapel(EQUIPE);
  const sp = await searchParams;
  const status = (ABAS.find(a => a[0] === sp.status)?.[0] ?? 'pendente') as StatusPedido | 'todos';
  const q = (sp.q ?? '').trim();
  const where: Prisma.PedidoWhereInput = {
    ...escopoVendedor(u),
    ...(status === 'todos' ? {} : { status }),
    ...(q ? { OR: [{ codigo: { contains: q } }, { nomeCliente: { contains: q } }] } : {}),
  };
  const [pedidos, contagens, vendedores] = await Promise.all([
    db.pedido.findMany({ where, orderBy: { criadoEm: 'desc' }, take: 100, include: { itens: { select: { id: true, imagem: true, nome: true, quantidade: true, situacao: true } } } }),
    db.pedido.groupBy({ by: ['status'], where: escopoVendedor(u), _count: true }),
    db.user.findMany({ where: { papel: { in: ['vendedor', 'gestor'] } }, select: { id: true, name: true } }),
  ]);
  const n = (s: string) => (s === 'todos' ? contagens.reduce((a, c) => a + c._count, 0) : contagens.find(c => c.status === s)?._count ?? 0);
  const nomeVendedor = new Map(vendedores.map(v => [v.id, v.name.split(' ')[0]]));

  return (
    <>
      <CabecalhoPagina sobre="Loja online e seleções" titulo="Pedidos" acoes={<BotaoLink href="/painel/pedidos/novo">+ Novo pedido</BotaoLink>} />
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex gap-1 flex-wrap">
          {ABAS.map(([s, rotulo]) => (
            <Link key={s} href={`/painel/pedidos?status=${s}`} className={`px-3 py-2 rotulo border ${status === s ? 'bg-marrom-950 text-creme border-marrom-950' : 'border-borda-forte text-marrom-950 bg-card'}`}>
              {rotulo} ({n(s)})
            </Link>
          ))}
        </div>
        <form className="flex">
          <input type="hidden" name="status" value={status} />
          <input name="q" defaultValue={q} placeholder="Código ou cliente" className="h-10 px-3 border border-borda-forte bg-card outline-none focus:border-marrom-950" aria-label="Buscar pedido" />
          <button className="h-10 px-3 bg-marrom-950 text-creme rotulo">Buscar</button>
        </form>
      </div>

      {pedidos.length === 0 ? (
        <Vazio>Nenhum pedido {status !== 'todos' ? ABAS.find(a => a[0] === status)![1].toLowerCase() : ''}.</Vazio>
      ) : (
        <div className="grid gap-3">
          {pedidos.map(p => (
            <Link key={p.id} href={`/painel/pedidos/${p.id}`} className="block">
              <Cartao className="p-4 sm:p-5 hover:border-marrom-950 transition-colors">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display font-extrabold text-lg">{p.codigo}</span>
                    <EtiquetaTipo tipo={p.tipo} />
                    <EtiquetaStatus status={p.status} />
                    {p.origem === 'vendedor' && <span className="rotulo !text-[0.6rem] text-suave">Seleção do vendedor</span>}
                  </div>
                  <span className="font-display font-extrabold">{brl(p.total)}</span>
                </div>
                <div className="mt-2 text-sm text-suave">
                  <strong className="text-marrom-950">{p.nomeCliente}</strong> · {p.telefoneCliente}{p.cep ? ` · CEP ${p.cep}` : ''} · {formatarDataHora(p.criadoEm)}
                  {u.papel === 'gestor' && <> · Vendedor: {nomeVendedor.get(p.vendedorId) ?? '—'}</>}
                </div>
                <div className="mt-3 flex gap-2 flex-wrap">
                  {p.itens.slice(0, 10).map(i => (
                    <div key={i.id} className={`relative w-12 aspect-[3/4] bg-bege ${i.situacao === 'devolvido' ? 'opacity-40' : ''}`} title={i.nome}>
                      <Foto src={i.imagem} alt="" sizes="48px" />
                    </div>
                  ))}
                  {p.itens.length > 10 && <span className="self-center text-sm text-suave">+{p.itens.length - 10}</span>}
                </div>
              </Cartao>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
