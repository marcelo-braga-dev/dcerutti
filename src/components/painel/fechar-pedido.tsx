'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { cancelar, confirmar } from '@/server/acoes/pedidos';
import { Alerta } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { brl } from '@/lib/dinheiro';

type Item = { id: number; nome: string; tamanho: string; quantidade: number; preco: number };

/** Confirmação do pedido. No condicional, cada peça é marcada como "ficou" ou "voltou" (RN-08). */
export function FecharPedido({ pedidoId, codigo, condicional, itens }: { pedidoId: string; codigo: string; condicional: boolean; itens: Item[] }) {
  const router = useRouter();
  const [situacoes, setSituacoes] = useState<Record<number, 'vendido' | 'devolvido'>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const faltam = condicional ? itens.filter(i => !situacoes[i.id]).length : 0;
  const total = itens.reduce((a, i) => a + (condicional ? (situacoes[i.id] === 'vendido' ? i.preco * i.quantidade : 0) : i.preco * i.quantidade), 0);

  const executar = (fn: () => Promise<{ ok: boolean; erro?: string }>) =>
    iniciar(async () => {
      setErro(null);
      const r = await fn();
      if (!r.ok) setErro(r.erro ?? 'Não foi possível concluir.');
      else router.refresh();
    });

  const marcarTodos = (s: 'vendido' | 'devolvido') => setSituacoes(Object.fromEntries(itens.map(i => [i.id, s])));

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
                <div className="flex" role="radiogroup" aria-label={`Situação de ${i.nome}`}>
                  {(['vendido', 'devolvido'] as const).map(s => (
                    <button key={s} type="button" role="radio" aria-checked={situacoes[i.id] === s} onClick={() => setSituacoes(x => ({ ...x, [i.id]: s }))}
                      className={`h-9 px-3 rotulo border ${situacoes[i.id] === s ? (s === 'vendido' ? 'bg-oliva text-creme border-oliva' : 'bg-marrom-950 text-creme border-marrom-950') : 'border-borda-forte bg-card'}`}>
                      {s === 'vendido' ? 'Ficou' : 'Voltou'}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {erro && <Alerta>{erro}</Alerta>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={pendente || faltam > 0} onClick={() => executar(() => confirmar(pedidoId, situacoes))} className={botao('oliva')}>
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
