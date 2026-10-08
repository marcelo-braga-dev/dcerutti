'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { editarItens } from '@/server/acoes/pedidos';
import { Alerta } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { brl } from '@/lib/dinheiro';

type Item = { id: number; nome: string; tamanho: string; quantidade: number; preco: number };

/** U-08: ajustar as peças de um pedido pendente (mudar a quantidade ou retirar), antes de confirmar. */
export function EditarPedido({ pedidoId, itens }: { pedidoId: string; itens: Item[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState<Record<number, number>>(() => Object.fromEntries(itens.map(i => [i.id, i.quantidade])));
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const mudou = itens.some(i => q[i.id] !== i.quantidade);
  const total = itens.reduce((a, i) => a + i.preco * q[i.id], 0);
  const mudar = (id: number, n: number) => setQ(x => ({ ...x, [id]: Math.max(0, Math.min(20, n)) }));

  if (!aberto) return <button type="button" onClick={() => setAberto(true)} className={botao('fantasma', 'p')}>Editar peças</button>;

  const salvar = () =>
    iniciar(async () => {
      setErro(null);
      const r = await editarItens(pedidoId, q);
      if (!r.ok) return setErro(r.erro ?? 'Não foi possível salvar.');
      setAberto(false);
      router.refresh();
    });

  return (
    <div className="grid gap-3 border border-borda p-4">
      <h3 className="titulo text-base">Editar peças</h3>
      <ul className="divide-y divide-borda border-y border-borda">
        {itens.map(i => (
          <li key={i.id} className={`py-3 flex flex-wrap items-center justify-between gap-3 ${q[i.id] === 0 ? 'opacity-50' : ''}`}>
            <span className="text-sm">{i.nome} · Tam. {i.tamanho} · {brl(i.preco)}</span>
            <div className="flex items-center gap-2">
              <button type="button" aria-label={`Menos uma unidade de ${i.nome}`} disabled={q[i.id] === 0} onClick={() => mudar(i.id, q[i.id] - 1)} className="size-9 border border-borda-forte bg-card disabled:opacity-40">−</button>
              <span className="w-6 text-center tabular-nums" aria-label={`Quantidade de ${i.nome}`}>{q[i.id]}</span>
              <button type="button" aria-label={`Mais uma unidade de ${i.nome}`} onClick={() => mudar(i.id, q[i.id] + 1)} className="size-9 border border-borda-forte bg-card">+</button>
              <button type="button" onClick={() => mudar(i.id, q[i.id] === 0 ? i.quantidade : 0)} className="rotulo !text-[0.6rem] underline underline-offset-4 ml-2">
                {q[i.id] === 0 ? 'Desfazer' : 'Retirar'}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {erro && <Alerta>{erro}</Alerta>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={pendente || !mudou} onClick={salvar} className={botao('primario', 'p')}>{pendente ? 'Salvando…' : `Salvar alterações · ${brl(total)}`}</button>
        <button type="button" disabled={pendente} onClick={() => { setQ(Object.fromEntries(itens.map(i => [i.id, i.quantidade]))); setErro(null); setAberto(false); }} className={botao('fantasma', 'p')}>Descartar</button>
      </div>
      <p className="text-xs text-suave">O preço de cada peça continua o combinado. No condicional, a reserva acompanha a nova quantidade. Para trocar uma peça, retire-a e monte um novo pedido com a outra.</p>
    </div>
  );
}
