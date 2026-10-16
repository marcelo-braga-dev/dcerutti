import Link from 'next/link';
import { LinhaFiltro, PainelFiltros } from '@/components/painel/filtros';
import { CabecalhoPagina, Cartao, Vazio } from '@/components/ui/basicos';
import { BotaoLink, botao } from '@/components/ui/botao';
import { tempoDesde } from '@/lib/atividade';
import { formatarData, formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { comFiltros } from '@/lib/url';
import { linkWhatsApp } from '@/lib/whatsapp';
import { EQUIPE, exigirPapel } from '@/server/permissoes';
import { listarClientes, type FiltroClientes } from '@/server/consultas/clientes';
import { listarVendedores } from '@/server/consultas/equipe';
import { marcaAtual } from '@/server/marca';

export const metadata = { title: 'Clientes' };

type Busca = { q?: string; pagina?: string; recentes?: string; sacola?: string; ordem?: string; vendedor?: string; compra?: string; acesso?: string; ver?: string };

const COMPRAS = [['nunca', 'Nunca compraram'], ['recente', 'Compraram em 30 dias'], ['parada', 'Sem comprar há 90 dias']] as const;
const ORDENS = [['nome', 'Nome'], ['total', 'Total comprado'], ['compra', 'Última compra'], ['acesso', 'Último acesso']] as const;

export default async function Clientes({ searchParams }: { searchParams: Promise<Busca> }) {
  const u = await exigirPapel(EQUIPE);
  const gestor = u.papel === 'gestor';
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const pagina = Math.min(50, Math.max(1, Number(sp.pagina) || 1));
  const filtro: FiltroClientes = {
    vendedor: gestor ? sp.vendedor || null : null,
    compra: COMPRAS.some(c => c[0] === sp.compra) ? (sp.compra as FiltroClientes['compra']) : null,
    acesso: sp.acesso === 'com' || sp.acesso === 'sem' ? sp.acesso : null,
    recentes: sp.recentes === '1',
    sacola: sp.sacola === '1',
    ordem: ORDENS.some(o => o[0] === sp.ordem) ? (sp.ordem as FiltroClientes['ordem']) : 'nome',
  };
  const agrupar = gestor && sp.ver === 'vendedor' && !filtro.vendedor;
  const [{ clientes, total, vendasPorCliente: porCliente, porVendedor }, vendedores, loja] = await Promise.all([
    listarClientes(u, q, pagina, filtro),
    gestor ? listarVendedores(u) : Promise.resolve([]),
    marcaAtual(),
  ]);

  // Filtros no endereço: dá para guardar, voltar e mandar o link para alguém da equipe.
  const atual: Record<string, string | null> = {
    q: q || null, vendedor: filtro.vendedor ?? null, compra: filtro.compra ?? null, acesso: filtro.acesso ?? null,
    recentes: filtro.recentes ? '1' : null, sacola: filtro.sacola ? '1' : null, ordem: filtro.ordem === 'nome' ? null : filtro.ordem!, ver: agrupar ? 'vendedor' : null,
  };
  const url = (mudar: Record<string, string | null>) => comFiltros('/painel/clientes', atual, mudar);
  const algumFiltro = Object.entries(atual).some(([k, v]) => v && k !== 'ordem' && k !== 'ver');
  const vendedorAtual = vendedores.find(v => v.id === filtro.vendedor);
  const somaVendedores = [...porVendedor.values()].reduce((a, n) => a + n, 0);

  const grupos = agrupar
    ? vendedores.map(v => ({ v, lista: clientes.filter(c => c.vendedorId === v.id) })).filter(g => g.lista.length)
    : [{ v: null, lista: clientes }];

  return (
    <>
      <CabecalhoPagina sobre={`${total} ${total === 1 ? 'cliente' : 'clientes'}${vendedorAtual ? ` de ${vendedorAtual.name}` : ''}`}
        titulo={gestor ? (vendedorAtual ? `Clientes de ${vendedorAtual.name.split(' ')[0]}` : 'Todos os clientes') : 'Meus clientes'}
        acoes={<>
          {vendedorAtual && <Link href={`/painel/vendedores/${vendedorAtual.id}`} className={botao('secundario')}>Perfil de {vendedorAtual.name.split(' ')[0]}</Link>}
          <BotaoLink href="/painel/clientes/novo">+ Novo cliente</BotaoLink>
        </>} />

      <form className="flex mb-3 max-w-lg">
        {Object.entries(atual).filter(([k, v]) => v && k !== 'q').map(([k, v]) => <input key={k} type="hidden" name={k} value={v!} />)}
        <input name="q" defaultValue={q} placeholder="Nome, WhatsApp, CPF, cidade ou endereço" aria-label="Buscar cliente" className="flex-1 min-w-0 h-11 px-3 border border-borda-forte bg-card outline-none focus:border-marrom-950" />
        <button className="h-11 px-4 bg-marrom-950 text-creme rotulo">Buscar</button>
      </form>

      <PainelFiltros limpar={algumFiltro ? '/painel/clientes' : null}>
        {gestor && (
          <LinhaFiltro rotulo="Vendedor" opcoes={[
            { rotulo: 'Todos', href: url({ vendedor: null }), ativo: !filtro.vendedor, n: somaVendedores },
            ...vendedores.filter(v => v.ativo || porVendedor.get(v.id)).map(v => ({ rotulo: v.name.split(' ')[0] + (v.ativo ? '' : ' (inativo)'), href: url({ vendedor: v.id, ver: null }), ativo: filtro.vendedor === v.id, n: porVendedor.get(v.id) ?? 0 })),
          ]} />
        )}
        <LinhaFiltro rotulo="Compras" opcoes={[
          { rotulo: 'Todas as clientes', href: url({ compra: null }), ativo: !filtro.compra },
          ...COMPRAS.map(([k, r]) => ({ rotulo: r, href: url({ compra: k }), ativo: filtro.compra === k })),
        ]} />
        {/* Uma opção por vez: escolher uma tira as outras. */}
        <LinhaFiltro rotulo="Na loja" opcoes={[
          { rotulo: 'Com e sem acesso', href: url({ acesso: null, recentes: null, sacola: null }), ativo: !filtro.acesso && !filtro.recentes && !filtro.sacola },
          { rotulo: 'Com acesso à loja', href: url({ acesso: 'com', recentes: null, sacola: null }), ativo: filtro.acesso === 'com' && !filtro.recentes && !filtro.sacola },
          { rotulo: 'Sem acesso à loja', href: url({ acesso: 'sem', recentes: null, sacola: null }), ativo: filtro.acesso === 'sem' },
          { rotulo: 'Acessaram em 7 dias', href: url({ acesso: null, recentes: '1', sacola: null }), ativo: !!filtro.recentes && !filtro.sacola },
          { rotulo: 'Com sacola aberta', href: url({ acesso: null, recentes: null, sacola: '1' }), ativo: !!filtro.sacola },
        ]} />
        <LinhaFiltro rotulo="Ordenar por" opcoes={ORDENS.map(([k, r]) => ({ rotulo: r, href: url({ ordem: k === 'nome' ? null : k }), ativo: filtro.ordem === k }))} />
        {gestor && !filtro.vendedor && (
          <LinhaFiltro rotulo="Mostrar" opcoes={[
            { rotulo: 'Lista única', href: url({ ver: null }), ativo: !agrupar },
            { rotulo: 'Agrupada por vendedor', href: url({ ver: 'vendedor' }), ativo: agrupar },
          ]} />
        )}
      </PainelFiltros>

      {clientes.length === 0 ? (
        <Vazio>{algumFiltro ? 'Nenhum cliente com esses filtros.' : 'Nenhum cliente cadastrado ainda.'}</Vazio>
      ) : (
        <div className="grid gap-6">
          {grupos.map(({ v, lista }) => (
            <section key={v?.id ?? 'todos'} className="grid gap-2">
              {v && (
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="titulo text-lg"><Link href={`/painel/vendedores/${v.id}`} className="hover:underline">{v.name}</Link></h2>
                  <div className="text-sm text-suave">
                    {porVendedor.get(v.id) ?? lista.length} clientes · <Link href={url({ vendedor: v.id, ver: null })} className="underline underline-offset-4 text-marrom-950">ver só os de {v.name.split(' ')[0]}</Link>
                  </div>
                </div>
              )}
              <Cartao className="divide-y divide-borda">
                <div className="hidden lg:grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_7rem_7rem_7rem_16rem] gap-4 px-5 py-3 rotulo !text-[0.6rem] text-suave">
                  <span>Cliente</span><span>{gestor ? 'Vendedor' : 'Na loja'}</span><span className="text-right">Comprado</span><span>Última compra</span><span>Último acesso</span><span />
                </div>
                {lista.map(c => {
                  const vendas = porCliente.get(c.id);
                  return (
                    <div key={c.id} className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_7rem_7rem_7rem_16rem] gap-x-4 gap-y-1 px-5 py-3 items-center text-sm">
                      <div className="min-w-0">
                        <Link href={`/painel/clientes/${c.id}`} className="font-semibold text-marrom-950 hover:underline">{c.nome}</Link>
                        <div className="text-suave truncate">{c.telefone}{c.cidade ? ` · ${c.cidade}` : ''}</div>
                        {c._count.pedidos > 0 && (
                          <Link href={`/painel/pedidos?cliente=${c.id}`} className="text-xs text-caramelo underline underline-offset-4">{c._count.pedidos} {c._count.pedidos === 1 ? 'pedido em aberto' : 'pedidos em aberto'}</Link>
                        )}
                      </div>
                      <div className="min-w-0 text-suave">
                        {gestor && <Link href={`/painel/vendedores/${c.vendedor.id}`} className="text-marrom-950 hover:underline">{c.vendedor.name}</Link>}
                        <div className="text-xs">{c.userId ? <span className="text-oliva">Acesso à loja</span> : 'Sem acesso à loja'}{c.sacola ? <span className="text-caramelo"> · sacola aberta</span> : ''}</div>
                      </div>
                      <div className="lg:text-right font-display font-bold"><span className="lg:hidden rotulo !text-[0.6rem] text-suave mr-2">Comprado</span>{vendas?._sum.valor ? brl(vendas._sum.valor) : '—'}</div>
                      <div className="text-suave"><span className="lg:hidden rotulo !text-[0.6rem] mr-2">Última compra</span>{vendas?._max.data ? formatarData(vendas._max.data) : 'Sem compras'}</div>
                      <div className="text-suave" title={c.ultimoAcessoEm ? formatarDataHora(c.ultimoAcessoEm) : undefined}>
                        <span className="lg:hidden rotulo !text-[0.6rem] mr-2">Último acesso</span>{c.userId ? tempoDesde(c.ultimoAcessoEm) : '—'}
                      </div>
                      <div className="flex gap-2 lg:justify-end pt-1 lg:pt-0">
                        {c.telefone && <a href={linkWhatsApp(c.telefone, `Olá, ${c.nome.split(' ')[0]}! Aqui é da ${loja.nome}.`)} target="_blank" rel="noopener" className={botao('secundario', 'p')}>WhatsApp</a>}
                        <Link href={`/painel/pedidos/novo?cliente=${c.id}`} className={botao('oliva', 'p')}>Montar pedido</Link>
                      </div>
                    </div>
                  );
                })}
              </Cartao>
            </section>
          ))}
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
