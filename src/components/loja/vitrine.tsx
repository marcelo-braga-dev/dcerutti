import Link from 'next/link';
import type { ProdutoCatalogo } from '@/lib/catalogo';
import { CartaoProduto } from './cartao-produto';

/** Vitrine de produtos: carrossel com deslize no celular, grade de 4 no computador. */
export function Vitrine({ titulo, sobre, produtos, parcelas, link, rotuloLink = 'Ver tudo' }: {
  titulo: string; sobre?: string; produtos: ProdutoCatalogo[]; parcelas: number; link?: string; rotuloLink?: string;
}) {
  if (!produtos.length) return null;
  return (
    <section className="min-w-0">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          {sobre && <div className="rotulo text-caramelo">{sobre}</div>}
          <h2 className="titulo text-2xl sm:text-3xl mt-1">{titulo}</h2>
        </div>
        {link && <Link href={link} className="rotulo text-marrom-950 underline underline-offset-4 shrink-0">{rotuloLink}</Link>}
      </div>
      <div className="flex lg:grid lg:grid-cols-4 gap-3 lg:gap-x-4 lg:gap-y-10 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 scroll-px-4 sm:-mx-8 sm:px-8 sm:scroll-px-8 lg:mx-0 lg:px-0 [scrollbar-width:none]">
        {produtos.map((p, i) => (
          <div key={p.id} className="shrink-0 w-[46%] sm:w-[31%] lg:w-auto snap-start">
            <CartaoProduto p={p} parcelas={parcelas} prioridade={i < 2} />
          </div>
        ))}
      </div>
    </section>
  );
}
