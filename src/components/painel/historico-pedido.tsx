import type { PedidoHistorico } from '@prisma/client';
import { formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import type { PecaHistorico } from '@/server/historico';

const ACAO = { criado: 'Pedido feito', editado: 'Alterado', confirmado: 'Confirmado', cancelado: 'Cancelado' } as const;

const autorDe = (h: PedidoHistorico, nomeCliente: string) =>
  h.autor === 'cliente' ? `${nomeCliente} (cliente)` : h.autor === 'equipe' ? h.nomeUsuario ?? 'Equipe' : 'Sistema';

/** Rastreio do pedido, do mais recente para o mais antigo: cada alteração da equipe e, por último, o que a cliente pediu. */
export function HistoricoPedido({ historico, nomeCliente }: { historico: PedidoHistorico[]; nomeCliente: string }) {
  if (!historico.length) return <p className="text-sm text-suave">Sem registros. O histórico começa na próxima alteração deste pedido.</p>;
  return (
    <ol className="grid gap-5 border-l border-borda-forte pl-5">
      {historico.map(h => {
        const pecas = h.itens as PecaHistorico[];
        const mudancas = h.mudancas as string[];
        const unidades = pecas.reduce((a, p) => a + p.quantidade, 0);
        return (
          <li key={h.id} className="relative grid gap-1 text-sm">
            <span className={`absolute -left-[25px] top-1.5 size-2.5 rounded-full ${h.acao === 'editado' ? 'bg-caramelo' : h.acao === 'cancelado' ? 'bg-vermelho' : h.acao === 'confirmado' ? 'bg-oliva' : 'bg-marrom-950'}`} />
            <div className="flex flex-wrap items-baseline gap-x-2">
              <strong className="text-marrom-950">{ACAO[h.acao]}</strong>
              <span className="text-suave">por {autorDe(h, nomeCliente)} · {formatarDataHora(h.criadoEm)}</span>
            </div>
            {mudancas.length > 0 && <ul className="grid gap-0.5 list-disc pl-4">{mudancas.map((m, i) => <li key={i}>{m}</li>)}</ul>}
            {h.observacao && <p className="italic text-suave">“{h.observacao}”</p>}
            <details className="mt-1">
              <summary className="cursor-pointer text-suave rotulo !text-[0.6rem]">
                {h.acao === 'criado' ? 'O que a cliente pediu' : 'Peças depois desta ação'} · {unidades} {unidades === 1 ? 'peça' : 'peças'} · {brl(h.total)}
              </summary>
              <ul className="mt-2 grid gap-1">
                {pecas.map((p, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span>{p.quantidade}× {p.nome}{p.cor ? ` · ${p.cor}` : ''} · tam. {p.tamanho} <span className="text-suave">· Ref. {p.referencia}</span></span>
                    <span className="tabular-nums whitespace-nowrap">
                      {p.precoTabela != null && p.precoTabela > p.preco && <s className="text-suave mr-1">{brl(p.precoTabela)}</s>}
                      {brl(p.preco)}
                    </span>
                  </li>
                ))}
                {h.frete != null && <li className="flex justify-between text-suave"><span>Frete</span><span>{Number(h.frete) ? brl(h.frete) : 'grátis'}</span></li>}
              </ul>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
