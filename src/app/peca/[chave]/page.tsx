import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Foto } from '@/components/loja/foto';
import { Galeria } from '@/components/loja/galeria';
import { QueroPeca } from '@/components/loja/quero-peca';
import { botao } from '@/components/ui/botao';
import { Logo } from '@/components/ui/logo';
import { brl } from '@/lib/dinheiro';
import { linkWhatsApp } from '@/lib/whatsapp';
import { pecaPublica } from '@/server/consultas/peca-publica';
import { marcaAtual } from '@/server/marca';
import { urlDoSite } from '@/server/site';

type Props = { params: Promise<{ chave: string }> };

const chaveDe = async (params: Props['params']) => decodeURIComponent((await params).chave);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const chave = await chaveDe(params);
  const p = await pecaPublica(chave);
  if (!p) return { title: 'Peça não encontrada', robots: { index: false, follow: false } };
  const [site, { nome }] = await Promise.all([urlDoSite(), marcaAtual()]);
  const titulo = `${p.nome} · ${nome}`;
  const imagem = { url: `${site}/peca/${encodeURIComponent(chave)}/cartao.jpg`, width: 1200, height: 630, type: 'image/jpeg', alt: p.nome };
  return {
    title: { absolute: titulo }, description: brl(p.preco), robots: { index: false, follow: false },
    openGraph: { type: 'website', siteName: nome, locale: 'pt_BR', title: titulo, description: brl(p.preco), url: `${site}/peca/${encodeURIComponent(chave)}`, images: [imagem] },
    twitter: { card: 'summary_large_image', title: titulo, description: brl(p.preco), images: [imagem.url] },
  };
}

/** Link da peça (docs/26, D-32): aberto sem login, para quem recebeu de uma vendedora. O resto do catálogo continua privado. */
export default async function PaginaPeca({ params }: Props) {
  const chave = await chaveDe(params);
  const [p, marca] = await Promise.all([pecaPublica(chave), marcaAtual()]);
  if (!p) notFound();
  const desconto = p.precoCheio > p.preco;

  return (
    <main className="loja mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-10 grid gap-6">
      <Logo img={marca.logo} className="h-12 w-auto justify-self-start mix-blend-multiply" prioridade />
      <div className="grid md:grid-cols-2 gap-8 items-start">
        <Galeria imagens={p.imagens} videos={p.videos} nome={p.nome} />
        <div className="grid gap-5">
          <header className="grid gap-1">
            <span className="rotulo text-caramelo">{p.marca}</span>
            <h1 className="titulo text-3xl leading-tight">{p.nome}</h1>
            <div className="flex items-baseline gap-2 mt-1">
              <strong className="font-display text-2xl">{brl(p.preco)}</strong>
              {desconto && <span className="text-suave line-through">{brl(p.precoCheio)}</span>}
            </div>
          </header>
          {p.variantes.length > 0 ? <QueroPeca chave={chave} variantes={p.variantes} /> : (
            <div className="grid gap-3 justify-items-start">
              <p className="text-suave">Esta peça acabou de esgotar. Fale com a gente para ver outras opções.</p>
              <a href={linkWhatsApp(p.contato.telefone, `Oi! Vi a peça ${p.nome}, mas ela esgotou. Tem algo parecido?`)} target="_blank" rel="noopener" className={botao('whatsapp', 'm')}>Falar com {p.contato.nome ?? 'a loja'}</a>
            </div>
          )}
          {p.cores.length > 0 && (
            <section className="grid gap-2">
              <h2 className="rotulo text-suave">Outras cores</h2>
              <ul className="flex flex-wrap gap-2">
                {p.cores.map(c => (
                  <li key={c.chave}>
                    <Link href={`/peca/${encodeURIComponent(c.chave)}`} className="block w-20 text-xs text-center hover:underline">
                      <span className="relative block aspect-[3/4] bg-bege mb-1"><Foto src={c.imagem} alt="" sizes="80px" /></span>
                      {c.cor ?? 'Ver cor'}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {(p.descricao || p.composicao) && (
            <section className="grid gap-2 text-sm border-t border-borda pt-4">
              {p.descricao && <p className="whitespace-pre-line">{p.descricao}</p>}
              {p.composicao && <p className="text-suave">Composição: {p.composicao}</p>}
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
