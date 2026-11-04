import Link from 'next/link';
import { brl, descontoPct } from '@/lib/dinheiro';
import { emEstoque, type ProdutoCatalogo } from '@/lib/catalogo';
import { nomeDoModelo } from '@/lib/cores';
import { AdicaoRapida } from './adicao-rapida';
import { CoresDoCard } from './cores';
import { BotaoFavorito } from './favoritos';
import { Foto } from './foto';

/**
 * Card da vitrine: foto 3:4 com cantos arredondados (a segunda aparece ao passar o mouse), selos de oferta e de
 * urgência, compra rápida por tamanho no computador, nome, preço com parcelas e as cores do modelo.
 */
export function CartaoProduto({ p, parcelas, prioridade }: { p: ProdutoCatalogo; parcelas: number; prioridade?: boolean }) {
  const desconto = descontoPct(p.preco, p.precoCheio);
  const esgotado = !emEstoque(p);
  const restam = p.variantes.reduce((a, v) => a + v.disponivel, 0);
  const tamanhos = p.variantes.filter(v => v.disponivel > 0).map(v => v.tamanho);
  const href = `/produto/${encodeURIComponent(p.referencia)}`;

  return (
    <article className="group relative">
      <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-[#efebe5]">
        <Link href={href} className="absolute inset-0" tabIndex={-1} aria-hidden="true">
          <Foto src={p.imagens[0]} alt="" sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" prioridade={prioridade}
            className={`transition duration-700 ease-out group-hover:scale-[1.04] ${p.imagens[1] ? 'lg:group-hover:opacity-0' : ''} ${esgotado ? 'grayscale-[60%] opacity-75' : ''}`} />
          {p.imagens[1] && <Foto src={p.imagens[1]} alt="" sizes="25vw" className="hidden lg:block opacity-0 transition duration-700 ease-out group-hover:opacity-100 group-hover:scale-[1.04]" />}
        </Link>
        <span className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1.5 pointer-events-none">
          {p.imperdivel && <span className="px-2.5 py-1 rounded-full bg-imperdivel text-white text-[0.68rem] font-bold">Imperdível</span>}
          {desconto > 0 && <span className={`px-2.5 py-1 rounded-full text-[0.68rem] font-bold ${p.imperdivel ? 'bg-card text-imperdivel' : 'bg-marrom-950 text-creme'}`}>−{desconto}%</span>}
          {!esgotado && restam === 1 && <span className="px-2.5 py-1 rounded-full bg-card/95 text-caramelo text-[0.68rem] font-bold">Última peça</span>}
        </span>
        {esgotado && <span className="absolute inset-x-2.5 bottom-2.5 rounded-full bg-marrom-950/85 text-creme text-center py-2 text-xs font-semibold pointer-events-none">Esgotado</span>}
        <AdicaoRapida p={p} />
      </div>
      <BotaoFavorito produtoId={p.id} nome={p.nome} className="absolute right-2.5 top-2.5 z-10" />
      <div className="pt-3 px-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-suave truncate">{p.marca}</span>
          {!esgotado && tamanhos.length > 0 && (
            <span className="text-[0.7rem] text-suave truncate" aria-label={`Tamanhos disponíveis: ${tamanhos.join(', ')}`}>
              {tamanhos.slice(0, 5).join(' · ')}{tamanhos.length > 5 ? ' +' : ''}
            </span>
          )}
        </div>
        <h3 className="mt-1 text-[0.92rem] leading-snug text-marrom-950 line-clamp-2">
          <Link href={href} className="hover:underline underline-offset-4 decoration-borda-forte">{(p.cores?.length ?? 0) > 1 ? nomeDoModelo(p.nome) : p.nome}</Link>
        </h3>
        <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
          <span data-preco className={`text-base font-extrabold tracking-tight ${p.imperdivel || desconto ? 'text-imperdivel' : 'text-marrom-950'}`}>{brl(p.preco)}</span>
          {desconto > 0 && <s className="text-[0.8rem] text-suave">{brl(p.precoCheio)}</s>}
        </div>
        {parcelas > 1 && <div className="text-xs text-suave mt-0.5">ou {parcelas}x de {brl(p.preco / parcelas)}</div>}
        <CoresDoCard cores={p.cores ?? []} atual={p.referencia} />
      </div>
    </article>
  );
}
