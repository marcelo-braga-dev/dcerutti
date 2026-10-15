import Link from 'next/link';
import { brl, descontoPct } from '@/lib/dinheiro';
import { emEstoque, type ProdutoCatalogo } from '@/lib/catalogo';
import { nomeDoModelo } from '@/lib/cores';
import { CoresDoCard } from './cores';
import { BotaoFavorito } from './favoritos';
import { Foto } from './foto';

/**
 * Card da vitrine: foto 3:4 (a segunda aparece ao passar o mouse), um selo só, nome, preço, cores do modelo e os
 * tamanhos disponíveis. As cores e o link da peça são separados (uma bolinha abre aquela cor).
 */
export function CartaoProduto({ p, parcelas, prioridade }: { p: ProdutoCatalogo; parcelas: number; prioridade?: boolean }) {
  const desconto = descontoPct(p.preco, p.precoCheio);
  const esgotado = !emEstoque(p);
  const tamanhos = p.variantes.filter(v => v.disponivel > 0).map(v => v.tamanho);
  const restam = p.variantes.reduce((a, v) => a + v.disponivel, 0);
  const href = `/produto/${encodeURIComponent(p.referencia)}`;
  const selo = p.imperdivel
    ? { texto: desconto ? `Imperdível −${desconto}%` : 'Imperdível', cor: 'bg-imperdivel text-white' }
    : desconto ? { texto: `−${desconto}%`, cor: 'bg-caramelo text-creme' } : null;

  return (
    <article className="group relative">
      <Link href={href} className="block relative aspect-[3/4] bg-[#efebe5] overflow-hidden" tabIndex={-1} aria-hidden="true">
        <Foto src={p.imagens[0]} alt="" sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" prioridade={prioridade}
          className={`transition duration-500 group-hover:scale-[1.03] ${p.imagens[1] ? 'lg:group-hover:opacity-0' : ''} ${esgotado ? 'grayscale-[60%] opacity-80' : ''}`} />
        {p.imagens[1] && <Foto src={p.imagens[1]} alt="" sizes="25vw" className="hidden lg:block opacity-0 transition duration-500 group-hover:opacity-100 group-hover:scale-[1.03]" />}
        <span className="absolute left-2 top-2 flex flex-col items-start gap-1">
          {selo && <span className={`rotulo !text-[0.6rem] px-2 py-1 ${selo.cor}`}>{selo.texto}</span>}
          {!esgotado && restam === 1 && <span className="rotulo !text-[0.58rem] px-2 py-1 bg-card/90 text-marrom-950">Última peça</span>}
        </span>
        {esgotado && <span className="absolute inset-x-0 bottom-0 bg-marrom-950/80 text-creme text-center py-2 rotulo">Esgotado</span>}
      </Link>
      <BotaoFavorito produtoId={p.id} nome={p.nome} className="absolute right-2 top-2 z-10" />
      <div className="pt-3">
        <div className="rotulo !text-[0.6rem] text-suave">{p.marca}</div>
        <h3 className="mt-1 text-[0.92rem] leading-snug text-marrom-950 line-clamp-2">
          <Link href={href} className="hover:underline underline-offset-4">{(p.cores?.length ?? 0) > 1 ? nomeDoModelo(p.nome) : p.nome}</Link>
        </h3>
        <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
          <span data-preco className={`font-display font-extrabold ${p.imperdivel ? 'text-imperdivel' : desconto ? 'text-caramelo' : 'text-marrom-950'}`}>{brl(p.preco)}</span>
          {desconto > 0 && <s className="text-sm text-suave">{brl(p.precoCheio)}</s>}
        </div>
        {parcelas > 1 && <div className="text-xs text-suave">ou {parcelas}x de {brl(p.preco / parcelas)}</div>}
        <CoresDoCard cores={p.cores ?? []} atual={p.referencia} />
        {!esgotado && tamanhos.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1" aria-label={`Tamanhos disponíveis: ${tamanhos.join(', ')}`}>
            {tamanhos.slice(0, 6).map(t => <span key={t} className="min-w-7 h-6 px-1 grid place-items-center border border-borda-forte text-[0.68rem] font-display font-bold text-marrom-900">{t}</span>)}
            {tamanhos.length > 6 && <span className="h-6 px-1 grid place-items-center text-[0.68rem] text-suave">+{tamanhos.length - 6}</span>}
          </div>
        )}
      </div>
    </article>
  );
}
