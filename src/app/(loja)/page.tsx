import Link from 'next/link';
import type { ReactNode } from 'react';
import { Foto } from '@/components/loja/foto';
import { TituloSecao, Vitrine } from '@/components/loja/vitrine';
import { IconeCaminhao, IconeCasa, IconeConversa, IconeFlecha, IconeSelo } from '@/components/ui/icones';
import { emEstoque, emPromocao, FAIXAS_PRECO, intercalar, umPorModelo, type ProdutoCatalogo } from '@/lib/catalogo';
import { brl, descontoPct } from '@/lib/dinheiro';
import { catalogo } from '@/server/catalogo';
import { lerConfig } from '@/server/config';
import { nomeComSlogan } from '@/lib/loja';

export default async function Inicio() {
  const [lista, cfg] = await Promise.all([catalogo(), lerConfig()]);
  const prontas = lista.filter(p => emEstoque(p) && p.imagens.length > 0);
  const novos = [...prontas].sort((a, b) => b.id - a.id);
  // Novidades variadas: uma por modelo, alternando as categorias.
  const novidades = intercalar(umPorModelo(novos), p => p.categoriaSlug).slice(0, 8);
  const naVitrine = new Set(novidades.map(p => p.modelo));
  const todasImperdiveis = umPorModelo(novos.filter(p => p.imperdivel));
  const todasPromocoes = umPorModelo(novos.filter(p => emPromocao(p)));
  const imperdiveis = todasImperdiveis.filter(p => !naVitrine.has(p.modelo)).slice(0, 8);
  const promocoes = todasPromocoes.filter(p => !naVitrine.has(p.modelo)).slice(0, 8);
  const maiorDesconto = (l: ProdutoCatalogo[]) => Math.max(0, ...l.map(p => descontoPct(p.preco, p.precoCheio)));
  const fotoDe = (filtro: (p: ProdutoCatalogo) => boolean) => {
    const p = prontas.find(x => filtro(x) && x.imagens.length > 1) ?? prontas.find(filtro);
    return p ? p.imagens[1] ?? p.imagens[0] : null;
  };

  // Categorias com mais peças disponíveis, cada uma com uma foto de modelo (segunda foto costuma ser a de pessoa).
  const porCategoria = new Map<string, { nome: string; slug: string; n: number }>();
  for (const p of prontas) {
    const c = porCategoria.get(p.categoriaSlug) ?? { nome: p.categoria, slug: p.categoriaSlug, n: 0 };
    c.n++;
    porCategoria.set(p.categoriaSlug, c);
  }
  const categorias = [...porCategoria.values()].sort((a, b) => b.n - a.n).slice(0, 10)
    .map(c => ({ ...c, foto: fotoDe(p => p.categoriaSlug === c.slug) }));
  const marcas = [...new Map(lista.map(p => [p.marcaSlug, p.marca])).entries()]
    .map(([slug, nome]) => ({ slug, nome, n: umPorModelo(prontas.filter(p => p.marcaSlug === slug)).length, foto: fotoDe(p => p.marcaSlug === slug) }))
    .filter(m => m.n > 0).sort((a, b) => b.n - a.n);
  const modelos = umPorModelo(prontas);
  const faixas = FAIXAS_PRECO.map(f => ({ ...f, n: modelos.filter(p => p.preco >= f.min && p.preco < f.max).length })).filter(f => f.n > 0);
  const cidade = cfg.cidadeCondicional.split('/')[0];

  return (
    <div className="pt-3 sm:pt-6 grid gap-20 sm:gap-28 [&>*]:min-w-0">
      <h1 className="sr-only">{nomeComSlogan()}, com estoque pronto em {cidade} (SC)</h1>

      {/* Banner principal: mensagem da loja, chamadas, números e as entradas por gênero. */}
      <section className="grid lg:grid-cols-[1.05fr_1fr] gap-3 sm:gap-4">
        <div className="relative overflow-hidden rounded-[2rem] bg-marrom-950 text-creme p-7 sm:p-12 xl:p-14 flex flex-col justify-between gap-10 min-h-[26rem]">
          <div aria-hidden="true" className="absolute -right-24 -top-24 size-80 rounded-full bg-caramelo/40 blur-3xl" />
          <div aria-hidden="true" className="absolute -left-20 bottom-0 size-64 rounded-full bg-oliva/25 blur-3xl" />
          <div className="relative">
            <span className="inline-flex items-center gap-2 h-8 px-3.5 rounded-full bg-creme/10 text-[0.78rem] font-medium text-areia">
              <span className="size-2 rounded-full bg-[#4ade80] animate-pulse" />Estoque pronto em {cidade} (SC)
            </span>
            <p className="titulo !text-creme text-5xl sm:text-6xl xl:text-7xl mt-6 leading-[0.95]">O básico<br /><em className="text-areia">aconchego</em></p>
            <p className="mt-6 text-areia/90 max-w-md text-[1.05rem] leading-relaxed">
              Peças Hering e John John para o dia a dia. Monte sua sacola, envie pelo WhatsApp e, em {cidade}, prove em casa antes de pagar.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/catalogo?ordem=novidades" className="group h-13 px-7 inline-flex items-center gap-2 rounded-full bg-creme text-marrom-950 font-semibold hover:bg-card transition-colors">
                Ver novidades<IconeFlecha className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              {todasPromocoes.length + todasImperdiveis.length > 0 && (
                <Link href="/catalogo?promo=1" className="h-13 px-7 inline-flex items-center rounded-full border border-creme/30 text-creme font-semibold hover:bg-creme/10 transition-colors">Promoções</Link>
              )}
            </div>
          </div>
          <dl className="relative grid grid-cols-3 gap-4 pt-6 border-t border-creme/15 max-w-lg">
            <Numero valor={`${modelos.length}+`} rotulo="modelos prontos" />
            <Numero valor={maiorDesconto([...todasImperdiveis, ...todasPromocoes]) ? `−${maiorDesconto([...todasImperdiveis, ...todasPromocoes])}%` : '100%'} rotulo={maiorDesconto([...todasImperdiveis, ...todasPromocoes]) ? 'de desconto, até' : 'peças originais'} />
            <Numero valor={cfg.parcelas > 1 ? `${cfg.parcelas}x` : 'Grátis'} rotulo={cfg.parcelas > 1 ? 'para parcelar' : 'para provar em casa'} />
          </dl>
        </div>

        <div className="grid grid-cols-2 lg:grid-rows-2 gap-3 sm:gap-4">
          <Entrada href="/catalogo?genero=feminino" titulo="Feminino" foto={fotoDe(p => p.genero === 'feminino')} prioridade className="aspect-[3/4] lg:aspect-auto lg:row-span-2" />
          <Entrada href="/catalogo?genero=masculino" titulo="Masculino" foto={fotoDe(p => p.genero === 'masculino')} className="aspect-[3/4] lg:aspect-auto" />
          <Entrada href="/catalogo?ordem=novidades" titulo="Novidades" foto={novidades[0]?.imagens[0] ?? null} className="hidden lg:block" />
        </div>
      </section>

      {/* Por que comprar aqui. */}
      <ul className="-mt-12 sm:-mt-16 grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <Confianca icone={<IconeCasa />} titulo="Prove em casa">Condicional em {cidade}: pague só o que ficar.</Confianca>
        <Confianca icone={<IconeConversa />} titulo="Atendimento humano">Uma pessoa da loja cuida do seu pedido no WhatsApp.</Confianca>
        <Confianca icone={<IconeSelo />} titulo="Peças originais">Hering, Hering Sports, Intimates e John John.</Confianca>
        <Confianca icone={<IconeCaminhao />} titulo="Pronta-entrega">{cfg.frete?.gratisAcima ? `Frete grátis acima de ${brl(cfg.frete.gratisAcima)}.` : 'Entrega combinada com você.'}</Confianca>
      </ul>

      {categorias.length > 0 && (
        <section aria-labelledby="titulo-categorias">
          <TituloSecao id="titulo-categorias" sobre="Comece por aqui" titulo="Compre por categoria" link="/catalogo" rotuloLink="Ver todas" />
          <div className="flex gap-4 sm:gap-6 overflow-x-auto snap-x -mx-4 px-4 scroll-px-4 sm:-mx-8 sm:px-8 sm:scroll-px-8 pb-2 sem-barra lg:grid lg:grid-cols-10 lg:gap-4 lg:overflow-visible">
            {categorias.map(c => (
              <Link key={c.slug} href={`/catalogo?categoria=${c.slug}`} className="group shrink-0 snap-start w-24 sm:w-28 lg:w-auto text-center">
                <div className="relative aspect-square rounded-full overflow-hidden bg-bege ring-1 ring-borda ring-offset-4 ring-offset-card transition group-hover:ring-2 group-hover:ring-marrom-950">
                  <Foto src={c.foto} alt="" sizes="128px" className="transition-transform duration-500 group-hover:scale-110" />
                </div>
                <div className="mt-3 text-sm font-semibold text-marrom-950 leading-tight">{c.nome}</div>
                <div className="text-xs text-suave mt-0.5">{c.n} peças</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <Vitrine titulo="Novidades" sobre="Acabou de chegar" produtos={novidades} parcelas={cfg.parcelas} link="/catalogo?ordem=novidades" />

      {/* Faixas de ofertas. */}
      {(todasImperdiveis.length > 0 || todasPromocoes.length > 0) && (
        <section className={`grid gap-3 sm:gap-4 ${todasImperdiveis.length && todasPromocoes.length ? 'md:grid-cols-2' : ''}`}>
          {todasImperdiveis.length > 0 && (
            <Oferta href="/catalogo?imperdivel=1" tom="imperdivel" sobre="Preço de ocasião" titulo="Imperdível"
              destaque={maiorDesconto(todasImperdiveis) ? `até −${maiorDesconto(todasImperdiveis)}%` : `${todasImperdiveis.length} peças`}
              texto="Peças selecionadas com o menor preço da loja. Quando acabam, não voltam." fotos={todasImperdiveis.slice(0, 2).map(p => p.imagens[0])} />
          )}
          {todasPromocoes.length > 0 && (
            <Oferta href="/catalogo?promo=1&ordem=desconto" tom="claro" sobre="Por tempo limitado" titulo="Promoções"
              destaque={maiorDesconto(todasPromocoes) ? `até −${maiorDesconto(todasPromocoes)}%` : `${todasPromocoes.length} peças`}
              texto={`${todasPromocoes.length} ${todasPromocoes.length === 1 ? 'modelo' : 'modelos'} com desconto, com o estoque pronto para você.`} fotos={todasPromocoes.slice(0, 2).map(p => p.imagens[0])} />
          )}
        </section>
      )}

      <Vitrine titulo="Imperdível" sobre="Preço de ocasião" produtos={imperdiveis} parcelas={cfg.parcelas} link="/catalogo?imperdivel=1" />

      {/* Condicional: como funciona. */}
      <section className="relative overflow-hidden rounded-[2rem] bg-bege p-7 sm:p-12 xl:p-16 grid lg:grid-cols-[1fr_1.5fr] gap-10 items-center">
        <div>
          <div className="rotulo !text-[0.66rem] text-caramelo">Condicional em {cidade}</div>
          <h2 className="titulo text-4xl sm:text-5xl mt-2 leading-[1.02]">Prove em casa,<br /><em>pague só o que ficar</em></h2>
          <p className="mt-4 text-marrom-900 max-w-md leading-relaxed">Escolha as peças, receba em casa e devolva o que não servir. Sem pressa e sem custo para provar.</p>
          <Link href="/catalogo" className="group mt-8 h-13 px-7 inline-flex items-center gap-2 rounded-full bg-marrom-950 text-creme font-semibold hover:bg-marrom-700 transition-colors">
            Montar minha sacola<IconeFlecha className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
        <ol className="grid grid-cols-2 gap-3 sm:gap-4">
          {[
            ['Monte sua sacola', 'Escolha as peças e os tamanhos no catálogo.'],
            ['Envie pelo WhatsApp', 'A mensagem vai pronta para quem te atende.'],
            ['Receba e prove', 'Experimente com calma, no seu tempo.'],
            ['Pague só o que ficar', 'O resto volta para a loja, sem custo.'],
          ].map(([t, d], i) => (
            <li key={t} className="bg-card rounded-3xl p-5 sm:p-6">
              <span className="size-10 grid place-items-center rounded-full bg-marrom-950 text-creme font-bold">{i + 1}</span>
              <div className="mt-4 font-semibold text-marrom-950">{t}</div>
              <div className="mt-1 text-sm text-suave leading-snug">{d}</div>
            </li>
          ))}
        </ol>
      </section>

      <Vitrine titulo="Promoções" sobre="Por tempo limitado" produtos={promocoes} parcelas={cfg.parcelas} link="/catalogo?promo=1&ordem=desconto" />

      {faixas.length > 1 && (
        <section aria-labelledby="titulo-precos">
          <TituloSecao id="titulo-precos" sobre="Cabe no bolso" titulo="Compre por preço" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {faixas.map(f => (
              <Link key={f.valor} href={`/catalogo?preco=${f.valor}`} className="group rounded-3xl border border-borda bg-creme p-5 sm:p-7 hover:bg-marrom-950 hover:border-marrom-950 transition-colors">
                <div className="text-xs font-semibold text-suave group-hover:text-areia">{f.n} {f.n === 1 ? 'modelo' : 'modelos'}</div>
                <div className="titulo text-2xl sm:text-3xl mt-2 group-hover:!text-creme">{f.rotulo}</div>
                <IconeFlecha className="size-5 mt-4 text-marrom-950 group-hover:text-creme transition-transform group-hover:translate-x-1" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {marcas.length > 1 && (
        <section aria-labelledby="titulo-marcas">
          <TituloSecao id="titulo-marcas" sobre="Originais" titulo="Marcas da loja" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {marcas.map(m => (
              <Link key={m.slug} href={`/catalogo?marca=${m.slug}`} className="group relative aspect-[4/3] rounded-3xl overflow-hidden bg-marrom-950">
                <Foto src={m.foto} alt="" sizes="(max-width: 1024px) 50vw, 25vw" className="opacity-70 transition duration-700 group-hover:scale-105 group-hover:opacity-85" />
                <div className="absolute inset-0 bg-gradient-to-t from-marrom-950/85 via-marrom-950/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5 text-creme flex items-end justify-between gap-2">
                  <div>
                    <div className="titulo !text-creme text-xl sm:text-2xl">{m.nome}</div>
                    <div className="text-sm text-areia">{m.n} modelos</div>
                  </div>
                  <span className="size-9 shrink-0 grid place-items-center rounded-full bg-creme/15 backdrop-blur group-hover:bg-creme group-hover:text-marrom-950 transition-colors"><IconeFlecha className="size-4" /></span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Numero({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div>
      <dt className="sr-only">{rotulo}</dt>
      <dd className="text-2xl sm:text-3xl font-extrabold tracking-tight text-creme">{valor}</dd>
      <dd className="text-xs text-areia/80 mt-0.5">{rotulo}</dd>
    </div>
  );
}

function Entrada({ href, titulo, foto, prioridade, className = '' }: { href: string; titulo: string; foto: string | null; prioridade?: boolean; className?: string }) {
  return (
    <Link href={href} className={`group relative overflow-hidden rounded-[2rem] bg-bege ${className}`}>
      <Foto src={foto} alt="" sizes="(max-width: 1024px) 50vw, 25vw" prioridade={prioridade} className="transition-transform duration-700 ease-out group-hover:scale-105" />
      <div className="absolute inset-0 bg-gradient-to-t from-marrom-950/70 via-transparent to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6 flex items-end justify-between gap-2">
        <span className="titulo !text-creme text-2xl sm:text-4xl">{titulo}</span>
        <span className="size-10 sm:size-12 shrink-0 grid place-items-center rounded-full bg-card text-marrom-950 transition-transform group-hover:-rotate-45"><IconeFlecha className="size-4 sm:size-5" /></span>
      </div>
    </Link>
  );
}

function Oferta({ href, tom, sobre, titulo, destaque, texto, fotos }: {
  href: string; tom: 'imperdivel' | 'claro'; sobre: string; titulo: string; destaque: string; texto: string; fotos: (string | undefined)[];
}) {
  const escuro = tom === 'imperdivel';
  return (
    <Link href={href} className={`group relative overflow-hidden rounded-[2rem] p-7 sm:p-10 min-h-64 grid grid-cols-[1fr_auto] gap-6 items-center ${escuro ? 'bg-imperdivel text-white' : 'bg-creme border border-borda text-marrom-950'}`}>
      <div className="min-w-0">
        <div className={`rotulo !text-[0.66rem] ${escuro ? 'text-white/80' : 'text-caramelo'}`}>{sobre}</div>
        <div className={`titulo text-4xl sm:text-5xl mt-2 ${escuro ? '!text-white' : ''}`}>{titulo}</div>
        <div className="mt-2 text-xl sm:text-2xl font-extrabold tracking-tight">{destaque}</div>
        <p className={`mt-3 text-sm max-w-xs leading-relaxed ${escuro ? 'text-white/85' : 'text-suave'}`}>{texto}</p>
        <span className={`mt-6 h-11 px-5 inline-flex items-center gap-2 rounded-full text-sm font-semibold ${escuro ? 'bg-white text-imperdivel' : 'bg-marrom-950 text-creme'}`}>
          Aproveitar<IconeFlecha className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
      <div className="hidden sm:flex -space-x-10">
        {fotos.filter(Boolean).map((f, i) => (
          <div key={f} className={`relative w-28 xl:w-36 aspect-[3/4] rounded-2xl overflow-hidden bg-bege shadow-xl ring-4 ${escuro ? 'ring-imperdivel' : 'ring-creme'} transition-transform duration-500 ${i ? 'rotate-6 group-hover:rotate-3' : '-rotate-6 group-hover:-rotate-3'}`}>
            <Foto src={f} alt="" sizes="144px" />
          </div>
        ))}
      </div>
    </Link>
  );
}

function Confianca({ icone, titulo, children }: { icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <li className="flex flex-col sm:flex-row gap-3 p-4 sm:p-5 rounded-3xl bg-creme">
      <span className="size-11 shrink-0 grid place-items-center rounded-full bg-card text-caramelo">{icone}</span>
      <span><span className="block text-sm font-bold text-marrom-950">{titulo}</span><span className="block text-xs sm:text-[0.82rem] text-suave mt-1 leading-snug">{children}</span></span>
    </li>
  );
}
