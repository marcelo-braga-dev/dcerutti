import Link from 'next/link';
import { nomeDoMes, somarMeses } from '@/lib/datas';

export function SeletorMes({ mes, base, atual }: { mes: string; base: string; atual: string }) {
  const link = (m: string) => `${base}${base.includes('?') ? '&' : '?'}mes=${m}`;
  return (
    <div className="flex items-center gap-1">
      <Link href={link(somarMeses(mes, -1))} className="size-10 grid place-items-center border border-borda-forte bg-card" aria-label="Mês anterior">‹</Link>
      <span className="px-3 rotulo min-w-40 text-center">{nomeDoMes(mes)}</span>
      {mes < atual ? <Link href={link(somarMeses(mes, 1))} className="size-10 grid place-items-center border border-borda-forte bg-card" aria-label="Próximo mês">›</Link> : <span className="size-10" />}
    </div>
  );
}
