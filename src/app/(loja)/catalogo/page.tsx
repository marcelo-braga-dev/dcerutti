import Link from 'next/link';
import { CartaoProduto } from '@/components/loja/cartao-produto';
import { FiltrosAtivos, PainelFiltros } from '@/components/loja/filtros';
import { GavetaFiltros, SeletorOrdem } from '@/components/loja/gaveta-filtros';
import { IconeWhatsApp } from '@/components/loja/previa-whatsapp';
import { botao } from '@/components/ui/botao';
import { contarFiltros, FILTROS_VAZIOS, filtrarCatalogo, lerFiltros, ORDENS, urlCatalogo, type Filtros } from '@/lib/catalogo';
import { linkWhatsApp } from '@/lib/whatsapp';
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
  const nomeGenero = f.genero ? c.generos.find(g => g.valor === f.genero)?.rotulo ?? '' : '';
  const ordens = ORDENS.map(o => ({ ...o, url: urlCatalogo(f, { ordem: o.valor }) }));
  const painel = <PainelFiltros f={f} c={c} />;

  // Atalhos por categoria logo abaixo do título (as que têm mais peças nesta seleção).
  const rapidas = [...c.categorias].sort((a, b) => b.n - a.n).slice(0, 10);

  return (
    <div className="pt-4 sm:pt-8 pb-28 lg:pb-8">
      <nav className="text-sm text-suave flex flex-wrap items-center gap-1.5" aria-label="Caminho">
        <Link href="/" className="hover:text-marrom-950">Início</Link><span aria-hidden="true">/</span>
        {f.genero && titulo !== nomeGenero ? <><Link href={urlCatalogo({ ...FILTROS_VAZIOS, genero: f.genero })} className="hover:text-marrom-950">{nomeGenero}</Link><span aria-hidden="true">/</span></> : null}
        <span className="text-marrom-950">{titulo}</span>
      </nav>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="titulo text-4xl sm:text-5xl leading-none">{titulo}</h1>
          <p className="text-suave mt-2">{r.total.toLocaleString('pt-BR')} {r.total === 1 ? 'peça' : 'peças'}{cfg.parcelas > 1 ? ` · em até ${cfg.parcelas}x` : ''}</p>
        </div>
        <SeletorOrdem atual={f.ordem} opcoes={ordens} className="hidden lg:flex" />
      </div>

      {rapidas.length > 1 && (
        <div className="mt-6 -mx-4 px-4 sm:-mx-8 sm:px-8 lg:mx-0 lg:px-0 flex gap-2 overflow-x-auto sem-barra" aria-label="Categorias">
          {rapidas.map(x => {
            const ativa = f.categoria === x.valor;
            return (
              <Link key={x.valor} href={urlCatalogo(f, { categoria: ativa ? null : x.valor })} aria-current={ativa ? 'true' : undefined}
                className={`shrink-0 h-10 px-4 inline-flex items-center gap-1.5 rounded-full border text-sm font-medium transition-colors ${ativa ? 'bg-marrom-950 border-marrom-950 text-creme' : 'bg-card border-borda-forte text-marrom-950 hover:border-marrom-950'}`}>
                {x.rotulo}<span className={`text-xs ${ativa ? 'text-areia' : 'text-suave'}`}>{x.n}</span>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-8 grid lg:grid-cols-[272px_1fr] gap-8 xl:gap-12">
        <aside className="hidden lg:block lg:sticky lg:top-36 self-start max-h-[calc(100dvh-10rem)] overflow-y-auto pr-3 -mr-3 [scrollbar-width:thin]" aria-label="Filtros"><PainelFiltros f={f} c={c} cabecalho /></aside>
        <GavetaFiltros total={r.total} ativos={nFiltros}>
          <div className="grid gap-7">
            <SeletorOrdem atual={f.ordem} opcoes={ordens} />
            {painel}
          </div>
        </GavetaFiltros>

        <div className="min-w-0">
          <FiltrosAtivos f={f} c={c} />
          {r.produtos.length === 0 ? (
            <SemResultado f={f} whatsapp={cfg.whatsappLoja} />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-3 sm:gap-x-5 gap-y-10">
              {r.produtos.map((p, i) => <CartaoProduto key={p.id} p={p} parcelas={cfg.parcelas} prioridade={i < 4} />)}
            </div>
          )}
          {r.produtos.length > 0 && (
            <div className="mt-14 grid justify-items-center gap-3 text-center">
              <p className="text-sm text-suave">Você viu {r.produtos.length.toLocaleString('pt-BR')} de {r.total.toLocaleString('pt-BR')} peças</p>
              <div className="w-56 h-1 rounded-full bg-bege overflow-hidden"><div className="h-full rounded-full bg-marrom-950" style={{ width: `${(r.produtos.length / r.total) * 100}%` }} /></div>
              {r.temMais && <Link href={urlCatalogo(f, { pagina: f.pagina + 1 })} scroll={false} className={botao('secundario', 'g', 'mt-3 px-10')}>Carregar mais peças</Link>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Nenhuma peça: sugere afrouxar os filtros, mostra categorias e oferece ajuda da loja pelo WhatsApp. */
async function SemResultado({ f, whatsapp }: { f: Filtros; whatsapp: string }) {
  const todas = filtrarCatalogo(await catalogo(), { ...FILTROS_VAZIOS, genero: f.genero }).contagens.categorias.slice(0, 8);
  const pedido = f.q ? `Olá! Procurei “${f.q}” no catálogo e não encontrei. Vocês têm?` : 'Olá! Não encontrei no catálogo o que procuro. Pode me ajudar?';
  return (
    <div className="rounded-[2rem] bg-creme p-8 sm:p-14 grid gap-6 justify-items-center text-center">
      <div className="grid gap-2">
        <h2 className="titulo text-3xl">Nenhuma peça encontrada</h2>
        <p className="text-suave max-w-md">
          {f.q ? 'Confira a grafia ou use uma palavra mais simples (ex.: “camiseta”, “bermuda”, a cor ou a referência).' : 'Tire algum filtro para ver mais peças.'}
        </p>
      </div>
      {todas.length > 0 && (
        <div className="grid gap-3 justify-items-center">
          <span className="text-sm font-semibold text-suave">Veja também</span>
          <div className="flex flex-wrap justify-center gap-2">
            {todas.map(x => (
              <Link key={x.valor} href={urlCatalogo({ ...FILTROS_VAZIOS, genero: f.genero }, { categoria: x.valor })} className="h-10 px-4 inline-flex items-center rounded-full border border-borda-forte bg-card text-sm hover:border-marrom-950">{x.rotulo}</Link>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap justify-center gap-3">
        <Link href={urlCatalogo(FILTROS_VAZIOS)} className={botao('secundario')}>Ver todas as peças</Link>
        <a href={linkWhatsApp(whatsapp, pedido)} target="_blank" rel="noopener" className={botao('whatsapp')}><IconeWhatsApp className="size-4" />Pedir para a loja procurar</a>
      </div>
    </div>
  );
}
