'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { cancelar, confirmar } from '@/server/acoes/pedidos';
import { Alerta } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { classeCampo } from '@/components/ui/formulario';
import { Popup } from '@/components/ui/popup';
import { brl } from '@/lib/dinheiro';
import { Foto } from '@/components/loja/foto';
import { IconeCheck, IconeFechar, IconeInfo } from '@/components/ui/icones';

type Item = { id: number; nome: string; tamanho: string; quantidade: number; preco: number; imagem?: string | null };

/** Confirmação do pedido. No condicional, marca quantas unidades de cada peça ficaram (RN-08; B-13: pode ser parte). */
export function FecharPedido({ pedidoId, codigo, condicional, itens, cupom, vencido = false }: { pedidoId: string; codigo: string; condicional: boolean; itens: Item[]; cupom?: { codigo: string; desconto: number } | null; vencido?: boolean }) {
  const router = useRouter();
  const [ficaram, setFicaram] = useState<Record<number, number>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const [cancelando, setCancelando] = useState(false);
  const faltam = condicional ? itens.filter(i => ficaram[i.id] == null).length : 0;
  // Compra: o cupom já está calculado. Condicional: é refeito no fechamento sobre o que ficar (o valor aqui é antes dele).
  const total = itens.reduce((a, i) => a + i.preco * (condicional ? (ficaram[i.id] ?? 0) : i.quantidade), 0) - (!condicional && cupom ? cupom.desconto : 0);

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
    <div className="grid gap-3">
      {condicional && (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-marrom-950 font-semibold">O que ficou com o cliente?</span>
            <div className="flex gap-1">
              <button type="button" className="h-7 px-2.5 rounded-full border border-borda-forte text-xs font-semibold hover:border-oliva hover:text-oliva" onClick={() => marcarTodos('vendido')}>Ficou tudo</button>
              <button type="button" className="h-7 px-2.5 rounded-full border border-borda-forte text-xs font-semibold hover:border-marrom-950" onClick={() => marcarTodos('devolvido')}>Voltou tudo</button>
            </div>
          </div>
          <ul className="divide-y divide-borda rounded-xl border border-borda px-3">
            {itens.map(i => (
              <li key={i.id} className="py-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 min-w-0 text-sm">
                  {i.imagem !== undefined && <span className="relative w-8 aspect-[3/4] shrink-0 rounded overflow-hidden bg-bege"><Foto src={i.imagem} alt="" sizes="32px" /></span>}
                  <span className="min-w-0"><span className="block truncate">{i.nome}</span><span className="block text-xs text-suave">Tam. {i.tamanho}{i.quantidade > 1 ? ` · ${i.quantidade} un.` : ''}</span></span>
                </span>
                {i.quantidade > 1 ? (
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-xs text-suave">Ficaram</span>
                    <select value={ficaram[i.id] ?? ''} onChange={e => marcar(i.id, Number(e.target.value))} className="h-8 border border-borda-forte bg-card px-2 text-sm" aria-label={`Unidades de ${i.nome} que ficaram`}>
                      <option value="" disabled>—</option>
                      {Array.from({ length: i.quantidade + 1 }, (_, n) => <option key={n} value={n}>{n} de {i.quantidade}</option>)}
                    </select>
                  </label>
                ) : (
                  <div className="flex shrink-0 p-0.5 rounded-full bg-creme border border-borda" role="radiogroup" aria-label={`Situação de ${i.nome}`}>
                    {([['Ficou', 1], ['Voltou', 0]] as const).map(([rotulo, n]) => (
                      <button key={rotulo} type="button" role="radio" aria-checked={ficaram[i.id] === n} onClick={() => marcar(i.id, n)}
                        className={`h-7 px-3 rounded-full text-xs font-semibold transition ${ficaram[i.id] === n ? (n ? 'bg-oliva text-creme' : 'bg-marrom-950 text-creme') : 'text-suave hover:text-marrom-950'}`}>
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
      <div className="grid gap-2">
        <button type="button" disabled={pendente || faltam > 0} onClick={() => executar(() => confirmar(pedidoId, ficaram))} className={botao('oliva', 'm', 'w-full')}>
          <IconeCheck className="size-4" />{pendente ? 'Salvando…' : condicional ? `Fechar condicional · venda de ${brl(total)}` : `Confirmar venda · ${brl(total)}`}
        </button>
        <button type="button" disabled={pendente} onClick={() => { setErro(null); setCancelando(true); }} className={botao('perigo', 'p', 'w-full !h-9')}>
          <IconeFechar className="size-3.5" />Cancelar pedido
        </button>
      </div>
      {cancelando && <CancelarPedido pedidoId={pedidoId} codigo={codigo} condicional={condicional} vencido={vencido} fechar={() => setCancelando(false)} />}
      {faltam > 0 && <p className="text-xs font-semibold text-caramelo text-center">{faltam === 1 ? 'Marque a peça restante para fechar.' : `Marque as ${faltam} peças restantes para fechar.`}</p>}
      <p className="flex items-start gap-1.5 text-xs text-suave">
        <IconeInfo className="size-3.5 mt-px shrink-0" />
        <span>{condicional ? 'O que ficou sai do estoque e vira venda; o que voltou é liberado.' : 'As peças saem do estoque e a venda entra na meta do vendedor.'}
        {condicional && cupom && ` O cupom ${cupom.codigo} é recalculado sobre o que ficar (o valor acima é antes dele).`}</span>
      </p>
    </div>
  );
}

const MOTIVOS_RAPIDOS = ['Cliente desistiu', 'Cliente não respondeu', 'Peça sem estoque', 'Pedido em duplicidade', 'Cliente vai fazer outro pedido'];
const MOTIVO_VENCIDO = 'Prazo vencido sem resposta';
const MOTIVOS_VENDA = ['Cliente devolveu as peças', 'Venda registrada por engano', 'Cliente desistiu da compra', 'Troca por outro pedido'];

/**
 * Popup do cancelamento: o motivo é obrigatório e fica no histórico do pedido.
 * `vencido`: o prazo do pendente venceu (D-17) e o motivo rápido do prazo vem marcado.
 * `confirmado`: desfaz a venda (as peças voltam ao estoque e a venda sai das metas e relatórios).
 */
export function CancelarPedido({ pedidoId, codigo, condicional, vencido = false, confirmado = false, fechar }: {
  pedidoId: string; codigo: string; condicional: boolean; vencido?: boolean; confirmado?: boolean; fechar: () => void;
}) {
  const router = useRouter();
  const [motivo, setMotivo] = useState(vencido ? MOTIVO_VENCIDO : '');
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const valido = motivo.trim().length >= 3;
  const rapidos = confirmado ? MOTIVOS_VENDA : vencido ? [MOTIVO_VENCIDO, ...MOTIVOS_RAPIDOS] : MOTIVOS_RAPIDOS;

  const confirmar = () =>
    iniciar(async () => {
      setErro(null);
      const r = await cancelar(pedidoId, motivo, { expirado: vencido && motivo === MOTIVO_VENCIDO });
      if (!r.ok) return setErro(r.erro ?? 'Não foi possível cancelar.');
      fechar();
      router.refresh();
    });

  return (
    <Popup titulo={confirmado ? `Cancelar a venda ${codigo}` : `Cancelar ${codigo}`} fechar={() => !pendente && fechar()}>
      <p className="text-sm text-suave">
        {confirmado
          ? 'As peças vendidas voltam ao estoque, a venda sai das metas e dos relatórios e o uso do cupom é liberado.'
          : condicional ? 'As peças reservadas voltam para o estoque.' : 'O pedido sai da lista de pendentes.'}{' '}
        O cancelamento não pode ser desfeito.
      </p>
      <div className="flex flex-wrap gap-2" aria-label="Motivos rápidos">
        {rapidos.map(m => (
          <button key={m} type="button" onClick={() => setMotivo(m)} aria-pressed={motivo === m}
            className={`h-8 px-3 border text-xs ${motivo === m ? 'bg-marrom-950 text-creme border-marrom-950' : 'border-borda-forte hover:bg-bege'}`}>
            {m}
          </button>
        ))}
      </div>
      <label className="grid gap-2">
        <span className="rotulo text-suave">Motivo do cancelamento</span>
        <textarea value={motivo} onChange={e => setMotivo(e.target.value.slice(0, 500))} rows={3} autoFocus required placeholder="Escreva o motivo ou escolha um acima" className={classeCampo} />
      </label>
      {erro && <Alerta>{erro}</Alerta>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-borda pt-4">
        <button type="button" disabled={pendente} onClick={fechar} className={botao('fantasma', 'm')}>Voltar</button>
        <button type="button" disabled={pendente || !valido} onClick={confirmar} className={botao('perigo', 'm')}>{pendente ? 'Cancelando…' : confirmado ? 'Cancelar venda' : 'Cancelar pedido'}</button>
      </div>
    </Popup>
  );
}

/** Pedido confirmado: botão para desfazer a venda (as peças voltam ao estoque). */
export function CancelarVenda({ pedidoId, codigo, condicional }: { pedidoId: string; codigo: string; condicional: boolean }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className={botao('perigo', 'p')}>Cancelar venda</button>
      {aberto && <CancelarPedido pedidoId={pedidoId} codigo={codigo} condicional={condicional} confirmado fechar={() => setAberto(false)} />}
    </>
  );
}
