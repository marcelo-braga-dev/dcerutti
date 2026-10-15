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

  return (
    <div className="pt-8 pb-28 lg:pb-8">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <div className="rotulo text-caramelo">{f.genero && titulo !== nomeGenero ? nomeGenero : 'Loja'}</div>
          <h1 className="titulo text-3xl mt-1">{titulo}</h1>
          <p className="text-suave mt-1">{r.total.toLocaleString('pt-BR')} {r.total === 1 ? 'peça' : 'peças'}</p>
        </div>
        <SeletorOrdem atual={f.ordem} opcoes={ordens} className="hidden lg:flex" />
      </div>

      <div className="grid lg:grid-cols-[264px_1fr] gap-8">
        <aside className="hidden lg:block lg:sticky lg:top-24 self-start max-h-[calc(100dvh-7rem)] overflow-y-auto pr-3 -mr-3 [scrollbar-width:thin]" aria-label="Filtros"><PainelFiltros f={f} c={c} cabecalho /></aside>
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
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-3 gap-y-8">
              {r.produtos.map((p, i) => <CartaoProduto key={p.id} p={p} parcelas={cfg.parcelas} prioridade={i < 4} />)}
            </div>
          )}
          {r.produtos.length > 0 && (
            <div className="mt-12 grid justify-items-center gap-3 text-center">
              <p className="text-sm text-suave">Mostrando {r.produtos.length.toLocaleString('pt-BR')} de {r.total.toLocaleString('pt-BR')}</p>
              <div className="w-48 h-1 bg-bege"><div className="h-full bg-caramelo" style={{ width: `${(r.produtos.length / r.total) * 100}%` }} /></div>
              {r.temMais && <Link href={urlCatalogo(f, { pagina: f.pagina + 1 })} scroll={false} className={botao('secundario', 'g', 'mt-2')}>Carregar mais</Link>}
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
    <div className="border border-dashed border-borda-forte p-8 sm:p-12 grid gap-6 justify-items-center text-center">
      <div className="grid gap-2">
        <h2 className="titulo text-xl">Nenhuma peça encontrada</h2>
        <p className="text-suave max-w-md">
          {f.q ? 'Confira a grafia ou use uma palavra mais simples (ex.: “camiseta”, “bermuda”, a cor ou a referência).' : 'Tire algum filtro para ver mais peças.'}
        </p>
      </div>
      {todas.length > 0 && (
        <div className="grid gap-3 justify-items-center">
          <span className="rotulo text-suave">Veja também</span>
          <div className="flex flex-wrap justify-center gap-2">
            {todas.map(x => (
              <Link key={x.valor} href={urlCatalogo({ ...FILTROS_VAZIOS, genero: f.genero }, { categoria: x.valor })} className="min-h-10 px-3 inline-flex items-center border border-borda-forte bg-card text-sm hover:border-marrom-950">{x.rotulo}</Link>
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
