'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { brl } from '@/lib/dinheiro';
import { plural } from '@/lib/pedido';
import { IconeFechar } from '@/components/ui/icones';
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
      className="fixed z-40 top-[4.5rem] sm:top-24 right-2 left-2 sm:left-auto sm:right-6 sm:w-96 bg-card border border-borda shadow-2xl animate-[aparecer_.25s_ease-out]">
      <div className="flex items-center justify-between pl-4 pr-1 h-12 border-b border-borda">
        <span className="rotulo text-oliva">✓ Peça na sacola</span>
        <button type="button" onClick={() => setAberta(null)} className="size-11 grid place-items-center text-suave hover:text-marrom-950" aria-label="Fechar"><IconeFechar className="size-5" /></button>
      </div>
      <div className="flex gap-3 p-4">
        <div className="relative w-16 shrink-0 aspect-[3/4] bg-bege"><Foto src={i.imagem} alt="" sizes="64px" /></div>
        <div className="min-w-0 text-sm">
          <div className="text-marrom-950 line-clamp-2">{i.nome}</div>
          <div className="text-suave mt-1">Tam. {i.tamanho}{i.cor ? ` · ${i.cor}` : ''}</div>
          <div className="font-display font-extrabold mt-1">{brl(i.preco)}</div>
        </div>
      </div>
      <div className="px-4 pb-4 grid gap-3">
        <div className="flex justify-between text-sm border-t border-borda pt-3">
          <span className="text-suave">Sua sacola · {plural(quantidade, 'peça', 'peças')}</span>
          <span className="font-semibold">{brl(subtotal)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setAberta(null)} className="h-11 border border-marrom-950 rotulo text-marrom-950 hover:bg-bege">Continuar</button>
          <Link href="/sacola" className="h-11 grid place-items-center bg-marrom-950 text-creme rotulo hover:bg-marrom-700">Ver sacola</Link>
        </div>
      </div>
    </div>
  );
}
