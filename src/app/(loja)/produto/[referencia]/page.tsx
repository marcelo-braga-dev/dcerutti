import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CartaoProduto } from '@/components/loja/cartao-produto';
import { Comprar } from '@/components/loja/comprar';
import { Galeria } from '@/components/loja/galeria';
import { brl, descontoPct } from '@/lib/dinheiro';
import { emEstoque } from '@/lib/catalogo';
import { catalogo, produtoPorReferencia } from '@/server/catalogo';
import { lerConfig } from '@/server/config';

type Props = { params: Promise<{ referencia: string }> };

export async function generateMetadata({ params }: Props) {
  const p = await produtoPorReferencia((await params).referencia);
  return { title: p?.nome ?? 'Produto' };
}

export default async function Produto({ params }: Props) {
  const p = await produtoPorReferencia((await params).referencia);
  if (!p) notFound();
  const [lista, cfg] = await Promise.all([catalogo(), lerConfig()]);
  const desconto = descontoPct(p.preco, p.precoCheio);
  const relacionados = lista
    .filter(x => x.categoriaSlug === p.categoriaSlug && x.id !== p.id && emEstoque(x))
    .sort((a, b) => Number(b.genero === p.genero) - Number(a.genero === p.genero) || b.imagens.length - a.imagens.length)
    .slice(0, 8);
  const secoes = [
    ['Descrição', p.descricao || `${p.nome} da ${p.marca}. Peça em estoque na D’Cerutti; fale com seu vendedor para mais detalhes.`],
    ['Composição', [p.composicao, `Ref. ${p.referencia}`].filter(Boolean).join(' · ')],
    ['Destaques', p.destaques.join(' · ') || '—'],
  ];

  return (
    <div className="py-6 sm:py-10">
      <nav className="text-sm text-suave mb-6 flex flex-wrap gap-2" aria-label="Caminho">
        <Link href="/catalogo" className="hover:text-caramelo">Catálogo</Link>/
        <Link href={`/catalogo?genero=${p.genero}`} className="hover:text-caramelo capitalize">{p.genero}</Link>/
        <Link href={`/catalogo?categoria=${p.categoriaSlug}`} className="hover:text-caramelo">{p.categoria}</Link>
      </nav>
      <div className="grid lg:grid-cols-[1.1fr_1fr] gap-8 lg:gap-14">
        <Galeria imagens={p.imagens} nome={p.nome} />
        <div className="lg:sticky lg:top-28 self-start grid gap-6">
          <div>
            <div className="flex flex-wrap gap-2 items-center">
              <span className="rotulo text-suave">{p.marca}</span>
              {p.imperdivel && <span className="rotulo !text-[0.6rem] bg-imperdivel text-white px-2 py-1">Imperdível</span>}
            </div>
            <h1 className="titulo text-2xl sm:text-3xl mt-2 !normal-case !tracking-normal">{p.nome}</h1>
            <p className="text-suave text-sm mt-1">Ref. {p.referencia}{p.cor ? ` · ${p.cor}` : ''}</p>
          </div>
          <div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className={`font-display font-extrabold text-3xl ${p.imperdivel ? 'text-imperdivel' : desconto ? 'text-caramelo' : 'text-marrom-950'}`}>{brl(p.preco)}</span>
              {desconto > 0 && (<><span className="text-suave line-through">{brl(p.precoCheio)}</span><span className="rotulo text-caramelo">-{desconto}%</span></>)}
            </div>
            {cfg.parcelas > 1 && <p className="text-sm text-suave mt-1">ou {cfg.parcelas}x de {brl(p.preco / cfg.parcelas)}</p>}
          </div>
          <Comprar p={p} />
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div className="border border-borda p-4"><div className="rotulo text-marrom-950">Condicional</div><p className="text-suave mt-1">Em {cfg.cidadeCondicional}, prove em casa e pague só o que ficar.</p></div>
            <div className="border border-borda p-4"><div className="rotulo text-marrom-950">Frete</div><p className="text-suave mt-1">Grátis nas compras acima de {brl(cfg.frete.gratisAcima)}.</p></div>
          </div>
          <div className="border-t border-borda">
            {secoes.map(([t, texto], i) => (
              <details key={t} open={i === 0} className="group border-b border-borda">
                <summary className="flex justify-between cursor-pointer py-4 rotulo text-marrom-950 list-none">
                  {t}<span className="group-open:rotate-45 transition-transform text-lg leading-none">+</span>
                </summary>
                <p className="pb-5 text-suave leading-relaxed whitespace-pre-line">{texto}</p>
              </details>
            ))}
          </div>
        </div>
      </div>

      {relacionados.length > 0 && (
        <section className="mt-20">
          <h2 className="titulo text-2xl mb-6">Você também pode gostar</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-8">
            {relacionados.map(x => <CartaoProduto key={x.id} p={x} parcelas={cfg.parcelas} />)}
          </div>
        </section>
      )}
    </div>
  );
}
