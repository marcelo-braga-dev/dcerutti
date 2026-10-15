import Link from 'next/link';
import type { CorModelo } from '@/lib/catalogo';
import { corClara, tomDaCor } from '@/lib/cores';
import { Foto } from './foto';

/** Bolinha de uma cor: o tom aproximado, a estampa ou, sem tom conhecido, a foto da peça. */
export function BolinhaCor({ c, tamanho = 'size-4', atual }: { c: CorModelo; tamanho?: string; atual?: boolean }) {
  const tom = tomDaCor(c.cor);
  const anel = atual ? 'ring-2 ring-marrom-950 ring-offset-2 ring-offset-creme' : '';
  if (tom === 'estampa')
    return <span className={`block rounded-full ${tamanho} ${anel} bg-[conic-gradient(#c0312b,#e7c447,#4f7d4c,#3f6ea8,#5f3f86,#c0312b)]`} />;
  if (tom) return <span className={`block rounded-full ${tamanho} ${anel} ${corClara(tom) ? 'border border-borda-forte' : ''}`} style={{ background: tom }} />;
  return <span className={`relative block rounded-full overflow-hidden bg-bege ${tamanho} ${anel}`}><Foto src={c.imagem} alt="" sizes="24px" /></span>;
}

/** Cores do card: até 5 bolinhas (cada uma abre aquela cor) e "+N". */
export function CoresDoCard({ cores, atual }: { cores: CorModelo[]; atual: string }) {
  if (cores.length < 2) return null;
  const mostrar = cores.slice(0, 5);
  return (
    <div className="mt-2 flex items-center gap-1.5" aria-label={`${cores.length} cores`}>
      {mostrar.map(c => (
        <Link key={c.referencia} href={`/produto/${encodeURIComponent(c.referencia)}`} title={c.cor ?? undefined} aria-label={c.cor ? `Cor ${c.cor}` : 'Outra cor'}
          className={`p-1 -m-1 ${c.disponivel ? '' : 'opacity-40'}`}>
          <BolinhaCor c={c} atual={c.referencia === atual} />
        </Link>
      ))}
      {cores.length > mostrar.length && <span className="text-xs text-suave">+{cores.length - mostrar.length}</span>}
    </div>
  );
}
