'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { pecasParaRecomprar } from '@/server/acoes/recompra';
import { useSacola } from './sacola';

/** "Comprar de novo": põe na sacola as peças do pedido que ainda têm estoque e abre a sacola (ou avisa o que acabou). */
export function ComprarDeNovo({ pedidoId }: { pedidoId: string }) {
  const { juntar } = useSacola();
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  const comprar = () => iniciar(async () => {
    const r = await pecasParaRecomprar(pedidoId).catch(() => null);
    if (!r) return setAviso('Não deu para buscar as peças agora. Tente de novo.');
    if (!r.itens.length) return setAviso('Nenhuma peça deste pedido está disponível agora.');
    juntar(r.itens);
    if (r.indisponiveis.length) setAviso(`Na sacola! Não estão mais disponíveis: ${r.indisponiveis.join(', ')}.`);
    else router.push('/sacola');
  });
  return (
    <span className="grid justify-items-end gap-1">
      <button type="button" onClick={comprar} disabled={pendente} className="rotulo !text-[0.65rem] text-marrom-950 underline underline-offset-4 hover:text-caramelo disabled:opacity-50">
        {pendente ? 'Separando…' : 'Comprar de novo'}
      </button>
      {aviso && <span role="status" className="text-xs text-suave max-w-xs text-right">{aviso} {aviso.startsWith('Na sacola') && <Link href="/sacola" className="underline text-marrom-950">Ver sacola</Link>}</span>}
    </span>
  );
}
