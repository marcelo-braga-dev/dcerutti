import Link from 'next/link';
import { Foto } from '@/components/loja/foto';
import { CabecalhoPagina, Cartao, Vazio } from '@/components/ui/basicos';
import { EtiquetaStatus, EtiquetaTipo } from '@/components/ui/status-pedido';
import { formatarData } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { casaBusca, termosDeBusca } from '@/lib/catalogo';
import { catalogo } from '@/server/catalogo';
import { listarClientes } from '@/server/consultas/clientes';
import { listarPedidos } from '@/server/consultas/pedidos';
import { EQUIPE, exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Busca' };

/** Busca geral da barra superior (D-28): clientes, pedidos e peças de uma vez, com o escopo de quem busca. */
export default async function Busca({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const u = await exigirPapel(EQUIPE);
  const q = String((await searchParams).q ?? '').trim().slice(0, 80);
  const termos = termosDeBusca(q);
  const [clientes, pedidos, pecas] = q.length < 2 ? [null, null, []] : await Promise.all([
    listarClientes(u, q, 1),
    listarPedidos(u, { status: 'todos', q, pagina: 1 }),
    catalogo().then(l => l.filter(p => casaBusca(p, termos)).slice(0, 12)),
  ]);

  return (
    <>
      <CabecalhoPagina sobre="Busca" titulo={q ? `“${q}”` : 'Buscar'}>Clientes por nome, WhatsApp, CPF ou cidade; pedidos pelo código ou pela cliente; peças por nome, referência ou cor.</CabecalhoPagina>
      <form className="flex max-w-lg mb-8">
        <input name="q" defaultValue={q} autoFocus placeholder="Buscar cliente, pedido ou peça…" aria-label="Buscar" className="flex-1 min-w-0 h-11 px-3 border border-borda-forte bg-card outline-none focus:border-marrom-950" />
        <button className="h-11 px-4 bg-marrom-950 text-creme rotulo">Buscar</button>
      </form>
      {q.length < 2 ? <Vazio>Digite pelo menos 2 letras.</Vazio> : (
        <div className="grid xl:grid-cols-3 gap-6 items-start">
          <Bloco titulo={`Clientes (${clientes!.total})`} mais={clientes!.total > 0 ? `/painel/clientes?q=${encodeURIComponent(q)}` : null}>
            {clientes!.clientes.slice(0, 10).map(c => (
              <Link key={c.id} href={`/painel/clientes/${c.id}`} className="block px-4 py-2.5 hover:bg-bege text-sm">
                <span className="font-semibold text-marrom-950">{c.nome}</span>
                <span className="block text-xs text-suave">{c.telefone}{u.papel === 'gestor' ? ` · ${c.vendedor.name.split(' ')[0]}` : ''}</span>
              </Link>
            ))}
          </Bloco>
          <Bloco titulo={`Pedidos (${pedidos!.total})`} mais={pedidos!.total > 0 ? `/painel/pedidos?status=todos&q=${encodeURIComponent(q)}` : null}>
            {pedidos!.pedidos.slice(0, 10).map(p => (
              <Link key={p.id} href={`/painel/pedidos/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-bege text-sm">
                <span className="min-w-0"><span className="font-display font-bold">{p.codigo}</span> <EtiquetaTipo tipo={p.tipo} /> <EtiquetaStatus status={p.status} />
                  <span className="block text-xs text-suave truncate">{p.nomeCliente} · {formatarData(p.criadoEm)}</span></span>
                <span className="font-display font-bold whitespace-nowrap">{brl(p.total)}</span>
              </Link>
            ))}
          </Bloco>
          <Bloco titulo={`Peças (${pecas.length}${pecas.length === 12 ? '+' : ''})`} mais={null}>
            {pecas.map(p => (
              <Link key={p.id} href={u.papel === 'gestor' ? `/painel/produtos/${p.id}` : `/produto/${p.referencia}`} className="flex items-center gap-3 px-4 py-2 hover:bg-bege text-sm">
                <span className="relative w-9 h-12 bg-bege overflow-hidden shrink-0"><Foto src={p.imagens[0] ?? null} alt="" sizes="36px" className="!text-[0.45rem]" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-marrom-950">{p.nome}</span><span className="text-xs text-suave">Ref. {p.referencia} · {p.variantes.reduce((a, v) => a + v.disponivel, 0)} em estoque</span></span>
                <span className="font-display font-bold whitespace-nowrap">{brl(p.preco)}</span>
              </Link>
            ))}
          </Bloco>
        </div>
      )}
    </>
  );
}

function Bloco({ titulo, mais, children }: { titulo: string; mais: string | null; children: React.ReactNode }) {
  const vazio = !(Array.isArray(children) ? children.length : children);
  return (
    <Cartao className="divide-y divide-borda">
      <div className="flex items-baseline justify-between px-4 py-3"><h2 className="titulo text-base">{titulo}</h2>{mais && <Link href={mais} className="rotulo !text-[0.6rem] underline underline-offset-4">Ver todos</Link>}</div>
      {vazio ? <p className="px-4 py-4 text-sm text-suave">Nada encontrado.</p> : children}
    </Cartao>
  );
}
