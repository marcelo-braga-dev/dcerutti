import Link from 'next/link';
import type { ComponentProps } from 'react';

type Variante = 'primario' | 'secundario' | 'fantasma' | 'perigo' | 'claro' | 'oliva';
type Tamanho = 'p' | 'm' | 'g';

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-marrom-950 text-creme hover:bg-marrom-700 border border-marrom-950',
  secundario: 'bg-transparent text-marrom-950 border border-marrom-950 hover:bg-marrom-950 hover:text-creme',
  fantasma: 'bg-transparent text-marrom-950 border border-transparent hover:border-borda-forte',
  perigo: 'bg-transparent text-vermelho border border-vermelho hover:bg-vermelho hover:text-creme',
  claro: 'bg-creme text-marrom-950 border border-creme hover:bg-bege',
  oliva: 'bg-oliva text-creme border border-oliva hover:brightness-110',
};
const TAMANHOS: Record<Tamanho, string> = { p: 'h-8 px-3 text-[0.68rem]', m: 'h-11 px-5 text-[0.72rem]', g: 'h-13 px-7 text-[0.78rem]' };

export function botao(variante: Variante = 'primario', tamanho: Tamanho = 'm', extra = '') {
  return `inline-flex items-center justify-center gap-2 rotulo whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer ${VARIANTES[variante]} ${TAMANHOS[tamanho]} ${extra}`;
}

type Base = { variante?: Variante; tamanho?: Tamanho };

export function Botao({ variante, tamanho, className = '', type = 'button', ...p }: ComponentProps<'button'> & Base) {
  return <button type={type} className={botao(variante, tamanho, className)} {...p} />;
}

export function BotaoLink({ variante, tamanho, className = '', ...p }: ComponentProps<typeof Link> & Base) {
  return <Link className={botao(variante, tamanho, className)} {...p} />;
}
