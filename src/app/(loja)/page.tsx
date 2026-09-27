import Link from 'next/link';
import { CartaoProduto } from '@/components/loja/cartao-produto';
import { Foto } from '@/components/loja/foto';
import { botao } from '@/components/ui/botao';
import { emEstoque, emPromocao } from '@/lib/catalogo';
import { catalogo } from '@/server/catalogo';
import { lerConfig } from '@/server/config';

export default async function Inicio() {
  const [lista, cfg] = await Promise.all([catalogo(), lerConfig()]);
  const comFoto = lista.filter(p => emEstoque(p) && p.imagens.length);
  const novidades = [...comFoto].reverse().slice(0, 8);
  const imperdiveis = comFoto.filter(p => p.imperdivel).slice(0, 4);
  const destaqueGenero = (g: string) => comFoto.find(p => p.genero === g && p.imagens[1])?.imagens[1] ?? comFoto.find(p => p.genero === g)?.imagens[0];
  const categorias = ['Camisetas', 'Camisas', 'Calças', 'Bermudas', 'Blusas', 'Moletons']
    .map(nome => ({ nome, p: comFoto.find(p => p.categoria === nome) }))
    .filter(c => c.p);
  const marcas = [...new Map(lista.map(p => [p.marcaSlug, p.marca])).entries()].map(([slug, nome]) => ({ slug, nome, n: lista.filter(p => p.marcaSlug === slug).length }));

  return (
    <div className="py-6 sm:py-10 grid gap-16">
      <section className="grid sm:grid-cols-2 gap-3">
        {[['feminino', 'Feminino'], ['masculino', 'Masculino']].map(([g, rotulo], i) => (
          <Link key={g} href={`/catalogo?genero=${g}`} className="group relative aspect-[4/5] sm:aspect-[3/4] lg:aspect-[4/5] overflow-hidden bg-bege">
            <Foto src={destaqueGenero(g)} alt={rotulo} sizes="(max-width: 640px) 100vw, 50vw" prioridade={i === 0} className="transition-transform duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-marrom-950/70 via-transparent" />
            <div className="absolute bottom-6 left-6 text-creme">
              <div className="rotulo text-areia">Coleção Hering</div>
              <div className="titulo !text-creme text-4xl sm:text-5xl mt-1">{rotulo}</div>
              <span className={botao('claro', 'm', 'mt-4')}>Ver peças</span>
            </div>
          </Link>
        ))}
      </section>

      <section className="grid lg:grid-cols-[1fr_2fr] gap-8 items-center bg-marrom-950 text-creme p-8 sm:p-12">
        <div>
          <div className="rotulo text-areia">Condicional em {cfg.cidadeCondicional.split('/')[0]}</div>
          <h2 className="titulo !text-creme text-3xl mt-2">Prove em casa, pague só o que ficar</h2>
        </div>
        <ol className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          {['Monte sua sacola', 'Envie pelo WhatsApp', 'Receba e prove com calma', 'Pague só o que ficar'].map((t, i) => (
            <li key={t}>
              <div className="font-display font-extrabold text-3xl text-areia">0{i + 1}</div>
              <div className="mt-1 text-sm">{t}</div>
            </li>
          ))}
        </ol>
      </section>

      {imperdiveis.length > 0 && (
        <Vitrine titulo="Imperdível" sobre="Preço de ocasião" link="/catalogo?imperdivel=1">
          {imperdiveis.map((p, i) => <CartaoProduto key={p.id} p={p} parcelas={cfg.parcelas} prioridade={i < 2} />)}
        </Vitrine>
      )}

      <section>
        <div className="flex items-end justify-between mb-6">
          <h2 className="titulo text-2xl">Categorias</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {categorias.map(c => (
            <Link key={c.nome} href={`/catalogo?categoria=${c.p!.categoriaSlug}`} className="group relative aspect-[3/4] overflow-hidden bg-bege">
              <Foto src={c.p!.imagens[0]} alt={c.nome} sizes="(max-width: 640px) 50vw, 16vw" className="transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute inset-x-0 bottom-0 bg-card/90 py-2 text-center rotulo text-marrom-950">{c.nome}</div>
            </Link>
          ))}
        </div>
      </section>

      <Vitrine titulo="Novidades" sobre="Chegou na loja" link="/catalogo">
        {novidades.map(p => <CartaoProduto key={p.id} p={p} parcelas={cfg.parcelas} />)}
      </Vitrine>

      <section className="grid sm:grid-cols-3 gap-3">
        {marcas.map(m => (
          <Link key={m.slug} href={`/catalogo?marca=${m.slug}`} className="border border-marrom-950 p-6 hover:bg-marrom-950 hover:text-creme transition-colors">
            <div className="titulo text-xl !text-inherit">{m.nome}</div>
            <div className="mt-1 text-sm opacity-70">{m.n} peças</div>
          </Link>
        ))}
      </section>

      {comFoto.some(emPromocao) && (
        <div className="text-center">
          <Link href="/catalogo?promo=1" className={botao('secundario', 'g')}>Ver todas as promoções</Link>
        </div>
      )}
    </div>
  );
}

function Vitrine({ titulo, sobre, link, children }: { titulo: string; sobre: string; link: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-end justify-between mb-6 gap-4">
        <div>
          <div className="rotulo text-caramelo">{sobre}</div>
          <h2 className="titulo text-2xl mt-1">{titulo}</h2>
        </div>
        <Link href={link} className="rotulo text-marrom-950 underline underline-offset-4">Ver tudo</Link>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-8">{children}</div>
    </section>
  );
}
