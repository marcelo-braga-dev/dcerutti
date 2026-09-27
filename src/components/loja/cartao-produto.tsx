import Link from 'next/link';
import { brl, descontoPct } from '@/lib/dinheiro';
import { emEstoque, type ProdutoCatalogo } from '@/lib/catalogo';
import { Foto } from './foto';

export function CartaoProduto({ p, parcelas, prioridade }: { p: ProdutoCatalogo; parcelas: number; prioridade?: boolean }) {
  const desconto = descontoPct(p.preco, p.precoCheio);
  const esgotado = !emEstoque(p);
  const tamanhos = p.variantes.filter(v => v.disponivel > 0).map(v => v.tamanho);
  return (
    <Link href={`/produto/${p.referencia}`} className="group block">
      <div className="relative aspect-[3/4] bg-bege overflow-hidden">
        <Foto src={p.imagens[0]} alt={p.nome} sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" prioridade={prioridade} className={`transition-opacity duration-300 ${p.imagens[1] ? 'group-hover:opacity-0' : ''}`} />
        {p.imagens[1] && <Foto src={p.imagens[1]} alt="" sizes="(max-width: 640px) 50vw, 25vw" className="opacity-0 transition-opacity duration-300 group-hover:opacity-100" />}
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
          {p.imperdivel && <span className="rotulo !text-[0.6rem] bg-imperdivel text-white px-2 py-1">Imperdível</span>}
          {desconto > 0 && <span className="rotulo !text-[0.6rem] bg-card text-caramelo px-2 py-1">-{desconto}%</span>}
        </div>
        {esgotado && <div className="absolute inset-x-0 bottom-0 bg-marrom-950/80 text-creme text-center py-2 rotulo">Esgotado</div>}
      </div>
      <div className="pt-3">
        <div className="rotulo !text-[0.62rem] text-suave">{p.marca}</div>
        <h3 className="mt-1 text-[0.95rem] leading-snug text-marrom-950 line-clamp-2 group-hover:underline underline-offset-4">{p.nome}</h3>
        <div className="mt-2 flex items-baseline gap-2 flex-wrap">
          <span className={`font-display font-extrabold ${p.imperdivel ? 'text-imperdivel' : desconto ? 'text-caramelo' : 'text-marrom-950'}`}>{brl(p.preco)}</span>
          {desconto > 0 && <span className="text-sm text-suave line-through">{brl(p.precoCheio)}</span>}
        </div>
        {parcelas > 1 && <div className="text-xs text-suave">ou {parcelas}x de {brl(p.preco / parcelas)}</div>}
        {!esgotado && <div className="mt-1 text-xs text-suave truncate">{tamanhos.join(' · ')}</div>}
      </div>
    </Link>
  );
}
