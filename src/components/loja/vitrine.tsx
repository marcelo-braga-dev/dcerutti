import type { ReactNode } from 'react';
import type { ProdutoCatalogo } from '@/lib/catalogo';
import { IconeFlecha } from '@/components/ui/icones';
import { CartaoProduto } from './cartao-produto';
import { LinkEditavel } from './editavel';

/** No editor visual: o campo do link "Ver tudo" e o nome dele na janela de edição. */
type EditarLink = { campo: string; rotulo: string };

/** Título de seção da loja: chamada pequena, título em serifa e o link "Ver tudo" em pílula. */
export function TituloSecao({ titulo, sobre, link, rotuloLink = 'Ver tudo', editarLink, id }: { titulo: ReactNode; sobre?: ReactNode; link?: string; rotuloLink?: string; editarLink?: EditarLink; id?: string }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-6 sm:mb-8">
      <div className="min-w-0">
        {sobre && <div className="rotulo !text-[0.66rem] text-caramelo">{sobre}</div>}
        <h2 id={id} className="titulo text-[1.75rem] sm:text-4xl mt-1.5 leading-none">{titulo}</h2>
      </div>
      {link && (
        <LinkEditavel {...editarLink} posicao="lado" href={link} className="group shrink-0 h-10 pl-4 pr-3 inline-flex items-center gap-2 rounded-full border border-borda-forte text-sm font-semibold text-marrom-950 hover:bg-marrom-950 hover:text-creme hover:border-marrom-950 transition-colors">
          {rotuloLink}<IconeFlecha className="size-4 transition-transform group-hover:translate-x-0.5" />
        </LinkEditavel>
      )}
    </div>
  );
}

/** Vitrine de produtos: carrossel com deslize no celular e no tablet, grade de 4 no computador. */
export function Vitrine({ titulo, sobre, produtos, parcelas, link, rotuloLink = 'Ver tudo', editarLink }: {
  titulo: ReactNode; sobre?: ReactNode; produtos: ProdutoCatalogo[]; parcelas: number; link?: string; rotuloLink?: string; editarLink?: EditarLink;
}) {
  if (!produtos.length) return null;
  return (
    <section className="min-w-0">
      <TituloSecao titulo={titulo} sobre={sobre} link={link} rotuloLink={rotuloLink} editarLink={editarLink} />
      <div className="flex lg:grid lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-x-5 lg:gap-y-10 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 scroll-px-4 sm:-mx-8 sm:px-8 sm:scroll-px-8 lg:mx-0 lg:px-0 sem-barra">
        {produtos.map((p, i) => (
          <div key={p.id} className="shrink-0 w-[46%] sm:w-[31%] lg:w-auto snap-start">
            <CartaoProduto p={p} parcelas={parcelas} prioridade={i < 2} />
          </div>
        ))}
      </div>
    </section>
  );
}
