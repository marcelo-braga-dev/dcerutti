import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Foto } from '@/components/loja/foto';
import { Galeria } from '@/components/loja/galeria';
import { QuemAtende, SelosConfianca } from '@/components/loja/pedido-publico';
import { QueroPeca } from '@/components/loja/quero-peca';
import { botao } from '@/components/ui/botao';
import { Logo } from '@/components/ui/logo';
import { Compartilhar } from '@/components/vitrine/compartilhar';
import { brl, descontoPct } from '@/lib/dinheiro';
import { linkWhatsApp } from '@/lib/whatsapp';
import { lerConfig } from '@/server/config';
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

/**
 * Link da peça (docs/26, D-32, D-36): aberto sem login, para quem recebeu de uma vendedora. O resto do catálogo
 * continua privado. Quem enviou aparece com o nome ("Ana separou esta peça para você"): atendimento de pessoa para pessoa.
 */
export default async function PaginaPeca({ params }: Props) {
  const chave = await chaveDe(params);
  const [p, marca, cfg] = await Promise.all([pecaPublica(chave), marcaAtual(), lerConfig()]);
  if (!p) notFound();
  const desconto = descontoPct(p.preco, p.precoCheio);
  const vendedora = p.contato.nome;
  const duvida = linkWhatsApp(p.contato.telefone, `Oi${vendedora ? `, ${vendedora}` : ''}! Vi a peça ${p.nome} e fiquei com dúvida no tamanho.`);
  const falar = linkWhatsApp(p.contato.telefone, `Oi${vendedora ? `, ${vendedora}` : ''}! Vi a peça ${p.nome} e queria saber mais.`);

  return (
    <main className="loja mx-auto max-w-6xl px-4 sm:px-6 pt-4 sm:pt-8 pb-32 md:pb-12 grid gap-6 sm:gap-8">
      <div className="flex items-center justify-between gap-3">
        <Logo img={marca.logo} className="h-10 sm:h-12 w-auto mix-blend-multiply" prioridade />
        <Compartilhar titulo={p.nome} className="h-10 px-4 rounded-full border border-borda-forte bg-card text-sm font-semibold text-marrom-950 inline-flex items-center gap-2 hover:border-marrom-950" />
      </div>

      <div className="grid md:grid-cols-[1.1fr_1fr] gap-6 md:gap-12 items-start">
        <div className="relative min-w-0 md:sticky md:top-6">
          <Galeria imagens={p.imagens} videos={p.videos} nome={p.nome} />
          {desconto > 0 && <span className="pointer-events-none absolute top-3 left-3 z-10 h-7 px-2.5 rounded-full bg-imperdivel text-white text-xs font-bold grid place-items-center">−{desconto}%</span>}
        </div>

        <div className="grid gap-6 min-w-0">
          {vendedora && (
            <p className="inline-flex items-center gap-2 justify-self-start h-9 pl-1.5 pr-4 rounded-full bg-card border border-borda text-sm">
              <span className="size-6 rounded-full bg-caramelo text-creme text-xs font-bold grid place-items-center" aria-hidden="true">{vendedora[0]}</span>
              <span><strong className="text-marrom-950">{vendedora}</strong> separou esta peça para você</span>
            </p>
          )}
          <header className="grid gap-2">
            <span className="rotulo !text-[0.66rem] text-caramelo">{p.marca}{p.categoria ? ` · ${p.categoria}` : ''}</span>
            <h1 className="text-2xl sm:text-3xl leading-tight text-marrom-950 font-semibold">{p.nome}</h1>
            {p.cor && <span className="text-sm text-suave">Cor: {p.cor}</span>}
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mt-1">
              <strong className={`font-display text-3xl ${desconto > 0 ? 'text-imperdivel' : 'text-marrom-950'}`}>{brl(p.preco)}</strong>
              {desconto > 0 && <span className="text-suave line-through">{brl(p.precoCheio)}</span>}
              {desconto > 0 && <span className="text-sm font-semibold text-oliva">Você economiza {brl(p.precoCheio - p.preco)}</span>}
            </div>
          </header>

          {p.cores.length > 0 && (
            <section className="grid gap-2" aria-labelledby="outras-cores">
              <h2 id="outras-cores" className="text-sm font-semibold text-marrom-950">Outras cores</h2>
              <ul className="flex gap-2 overflow-x-auto sem-barra -mx-4 px-4 md:mx-0 md:px-0">
                {p.cores.map(c => (
                  <li key={c.chave} className="shrink-0">
                    <Link href={`/peca/${encodeURIComponent(c.chave)}`} className="block w-20 text-xs text-center text-suave hover:text-marrom-950">
                      <span className="relative block aspect-[3/4] rounded-xl overflow-hidden bg-bege mb-1 ring-1 ring-borda hover:ring-marrom-950"><Foto src={c.imagem} alt="" sizes="80px" /></span>
                      {c.cor ?? 'Ver cor'}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {p.variantes.length > 0 ? (
            <QueroPeca chave={chave} variantes={p.variantes} tamanhos={p.tamanhos} peca={{ nome: p.nome, preco: p.preco, imagem: p.imagens[0] ?? null, vendedora, duvida }} />
          ) : (
            <div className="bg-card border border-borda rounded-3xl p-5 grid gap-3 justify-items-start">
              <p className="font-semibold text-marrom-950">Esta peça acabou de esgotar</p>
              <p className="text-sm text-suave">Fale com {vendedora ?? 'a loja'}: podemos ter algo parecido ou avisar quando chegar.</p>
              <a href={linkWhatsApp(p.contato.telefone, `Oi! Vi a peça ${p.nome}, mas ela esgotou. Tem algo parecido?`)} target="_blank" rel="noopener" className={botao('whatsapp', 'm')}>Falar com {vendedora ?? 'a loja'}</a>
            </div>
          )}

          <div className="bg-card border border-borda rounded-3xl p-4 sm:p-5 grid gap-3">
            <QuemAtende nome={vendedora} link={falar} />
            <SelosConfianca />
          </div>

          {(p.descricao || p.composicao || p.destaques.length > 0) && (
            <section className="grid gap-3 text-sm border-t border-borda pt-5" aria-labelledby="sobre-a-peca">
              <h2 id="sobre-a-peca" className="text-sm font-semibold text-marrom-950">Sobre a peça</h2>
              {p.descricao && <p className="whitespace-pre-line leading-relaxed text-marrom-900">{p.descricao}</p>}
              <dl className="grid gap-2">
                {p.composicao && <div><dt className="rotulo !text-[0.62rem] text-suave">Tecido</dt><dd>{p.composicao}</dd></div>}
                {p.destaques.length > 0 && <div><dt className="rotulo !text-[0.62rem] text-suave">Destaques</dt><dd><ul className="list-disc pl-4">{p.destaques.map(d => <li key={d}>{d}</li>)}</ul></dd></div>}
              </dl>
            </section>
          )}

          {cfg.vitrines.ligadas && (
            <Link href="/vitrines" className="justify-self-start text-sm underline underline-offset-4 text-marrom-950">Ver as vitrines da loja</Link>
          )}
        </div>
      </div>
    </main>
  );
}
