import Link from 'next/link';
import type { ReactNode } from 'react';
import { contarFiltros, FAIXAS_PRECO, FILTROS_VAZIOS, GRUPOS_CATEGORIA, grupoTamanho, urlCatalogo, type Filtros, type ResultadoCatalogo } from '@/lib/catalogo';
import { IconeLupa, IconeSeta } from '@/components/ui/icones';

type Contagens = ResultadoCatalogo['contagens'];

/**
 * Painel de filtros do catálogo: o mesmo na lateral (computador) e na gaveta (celular). Cada opção é um link com a
 * quantidade de peças (modelos) que ela traria; opção que daria zero não aparece. Seções recolhíveis, com o valor
 * escolhido ao lado do título.
 */
export function PainelFiltros({ f, c, cabecalho = false }: { f: Filtros; c: Contagens; cabecalho?: boolean }) {
  const letras = c.tamanhos.filter(t => grupoTamanho(t.valor) === 'letras');
  const numeros = c.tamanhos.filter(t => grupoTamanho(t.valor) === 'numeracao');
  const grupos = [...GRUPOS_CATEGORIA.map(g => g.rotulo), 'Outros']
    .map(rotulo => ({ rotulo, itens: c.categorias.filter(x => x.grupo === rotulo) }))
    .filter(g => g.itens.length);
  const nome = (l: { valor: string; rotulo: string }[], v: string | null) => (v ? l.find(x => x.valor === v)?.rotulo ?? v : null);
  const ativos = contarFiltros({ ...f, q: '' });
  const ofertas = [f.promo && 'Promoção', f.imperdivel && 'Imperdível'].filter(Boolean).join(', ') || null;

  return (
    <div className="grid">
      {cabecalho && (
        <div className="flex items-center justify-between pb-4 border-b border-marrom-950">
          <span className="titulo text-base">Filtros{ativos > 0 && <span className="ml-2 align-middle inline-grid place-items-center min-w-5 h-5 px-1 rounded-full bg-caramelo text-creme text-[0.65rem]">{ativos}</span>}</span>
          {ativos > 0 && <Link href={urlCatalogo({ ...FILTROS_VAZIOS, q: f.q, ordem: f.ordem })} className="rotulo !text-[0.65rem] text-suave underline underline-offset-4 hover:text-caramelo">Limpar</Link>}
        </div>
      )}

      <form action="/catalogo" className="relative py-4 border-b border-borda">
        {Object.entries({ ...f, q: undefined, pagina: undefined }).map(([k, v]) =>
          v && v !== 'todos' && v !== 'relevancia' ? <input key={k} type="hidden" name={k} value={v === true ? '1' : String(v)} /> : null,
        )}
        <IconeLupa className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-suave" />
        <input name="q" type="search" defaultValue={f.q} placeholder="Buscar nesta seleção" aria-label="Buscar nesta seleção"
          className="w-full h-11 pl-9 pr-3 border border-borda-forte bg-card text-sm outline-none focus:border-marrom-950 [&::-webkit-search-cancel-button]:hidden" />
      </form>

      {c.generos.length > 0 && (
        <Secao titulo="Gênero" valor={nome(c.generos, f.genero)}>
          <div className="grid grid-cols-3 border border-borda-forte bg-card">
            {c.generos.map((g, i) => (
              <Link key={g.valor} href={urlCatalogo(f, { genero: f.genero === g.valor ? null : g.valor as Filtros['genero'] })} aria-current={f.genero === g.valor ? 'true' : undefined}
                className={`min-h-11 px-1 grid place-items-center text-center text-sm leading-tight ${i ? 'border-l border-borda-forte' : ''} ${f.genero === g.valor ? 'bg-marrom-950 text-creme' : 'text-marrom-900 hover:bg-bege'}`}>
                <span>{g.rotulo}<span className={`block text-[0.68rem] ${f.genero === g.valor ? 'text-areia' : 'text-suave'}`}>{g.n}</span></span>
              </Link>
            ))}
          </div>
        </Secao>
      )}

      <Secao titulo="Categoria" valor={nome(c.categorias, f.categoria)}>
        <div className="grid gap-1">
          {grupos.map(g => {
            const temEscolhida = g.itens.some(x => x.valor === f.categoria);
            const n = g.itens.reduce((a, x) => a + x.n, 0);
            return (
              <details key={g.rotulo} open={temEscolhida || grupos.length <= 2} className="group/grupo">
                <summary className="flex items-center justify-between cursor-pointer list-none min-h-10 text-sm text-marrom-950 hover:text-caramelo">
                  <span className={temEscolhida ? 'font-semibold' : ''}>{g.rotulo}</span>
                  <span className="flex items-center gap-2 text-suave text-xs">{n}<IconeSeta className="size-4 transition-transform group-open/grupo:rotate-90" /></span>
                </summary>
                <ul className="pl-3 pb-2 border-l border-borda ml-1">
                  {g.itens.map(x => (
                    <li key={x.valor}><Opcao href={urlCatalogo(f, { categoria: f.categoria === x.valor ? null : x.valor })} ativo={f.categoria === x.valor} n={x.n} tipo="radio">{x.rotulo}</Opcao></li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
      </Secao>

      {(letras.length > 0 || numeros.length > 0) && (
        <Secao titulo="Tamanho" valor={f.tamanho}>
          <div className="grid gap-4">
            <LinhaTamanhos rotulo="Roupas" itens={letras} f={f} />
            <LinhaTamanhos rotulo="Numeração" itens={numeros} f={f} />
          </div>
        </Secao>
      )}

      {c.precos.length > 0 && (
        <Secao titulo="Preço" valor={f.preco ? FAIXAS_PRECO.find(x => x.valor === f.preco)?.rotulo ?? null : null}>
          <ul>{c.precos.map(x => <li key={x.valor}><Opcao href={urlCatalogo(f, { preco: f.preco === x.valor ? null : x.valor as Filtros['preco'] })} ativo={f.preco === x.valor} n={x.n} tipo="radio">{x.rotulo}</Opcao></li>)}</ul>
        </Secao>
      )}

      {(c.promo > 0 || c.imperdivel > 0 || f.promo || f.imperdivel) && (
        <Secao titulo="Ofertas" valor={ofertas}>
          <ul>
            {(c.promo > 0 || f.promo) && <li><Opcao href={urlCatalogo(f, { promo: !f.promo })} ativo={f.promo} n={c.promo} tipo="caixa">Em promoção</Opcao></li>}
            {(c.imperdivel > 0 || f.imperdivel) && <li><Opcao href={urlCatalogo(f, { imperdivel: !f.imperdivel })} ativo={f.imperdivel} n={c.imperdivel} tipo="caixa" destaque>Imperdível</Opcao></li>}
          </ul>
        </Secao>
      )}

      {c.marcas.length > 1 && (
        <Secao titulo="Marca" valor={nome(c.marcas, f.marca)} aberta={!!f.marca}>
          <ul>{c.marcas.map(m => <li key={m.valor}><Opcao href={urlCatalogo(f, { marca: f.marca === m.valor ? null : m.valor })} ativo={f.marca === m.valor} n={m.n} tipo="radio">{m.rotulo}</Opcao></li>)}</ul>
        </Secao>
      )}

      {c.estacoes.length > 0 && (
        <Secao titulo="Estação" valor={nome(c.estacoes, f.estacao)} aberta={!!f.estacao}>
          <div className="grid grid-cols-2 gap-2">
            {c.estacoes.map(e => (
              <Link key={e.valor} href={urlCatalogo(f, { estacao: f.estacao === e.valor ? null : e.valor as Filtros['estacao'] })} aria-current={f.estacao === e.valor ? 'true' : undefined}
                className={`min-h-11 grid place-items-center border text-sm ${f.estacao === e.valor ? 'bg-marrom-950 text-creme border-marrom-950' : 'bg-card border-borda-forte hover:border-marrom-950'}`}>
                {e.rotulo} <span className={`text-[0.68rem] ${f.estacao === e.valor ? 'text-areia' : 'text-suave'}`}>{e.n}</span>
              </Link>
            ))}
          </div>
        </Secao>
      )}

      {(c.esgotados > 0 || f.estoque !== 'todos') && (
        <Secao titulo="Estoque" valor={f.estoque === 'disponiveis' ? 'Só disponíveis' : f.estoque === 'esgotados' ? 'Esgotados' : null} aberta={f.estoque !== 'todos'}>
          <ul>
            <li><Opcao href={urlCatalogo(f, { estoque: f.estoque === 'disponiveis' ? 'todos' : 'disponiveis' })} ativo={f.estoque === 'disponiveis'} n={c.disponiveis} tipo="caixa">Só disponíveis</Opcao></li>
            <li><Opcao href={urlCatalogo(f, { estoque: f.estoque === 'esgotados' ? 'todos' : 'esgotados' })} ativo={f.estoque === 'esgotados'} n={c.esgotados} tipo="caixa">Ver esgotados</Opcao></li>
          </ul>
        </Secao>
      )}
    </div>
  );
}

/** Seção recolhível do painel: título, valor escolhido e a seta. */
function Secao({ titulo, valor, aberta = true, children }: { titulo: string; valor?: string | null; aberta?: boolean; children: ReactNode }) {
  return (
    <details open={aberta || !!valor} className="group border-b border-borda">
      <summary className="flex items-center justify-between gap-3 cursor-pointer list-none min-h-14 py-3">
        <span className="rotulo text-marrom-950">{titulo}</span>
        <span className="flex items-center gap-2 min-w-0">
          {valor && <span className="text-xs text-caramelo truncate max-w-36">{valor}</span>}
          <IconeSeta className="size-4 text-suave shrink-0 transition-transform rotate-90 group-open:-rotate-90" />
        </span>
      </summary>
      <div className="pb-5">{children}</div>
    </details>
  );
}

/** Linha de lista: marcador (bolinha para escolha única, quadrado para marcar), nome e quantidade. */
function Opcao({ href, ativo, n, tipo, destaque, children }: { href: string; ativo: boolean; n?: number; tipo: 'radio' | 'caixa'; destaque?: boolean; children: ReactNode }) {
  const marcador = tipo === 'radio'
    ? <span className={`size-4 rounded-full border grid place-items-center shrink-0 ${ativo ? 'border-marrom-950' : 'border-borda-forte bg-card'}`}>{ativo && <span className="size-2 rounded-full bg-marrom-950" />}</span>
    : <span className={`size-4 border grid place-items-center shrink-0 ${ativo ? 'bg-marrom-950 border-marrom-950 text-creme' : 'border-borda-forte bg-card'}`}>{ativo && <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth={2}><path d="M2.5 6.2 5 8.5l4.5-5" /></svg>}</span>;
  return (
    <Link href={href} aria-current={ativo ? 'true' : undefined}
      className={`flex items-center gap-3 min-h-10 text-sm hover:text-caramelo ${ativo ? 'font-semibold text-marrom-950' : destaque ? 'text-imperdivel' : 'text-marrom-900'}`}>
      {marcador}
      <span className="flex-1 min-w-0 truncate">{children}</span>
      {n != null && <span className="text-xs text-suave tabular-nums">{n}</span>}
    </Link>
  );
}

/** Filtros escolhidos, cada um com o "×" para tirar, e "Limpar tudo". */
export function FiltrosAtivos({ f, c }: { f: Filtros; c: Contagens }) {
  const nome = (lista: { valor: string; rotulo: string }[], v: string | null) => lista.find(x => x.valor === v)?.rotulo ?? v ?? '';
  const ativos: { rotulo: string; href: string }[] = [
    f.q && { rotulo: `“${f.q}”`, href: urlCatalogo(f, { q: '' }) },
    f.genero && { rotulo: nome(c.generos, f.genero), href: urlCatalogo(f, { genero: null }) },
    f.categoria && { rotulo: nome(c.categorias, f.categoria), href: urlCatalogo(f, { categoria: null }) },
    f.tamanho && { rotulo: `Tam. ${f.tamanho}`, href: urlCatalogo(f, { tamanho: null }) },
    f.preco && { rotulo: FAIXAS_PRECO.find(x => x.valor === f.preco)?.rotulo ?? f.preco, href: urlCatalogo(f, { preco: null }) },
    f.promo && { rotulo: 'Em promoção', href: urlCatalogo(f, { promo: false }) },
    f.imperdivel && { rotulo: 'Imperdível', href: urlCatalogo(f, { imperdivel: false }) },
    f.marca && { rotulo: nome(c.marcas, f.marca), href: urlCatalogo(f, { marca: null }) },
    f.estacao && { rotulo: nome(c.estacoes, f.estacao), href: urlCatalogo(f, { estacao: null }) },
    f.estoque !== 'todos' && { rotulo: f.estoque === 'disponiveis' ? 'Só disponíveis' : 'Esgotados', href: urlCatalogo(f, { estoque: 'todos' }) },
  ].filter((x): x is { rotulo: string; href: string } => !!x);
  if (!ativos.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 mb-6" aria-label="Filtros escolhidos">
      {ativos.map(a => (
        <Link key={a.href} href={a.href} className="inline-flex items-center gap-2 h-9 pl-3 pr-2 bg-bege text-sm text-marrom-950 hover:bg-areia" aria-label={`Tirar o filtro ${a.rotulo}`}>
          {a.rotulo}<span aria-hidden="true" className="text-base leading-none">×</span>
        </Link>
      ))}
      {ativos.length > 1 && <Link href={urlCatalogo({ ...FILTROS_VAZIOS, ordem: f.ordem })} className="rotulo !text-[0.65rem] text-suave underline underline-offset-4 px-2">Limpar tudo</Link>}
    </div>
  );
}

function LinhaTamanhos({ rotulo, itens, f }: { rotulo: string; itens: Contagens['tamanhos']; f: Filtros }) {
  if (!itens.length) return null;
  return (
    <div className="grid gap-2">
      <span className="text-xs text-suave">{rotulo}</span>
      <div className="flex flex-wrap gap-2">
        {itens.map(t => (
          <Link key={t.valor} href={urlCatalogo(f, { tamanho: f.tamanho === t.valor ? null : t.valor })} aria-current={f.tamanho === t.valor ? 'true' : undefined}
            title={`${t.n} ${t.n === 1 ? 'peça' : 'peças'}`}
            className={`min-w-11 h-11 px-2 grid place-items-center border font-display font-bold text-sm ${f.tamanho === t.valor ? 'bg-marrom-950 text-creme border-marrom-950' : 'bg-card border-borda-forte text-marrom-950 hover:border-marrom-950'}`}>
            {t.valor}
          </Link>
        ))}
      </div>
    </div>
  );
}
