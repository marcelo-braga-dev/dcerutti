'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { brl } from '@/lib/dinheiro';
import { plural } from '@/lib/pedido';
import { IconeCheck, IconeFechar } from '@/components/ui/icones';
import { Foto } from './foto';
import { useSacola } from './sacola';

/**
 * Painel que aparece ao pôr uma peça na sacola: a peça, quantas peças e o total, "Ver sacola" e "Continuar comprando".
 * Não bloqueia a tela (dá para escolher outro tamanho em seguida); fecha sozinho em 6 s, menos com o mouse em cima.
 */
export function GavetaSacola() {
  const { ultimo, quantidade, subtotal } = useSacola();
  const caminho = usePathname();
  const [aberta, setAberta] = useState<number | null>(null);
  const pausada = useRef(false);

  // Cada adição reabre o painel; trocar de página fecha.
  const [visto, setVisto] = useState(ultimo?.em ?? 0);
  if (ultimo && ultimo.em !== visto) { setVisto(ultimo.em); setAberta(ultimo.em); }
  const [pagina, setPagina] = useState(caminho);
  if (pagina !== caminho) { setPagina(caminho); setAberta(null); }

  useEffect(() => {
    if (aberta == null) return;
    const t = setInterval(() => { if (!pausada.current && Date.now() - aberta > 6000) setAberta(null); }, 500);
    return () => clearInterval(t);
  }, [aberta]);

  if (aberta == null || !ultimo) return null;
  const i = ultimo.item;
  return (
    <div role="status" aria-live="polite" onMouseEnter={() => { pausada.current = true; }} onMouseLeave={() => { pausada.current = false; setAberta(Date.now()); }}
      className="fixed z-40 top-3 sm:top-6 right-3 left-3 sm:left-auto sm:right-6 sm:w-[400px] bg-card rounded-3xl border border-borda shadow-2xl shadow-marrom-950/20 overflow-hidden animate-[aparecer_.25s_ease-out]">
      <div className="flex items-center justify-between pl-5 pr-2 h-14">
        <span className="flex items-center gap-2 text-sm font-semibold text-oliva">
          <span className="size-6 grid place-items-center rounded-full bg-oliva text-creme"><IconeCheck className="size-3.5" /></span>Peça na sacola
        </span>
        <button type="button" onClick={() => setAberta(null)} className="size-10 grid place-items-center rounded-full text-suave hover:bg-creme hover:text-marrom-950" aria-label="Fechar"><IconeFechar className="size-5" /></button>
      </div>
      <div className="flex gap-4 px-5 pb-4">
        <div className="relative w-16 shrink-0 aspect-[3/4] rounded-xl overflow-hidden bg-bege"><Foto src={i.imagem} alt="" sizes="64px" /></div>
        <div className="min-w-0 text-sm">
          <div className="text-marrom-950 font-medium line-clamp-2">{i.nome}</div>
          <div className="text-suave mt-1">Tam. {i.tamanho}{i.cor ? ` · ${i.cor}` : ''}</div>
          <div className="font-bold mt-1">{brl(i.preco)}</div>
        </div>
      </div>
      <div className="px-5 pb-5 grid gap-3">
        <div className="flex justify-between text-sm rounded-2xl bg-creme px-4 py-3">
          <span className="text-suave">Sua sacola · {plural(quantidade, 'peça', 'peças')}</span>
          <span className="font-bold">{brl(subtotal)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setAberta(null)} className="h-12 rounded-full border border-borda-forte text-sm font-semibold text-marrom-950 hover:border-marrom-950">Continuar</button>
          <Link href="/sacola" className="h-12 grid place-items-center rounded-full bg-marrom-950 text-creme text-sm font-semibold hover:bg-marrom-700">Ver sacola</Link>
        </div>
      </div>
    </div>
  );
}
