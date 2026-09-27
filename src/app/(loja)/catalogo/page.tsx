import Link from 'next/link';
import { CartaoProduto } from '@/components/loja/cartao-produto';
import { Vazio } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { contarFiltros, ESTACOES, FILTROS_VAZIOS, filtrarCatalogo, lerFiltros, urlCatalogo, type Filtros } from '@/lib/catalogo';
import { catalogo } from '@/server/catalogo';
import { lerConfig } from '@/server/config';

export const metadata = { title: 'Catálogo' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Catalogo({ searchParams }: Props) {
  const f = lerFiltros(await searchParams);
  const [lista, cfg] = await Promise.all([catalogo(), lerConfig()]);
  const r = filtrarCatalogo(lista, f);
  const c = r.contagens;
  const nFiltros = contarFiltros(f);

  const titulo =
    f.imperdivel ? 'Imperdível' : f.promo ? 'Promoções' : f.q ? `Busca: “${f.q}”`
      : f.categoria ? c.categorias.find(x => x.valor === f.categoria)?.rotulo ?? 'Catálogo'
        : f.genero ? c.generos.find(x => x.valor === f.genero)?.rotulo ?? 'Catálogo'
          : f.marca ? c.marcas.find(x => x.valor === f.marca)?.rotulo ?? 'Catálogo' : 'Todas as peças';

  const painel = (
    <div className="grid gap-7">
      <form action="/catalogo" className="flex">
        {Object.entries({ ...f, q: undefined, pagina: undefined }).map(([k, v]) =>
          v && v !== 'todos' && v !== 'relevancia' ? <input key={k} type="hidden" name={k} value={v === true ? '1' : String(v)} /> : null,
        )}
        <input name="q" defaultValue={f.q} placeholder="Buscar nesta seleção" aria-label="Buscar" className="flex-1 min-w-0 h-10 px-3 border border-borda-forte bg-card outline-none focus:border-marrom-950" />
        <button className="h-10 px-3 bg-marrom-950 text-creme rotulo">Ir</button>
      </form>
      <Grupo titulo="Gênero">
        <Chip f={f} mudar={{ genero: null, categoria: null }} ativo={!f.genero}>Todos</Chip>
        {c.generos.map(g => <Chip key={g.valor} f={f} mudar={{ genero: g.valor as Filtros['genero'], categoria: null }} ativo={f.genero === g.valor}>{g.rotulo} ({g.n})</Chip>)}
      </Grupo>
      <Grupo titulo="Categoria">
        <Chip f={f} mudar={{ categoria: null }} ativo={!f.categoria}>Todas</Chip>
        {c.categorias.map(x => <Chip key={x.valor} f={f} mudar={{ categoria: x.valor }} ativo={f.categoria === x.valor}>{x.rotulo} ({x.n})</Chip>)}
      </Grupo>
      <Grupo titulo="Tamanho disponível">
        {c.tamanhos.map(t => <Chip key={t} f={f} mudar={{ tamanho: f.tamanho === t ? null : t }} ativo={f.tamanho === t}>{t}</Chip>)}
      </Grupo>
      <Grupo titulo="Ofertas">
        <Chip f={f} mudar={{ promo: !f.promo }} ativo={f.promo}>Em promoção ({c.promo})</Chip>
        <Chip f={f} mudar={{ imperdivel: !f.imperdivel }} ativo={f.imperdivel}>Imperdível ({c.imperdivel})</Chip>
      </Grupo>
      <Grupo titulo="Estação">
        {ESTACOES.map(e => <Chip key={e.valor} f={f} mudar={{ estacao: f.estacao === e.valor ? null : e.valor }} ativo={f.estacao === e.valor}>{e.rotulo}</Chip>)}
      </Grupo>
      <Grupo titulo="Marca">
        <Chip f={f} mudar={{ marca: null }} ativo={!f.marca}>Todas</Chip>
        {c.marcas.map(m => <Chip key={m.valor} f={f} mudar={{ marca: m.valor }} ativo={f.marca === m.valor}>{m.rotulo}</Chip>)}
      </Grupo>
      <Grupo titulo="Estoque">
        <Chip f={f} mudar={{ estoque: 'todos' }} ativo={f.estoque === 'todos'}>Todos</Chip>
        <Chip f={f} mudar={{ estoque: 'disponiveis' }} ativo={f.estoque === 'disponiveis'}>Disponíveis ({c.disponiveis})</Chip>
        <Chip f={f} mudar={{ estoque: 'esgotados' }} ativo={f.estoque === 'esgotados'}>Esgotados ({c.esgotados})</Chip>
      </Grupo>
      {nFiltros > 0 && <Link href="/catalogo" className={botao('secundario', 'p', 'w-full')}>Limpar filtros</Link>}
    </div>
  );

  return (
    <div className="py-8">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <div className="rotulo text-caramelo">Loja</div>
          <h1 className="titulo text-3xl mt-1">{titulo}</h1>
          <p className="text-suave mt-1">{r.total.toLocaleString('pt-BR')} {r.total === 1 ? 'peça' : 'peças'}</p>
        </div>
        <div className="flex gap-4 rotulo" aria-label="Ordenar">
          {([['relevancia', 'Relevância'], ['menor-preco', 'Menor preço'], ['maior-preco', 'Maior preço']] as const).map(([o, rotulo]) => (
            <Link key={o} href={urlCatalogo(f, { ordem: o })} className={`pb-1 border-b-2 ${f.ordem === o ? 'border-caramelo text-marrom-950' : 'border-transparent text-suave'}`}>{rotulo}</Link>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[260px_1fr] gap-8">
        <details className="lg:hidden border border-borda bg-card">
          <summary className="cursor-pointer px-4 py-3 rotulo">Filtros{nFiltros ? ` (${nFiltros})` : ''}</summary>
          <div className="p-4 pt-0">{painel}</div>
        </details>
        <aside className="hidden lg:block">{painel}</aside>

        <div>
          {r.produtos.length === 0 ? (
            <Vazio>
              Nenhuma peça encontrada com esses filtros.{' '}
              <Link href={urlCatalogo(FILTROS_VAZIOS)} className="underline text-caramelo">Ver todas</Link>
            </Vazio>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-3 gap-y-8">
              {r.produtos.map((p, i) => <CartaoProduto key={p.id} p={p} parcelas={cfg.parcelas} prioridade={i < 4} />)}
            </div>
          )}
          {r.temMais && (
            <div className="mt-12 text-center">
              <p className="text-sm text-suave mb-3">Mostrando {r.produtos.length} de {r.total.toLocaleString('pt-BR')}</p>
              <Link href={urlCatalogo(f, { pagina: f.pagina + 1 })} scroll={false} className={botao('secundario', 'g')}>Carregar mais</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="rotulo text-suave mb-3">{titulo}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

function Chip({ f, mudar, ativo, children }: { f: Filtros; mudar: Partial<Filtros>; ativo: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={urlCatalogo(f, mudar)}
      scroll={false}
      aria-current={ativo ? 'true' : undefined}
      className={`px-3 py-1.5 text-sm border ${ativo ? 'bg-marrom-950 text-creme border-marrom-950' : 'bg-card border-borda-forte text-marrom-900 hover:border-marrom-950'}`}
    >
      {children}
    </Link>
  );
}
