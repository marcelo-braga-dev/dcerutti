import Link from 'next/link';
import type { ReactNode } from 'react';
import { Foto } from '@/components/loja/foto';
import { IconeWhatsApp } from '@/components/loja/previa-whatsapp';
import { Vitrine } from '@/components/loja/vitrine';
import { botao } from '@/components/ui/botao';
import { IconeCaminhao, IconeCasa, IconeConversa, IconeLupa, IconeSelo } from '@/components/ui/icones';
import { emEstoque, emPromocao, intercalar, umPorModelo, type ProdutoCatalogo } from '@/lib/catalogo';
import { brl } from '@/lib/dinheiro';
import { linkWhatsApp } from '@/lib/whatsapp';
import { catalogo } from '@/server/catalogo';
import { lerConfig } from '@/server/config';
import { nomeComSlogan, nomeDaLoja } from '@/lib/loja';

export default async function Inicio() {
  const [lista, cfg] = await Promise.all([catalogo(), lerConfig()]);
  const prontas = lista.filter(p => emEstoque(p) && p.imagens.length > 0);
  const novos = [...prontas].sort((a, b) => b.id - a.id);
  // Novidades variadas: uma por modelo, alternando as categorias.
  const novidades = intercalar(umPorModelo(novos), p => p.categoriaSlug).slice(0, 8);
  const naVitrine = new Set(novidades.map(p => p.modelo));
  const imperdiveis = umPorModelo(novos.filter(p => p.imperdivel && !naVitrine.has(p.modelo))).slice(0, 8);
  const promocoes = umPorModelo(novos.filter(p => emPromocao(p) && !naVitrine.has(p.modelo))).slice(0, 8);
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
  const categorias = [...porCategoria.values()].sort((a, b) => b.n - a.n).slice(0, 8)
    .map(c => ({ ...c, foto: fotoDe(p => p.categoriaSlug === c.slug) }));
  const marcas = [...new Map(lista.map(p => [p.marcaSlug, p.marca])).entries()]
    .map(([slug, nome]) => ({ slug, nome, n: umPorModelo(prontas.filter(p => p.marcaSlug === slug)).length, foto: fotoDe(p => p.marcaSlug === slug) }))
    .filter(m => m.n > 0).sort((a, b) => b.n - a.n);
  const cidade = cfg.cidadeCondicional.split('/')[0];

  return (
    <div className="py-4 sm:py-8 grid gap-16 sm:gap-20 [&>*]:min-w-0">
      <h1 className="sr-only">{nomeComSlogan()}, com estoque pronto em {cidade} (SC)</h1>

      {/* Banner principal: mensagem da loja, chamadas e as entradas por gênero. */}
      <section className="grid lg:grid-cols-[1fr_1.25fr] gap-3">
        <div className="bg-marrom-950 text-creme p-7 sm:p-12 flex flex-col justify-between gap-8 min-h-[22rem]">
          <div>
            <div className="rotulo text-areia">Estoque pronto em {cidade} (SC)</div>
            <p className="titulo !text-creme text-4xl sm:text-5xl xl:text-6xl mt-4 leading-[0.95]">O básico<br />aconchego</p>
            <p className="mt-5 text-areia max-w-md leading-relaxed">
              Peças Hering e John John para o dia a dia. Monte sua sacola, envie para quem te atende pelo WhatsApp e, em {cidade}, prove em casa antes de pagar.
            </p>
          </div>
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-3">
              <Link href="/catalogo?ordem=novidades" className={botao('claro', 'g')}>Ver novidades</Link>
              <Link href="/catalogo?promo=1" className={botao('secundario', 'g', '!text-creme !border-creme/60 hover:!bg-creme hover:!text-marrom-950')}>Promoções</Link>
            </div>
            <form action="/catalogo" className="flex max-w-md" role="search">
              <div className="relative flex-1">
                <IconeLupa className="size-5 absolute left-3 top-1/2 -translate-y-1/2 text-areia" />
                <input name="q" type="search" placeholder="Buscar: camiseta, bermuda, preto…" aria-label="Buscar peças"
                  className="w-full h-12 pl-10 pr-3 bg-creme/10 border border-creme/25 text-creme placeholder:text-areia/80 outline-none focus:border-creme" />
              </div>
              <button className="h-12 px-4 bg-caramelo text-creme rotulo">Buscar</button>
            </form>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {([['feminino', 'Feminino'], ['masculino', 'Masculino']] as const).map(([g, rotulo], i) => (
            <Link key={g} href={`/catalogo?genero=${g}`} className="group relative aspect-[3/4] lg:aspect-auto overflow-hidden bg-bege">
              <Foto src={fotoDe(p => p.genero === g)} alt="" sizes="(max-width: 1024px) 50vw, 28vw" prioridade={i === 0} className="transition-transform duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-marrom-950/75 via-marrom-950/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6 text-creme">
                <div className="titulo !text-creme text-2xl sm:text-4xl">{rotulo}</div>
                <span className="mt-2 inline-flex items-center gap-2 rotulo !text-[0.65rem] border-b border-creme/60 pb-0.5">Ver peças →</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Por que comprar aqui. */}
      <ul className="-mt-8 sm:-mt-10 grid grid-cols-2 lg:grid-cols-4 border-y border-borda divide-borda [&>li]:border-borda lg:divide-x">
        <Confianca icone={<IconeCasa />} titulo="Prove em casa">Condicional em {cidade}: pague só o que ficar.</Confianca>
        <Confianca icone={<IconeConversa />} titulo="Atendimento no WhatsApp">Uma pessoa da loja cuida do seu pedido.</Confianca>
        <Confianca icone={<IconeSelo />} titulo="Peças originais">Hering, Hering Sports, Intimates e John John.</Confianca>
        <Confianca icone={<IconeCaminhao />} titulo="Estoque pronto">{cfg.frete?.gratisAcima ? `Frete grátis acima de ${brl(cfg.frete.gratisAcima)}.` : 'Entrega combinada com você.'}</Confianca>
      </ul>

      {categorias.length > 0 && (
        <section>
          <div className="flex items-end justify-between gap-4 mb-6">
            <div><div className="rotulo text-caramelo">Comece por aqui</div><h2 className="titulo text-2xl sm:text-3xl mt-1">Categorias</h2></div>
            <Link href="/catalogo" className="rotulo underline underline-offset-4">Ver todas</Link>
          </div>
          <div className="flex lg:grid lg:grid-cols-8 gap-3 overflow-x-auto snap-x -mx-4 px-4 scroll-px-4 sm:-mx-8 sm:px-8 sm:scroll-px-8 lg:mx-0 lg:px-0 [scrollbar-width:none]">
            {categorias.map(c => (
              <Link key={c.slug} href={`/catalogo?categoria=${c.slug}`} className="group shrink-0 w-[34%] sm:w-[22%] lg:w-auto snap-start">
                <div className="relative aspect-[3/4] overflow-hidden bg-bege">
                  <Foto src={c.foto} alt="" sizes="(max-width: 640px) 34vw, 12vw" className="transition-transform duration-500 group-hover:scale-105" />
                </div>
                <div className="mt-2 text-sm text-marrom-950 group-hover:underline underline-offset-4">{c.nome}</div>
                <div className="text-xs text-suave">{c.n} peças</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <Vitrine titulo="Novidades" sobre="Acabou de chegar" produtos={novidades} parcelas={cfg.parcelas} link="/catalogo?ordem=novidades" />

      <section className="grid lg:grid-cols-[1fr_1.6fr] gap-8 items-center bg-bege p-7 sm:p-12">
        <div>
          <div className="rotulo text-caramelo">Condicional em {cidade}</div>
          <h2 className="titulo text-3xl mt-2">Prove em casa, pague só o que ficar</h2>
          <p className="mt-3 text-marrom-900">Escolha as peças, receba em casa e devolva o que não servir. Sem pressa e sem custo para provar.</p>
          <Link href="/catalogo" className={botao('primario', 'm', 'mt-6')}>Montar minha sacola</Link>
        </div>
        <ol className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {['Monte sua sacola', 'Envie pelo WhatsApp', 'Receba e prove com calma', 'Pague só o que ficar'].map((t, i) => (
            <li key={t} className="bg-card p-4">
              <div className="font-display font-extrabold text-3xl text-caramelo">0{i + 1}</div>
              <div className="mt-2 text-sm text-marrom-950">{t}</div>
            </li>
          ))}
        </ol>
      </section>

      <Vitrine titulo="Imperdível" sobre="Preço de ocasião" produtos={imperdiveis} parcelas={cfg.parcelas} link="/catalogo?imperdivel=1" />
      <Vitrine titulo="Promoções" sobre="Por tempo limitado" produtos={promocoes} parcelas={cfg.parcelas} link="/catalogo?promo=1&ordem=desconto" />

      {marcas.length > 1 && (
        <section>
          <h2 className="titulo text-2xl sm:text-3xl mb-6">Marcas</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {marcas.map(m => (
              <Link key={m.slug} href={`/catalogo?marca=${m.slug}`} className="group relative aspect-[4/3] overflow-hidden bg-marrom-950">
                <Foto src={m.foto} alt="" sizes="(max-width: 1024px) 50vw, 25vw" className="opacity-60 transition duration-500 group-hover:scale-105 group-hover:opacity-75" />
                <div className="absolute inset-0 bg-gradient-to-t from-marrom-950/80 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4 text-creme">
                  <div className="titulo !text-creme text-lg sm:text-xl">{m.nome}</div>
                  <div className="text-sm text-areia">{m.n} modelos</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="grid md:grid-cols-[1.4fr_1fr] gap-6 items-center border border-borda bg-card p-7 sm:p-10">
        <div>
          <div className="rotulo text-caramelo">Atendimento de pessoa para pessoa</div>
          <h2 className="titulo text-2xl sm:text-3xl mt-2">Ficou com dúvida? A gente te ajuda</h2>
          <p className="mt-3 text-suave max-w-xl">Tamanho, cor, uma peça que você não achou: fale com a loja pelo WhatsApp. Siga também o Instagram para ver as novidades primeiro.</p>
        </div>
        <div className="grid gap-3">
          <a href={linkWhatsApp(cfg.whatsappLoja, `Olá! Vim pelo catálogo da ${nomeDaLoja()}.`)} target="_blank" rel="noopener" className={botao('whatsapp', 'g', 'w-full')}><IconeWhatsApp className="size-5" />Falar no WhatsApp</a>
          <a href="https://instagram.com/dcerutti_" target="_blank" rel="noopener" className={botao('secundario', 'g', 'w-full')}>Instagram @dcerutti_</a>
        </div>
      </section>
    </div>
  );
}

function Confianca({ icone, titulo, children }: { icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <li className="flex gap-3 p-4 sm:p-5 [&:nth-child(odd)]:border-r lg:[&:nth-child(odd)]:border-r-0 [&:nth-child(-n+2)]:border-b lg:[&:nth-child(-n+2)]:border-b-0">
      <span className="text-caramelo shrink-0">{icone}</span>
      <span><span className="block rotulo text-marrom-950 !text-[0.66rem]">{titulo}</span><span className="block text-xs sm:text-sm text-suave mt-1">{children}</span></span>
    </li>
  );
}
