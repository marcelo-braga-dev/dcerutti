'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { cancelar, confirmar } from '@/server/acoes/pedidos';
import { Alerta } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { brl } from '@/lib/dinheiro';

type Item = { id: number; nome: string; tamanho: string; quantidade: number; preco: number };

/** Confirmação do pedido. No condicional, marca quantas unidades de cada peça ficaram (RN-08; B-13: pode ser parte). */
export function FecharPedido({ pedidoId, codigo, condicional, itens }: { pedidoId: string; codigo: string; condicional: boolean; itens: Item[] }) {
  const router = useRouter();
  const [ficaram, setFicaram] = useState<Record<number, number>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const faltam = condicional ? itens.filter(i => ficaram[i.id] == null).length : 0;
  const total = itens.reduce((a, i) => a + i.preco * (condicional ? (ficaram[i.id] ?? 0) : i.quantidade), 0);

  const executar = (fn: () => Promise<{ ok: boolean; erro?: string }>) =>
    iniciar(async () => {
      setErro(null);
      const r = await fn();
      if (!r.ok) setErro(r.erro ?? 'Não foi possível concluir.');
      else router.refresh();
    });

  const marcarTodos = (s: 'vendido' | 'devolvido') => setFicaram(Object.fromEntries(itens.map(i => [i.id, s === 'vendido' ? i.quantidade : 0])));
  const marcar = (id: number, n: number) => setFicaram(x => ({ ...x, [id]: n }));

  return (
    <div className="grid gap-4">
      {condicional && (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="titulo text-base">O que ficou com o cliente?</h3>
            <div className="flex gap-2">
              <button type="button" className={botao('fantasma', 'p')} onClick={() => marcarTodos('vendido')}>Ficou tudo</button>
              <button type="button" className={botao('fantasma', 'p')} onClick={() => marcarTodos('devolvido')}>Voltou tudo</button>
            </div>
          </div>
          <ul className="divide-y divide-borda border-y border-borda">
            {itens.map(i => (
              <li key={i.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm">{i.nome} · Tam. {i.tamanho}{i.quantidade > 1 ? ` · ${i.quantidade} un.` : ''}</span>
                {i.quantidade > 1 ? (
                  <label className="flex items-center gap-2 text-sm">
                    <span className="rotulo !text-[0.6rem] text-suave">Ficaram</span>
                    <select value={ficaram[i.id] ?? ''} onChange={e => marcar(i.id, Number(e.target.value))} className="h-9 border border-borda-forte bg-card px-2" aria-label={`Unidades de ${i.nome} que ficaram`}>
                      <option value="" disabled>—</option>
                      {Array.from({ length: i.quantidade + 1 }, (_, n) => <option key={n} value={n}>{n} de {i.quantidade}</option>)}
                    </select>
                  </label>
                ) : (
                  <div className="flex" role="radiogroup" aria-label={`Situação de ${i.nome}`}>
                    {([['Ficou', 1], ['Voltou', 0]] as const).map(([rotulo, n]) => (
                      <button key={rotulo} type="button" role="radio" aria-checked={ficaram[i.id] === n} onClick={() => marcar(i.id, n)}
                        className={`h-9 px-3 rotulo border ${ficaram[i.id] === n ? (n ? 'bg-oliva text-creme border-oliva' : 'bg-marrom-950 text-creme border-marrom-950') : 'border-borda-forte bg-card'}`}>
                        {rotulo}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {erro && <Alerta>{erro}</Alerta>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={pendente || faltam > 0} onClick={() => executar(() => confirmar(pedidoId, ficaram))} className={botao('oliva')}>
          {pendente ? 'Salvando…' : condicional ? `Fechar condicional · venda de ${brl(total)}` : `Confirmar venda · ${brl(total)}`}
        </button>
        <button type="button" disabled={pendente} onClick={() => confirm(`Cancelar ${codigo}?`) && executar(() => cancelar(pedidoId))} className={botao('perigo')}>
          Cancelar pedido
        </button>
      </div>
      {faltam > 0 && <p className="text-sm text-suave">{faltam === 1 ? 'Marque a peça restante para fechar.' : `Marque as ${faltam} peças restantes para fechar.`}</p>}
      <p className="text-sm text-suave">
        {condicional ? 'As peças que ficaram saem do estoque e viram venda; as que voltaram são liberadas para venda de novo.' : 'Ao confirmar, as peças saem do estoque e a venda entra na meta do vendedor.'}
      </p>
    </div>
  );
}
