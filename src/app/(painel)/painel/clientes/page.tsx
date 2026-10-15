import Link from 'next/link';
import { CabecalhoPagina, Cartao, Vazio } from '@/components/ui/basicos';
import { BotaoLink, botao } from '@/components/ui/botao';
import { tempoDesde } from '@/lib/atividade';
import { formatarData, formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { EQUIPE, exigirPapel } from '@/server/permissoes';
import { listarClientes } from '@/server/consultas/clientes';

export const metadata = { title: 'Clientes' };

type Busca = { q?: string; pagina?: string; recentes?: string; sacola?: string; ordem?: string };

export default async function Clientes({ searchParams }: { searchParams: Promise<Busca> }) {
  const u = await exigirPapel(EQUIPE);
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const pagina = Math.min(50, Math.max(1, Number(sp.pagina) || 1));
  const filtro = { recentes: sp.recentes === '1', sacola: sp.sacola === '1', ordem: sp.ordem === 'acesso' ? 'acesso' as const : 'nome' as const };
  const { clientes, total, vendasPorCliente: porCliente } = await listarClientes(u, q, pagina, filtro);
  // Histórico do cliente (docs/21): filtros por acesso recente e sacola aberta.
  const url = (mudar: Partial<Record<keyof Busca, string | null>>) => {
    const p = new URLSearchParams();
    const atual: Record<string, string | null> = { q: q || null, recentes: filtro.recentes ? '1' : null, sacola: filtro.sacola ? '1' : null, ordem: filtro.ordem === 'acesso' ? 'acesso' : null, ...mudar };
    for (const [k, v] of Object.entries(atual)) if (v) p.set(k, v);
    const s = p.toString();
    return `/painel/clientes${s ? `?${s}` : ''}`;
  };
  const chip = (ativo: boolean) => `px-3 py-2 rotulo border ${ativo ? 'bg-marrom-950 text-creme border-marrom-950' : 'border-borda-forte bg-card'}`;

  return (
    <>
      <CabecalhoPagina sobre={`${total} ${total === 1 ? 'cliente' : 'clientes'}`} titulo={u.papel === 'gestor' ? 'Todos os clientes' : 'Meus clientes'}
        acoes={<BotaoLink href="/painel/clientes/novo">+ Novo cliente</BotaoLink>} />
      <form className="flex mb-3 max-w-lg">
        {filtro.recentes && <input type="hidden" name="recentes" value="1" />}
        {filtro.sacola && <input type="hidden" name="sacola" value="1" />}
        {filtro.ordem === 'acesso' && <input type="hidden" name="ordem" value="acesso" />}
        <input name="q" defaultValue={q} placeholder="Nome, telefone, cidade ou endereço" aria-label="Buscar cliente" className="flex-1 h-11 px-3 border border-borda-forte bg-card outline-none focus:border-marrom-950" />
        <button className="h-11 px-4 bg-marrom-950 text-creme rotulo">Buscar</button>
      </form>
      <div className="flex flex-wrap gap-2 mb-6" aria-label="Filtros">
        <Link href={url({ recentes: filtro.recentes ? null : '1' })} className={chip(filtro.recentes)}>Acessaram em 7 dias</Link>
        <Link href={url({ sacola: filtro.sacola ? null : '1' })} className={chip(filtro.sacola)}>Com sacola aberta</Link>
        <Link href={url({ ordem: filtro.ordem === 'acesso' ? null : 'acesso' })} className={chip(filtro.ordem === 'acesso')}>Ordenar por último acesso</Link>
      </div>
      {clientes.length === 0 ? (
        <Vazio>{q || filtro.recentes || filtro.sacola ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda.'}</Vazio>
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
                  {c.userId && (
                    <div className="col-span-2" title={c.ultimoAcessoEm ? formatarDataHora(c.ultimoAcessoEm) : undefined}>
                      <span className="rotulo !text-[0.6rem] text-suave">Último acesso </span>{tempoDesde(c.ultimoAcessoEm)}
                      {c.sacola && <span className="ml-2 rotulo !text-[0.6rem] text-caramelo">Sacola aberta</span>}
                    </div>
                  )}
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
      {total > clientes.length && (
        <div className="mt-6 text-center">
          <p className="text-sm text-suave mb-3">Mostrando {clientes.length} de {total}</p>
          <Link href={url({ pagina: String(pagina + 1) })} scroll={false} className={botao('secundario')}>Carregar mais</Link>
        </div>
      )}
    </>
  );
}
