'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Foto } from '@/components/loja/foto';
import { EnviarPeca } from './enviar-peca';
import { Alerta } from '@/components/ui/basicos';
import { Botao, botao } from '@/components/ui/botao';
import { classeCampo } from '@/components/ui/formulario';
import { brl } from '@/lib/dinheiro';
import { criarPedidoDoAtendimento, incluirPeca, retirarPeca } from '@/server/acoes/atendimento';
import { buscarPecas, type PecaSelecao } from '@/server/acoes/pedidos';

type Peca = { id: number; referencia: string; nome: string; tamanho: string; quantidade: number; preco: number; imagem: string | null; disponivel: number };

/** As peças de interesse e a conversão em pedido. Com o pedido criado, oferece avisar a cliente. */
export function PecasDoAtendimento({ id, pecas, podeEditar, temFicha, pedido, telefone, instagram }: { id: string; pecas: Peca[]; podeEditar: boolean; temFicha: boolean; pedido: { id: string; codigo: string } | null; telefone: string | null; instagram: string | null }) {
  const [termo, setTermo] = useState('');
  const [achadas, setAchadas] = useState<PecaSelecao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [criado, setCriado] = useState<{ pedidoId?: string; codigo?: string; url?: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  const executar = (fn: () => Promise<{ ok: boolean; erro?: string }>) => {
    setErro(null);
    iniciar(async () => { const r = await fn(); if (!r.ok) setErro(r.erro ?? 'Não foi possível concluir.'); });
  };
  const buscar = () => iniciar(async () => setAchadas(await buscarPecas(termo)));
  const criar = (tipo: 'compra' | 'condicional') => {
    setErro(null);
    iniciar(async () => {
      const r = await criarPedidoDoAtendimento(id, tipo);
      if (r.ok) setCriado(r);
      else setErro(r.erro ?? 'Não foi possível criar o pedido.');
    });
  };
  const total = pecas.reduce((a, p) => a + p.preco * p.quantidade, 0);

  return (
    <div className="grid gap-3">
      {erro && <Alerta>{erro}</Alerta>}
      {pecas.length === 0 ? <p className="text-sm text-suave">Nenhuma peça ainda.</p> : (
        <ul className="grid gap-2">
          {pecas.map(p => (
            <li key={p.id} className="flex items-center gap-3 text-sm">
              <span className="size-12 shrink-0 bg-bege overflow-hidden">{p.imagem && <Foto src={p.imagem} alt="" sizes="48px" className="size-full object-cover" />}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-marrom-950 truncate">{p.nome}</span>
                <span className="text-suave">Tam. {p.tamanho} · {p.quantidade} × {brl(p.preco)}{p.disponivel < p.quantidade && <strong className="text-vermelho"> · {p.disponivel} disponível(is)</strong>}</span>
              </span>
              <EnviarPeca referencia={p.referencia} nome={p.nome} telefone={telefone} instagram={instagram} atendimentoId={id} />
              {podeEditar && <button type="button" disabled={pendente} onClick={() => executar(() => retirarPeca(id, p.id))} className="underline underline-offset-2 text-vermelho text-xs">Tirar</button>}
            </li>
          ))}
        </ul>
      )}
      {pecas.length > 0 && <div className="text-sm text-right">Total das peças: <strong>{brl(total)}</strong></div>}

      {pedido && <p className="text-sm">Pedido: <Link className="underline underline-offset-4 font-semibold" href={`/painel/pedidos/${pedido.id}`}>{pedido.codigo}</Link></p>}
      {criado?.pedidoId && (
        <Alerta tipo="ok">
          Pedido {criado.codigo} criado. <a href={criado.url} target="_blank" rel="noopener" className="underline font-semibold">Enviar no WhatsApp</a> · <Link className="underline" href={`/painel/pedidos/${criado.pedidoId}`}>Ver o pedido</Link>
        </Alerta>
      )}

      {podeEditar && (
        <>
          <form className="flex gap-2" onSubmit={e => { e.preventDefault(); buscar(); }}>
            <input value={termo} onChange={e => setTermo(e.target.value)} placeholder="Buscar peça por nome ou referência" aria-label="Buscar peça" className={`${classeCampo} flex-1 min-w-0`} />
            <button type="submit" disabled={pendente} className={botao('secundario')}>Buscar</button>
          </form>
          {achadas && (achadas.length === 0 ? <p className="text-sm text-suave">Nenhuma peça com estoque encontrada.</p> : (
            <ul className="grid gap-2 max-h-80 overflow-y-auto">
              {achadas.map(p => (
                <li key={p.id} className="border border-borda p-2 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold text-marrom-950">{p.nome} <span className="font-normal text-suave">· {brl(p.preco)}</span></div>
                    <EnviarPeca referencia={p.referencia} nome={p.nome} telefone={telefone} instagram={instagram} atendimentoId={id} />
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {p.variantes.map(v => <button key={v.id} type="button" disabled={pendente} aria-label={`Adicionar ${p.nome} tamanho ${v.tamanho}`} onClick={() => executar(() => incluirPeca(id, v.id))} className={botao('secundario', 'p')}>{v.tamanho}</button>)}
                  </div>
                </li>
              ))}
            </ul>
          ))}
          {pecas.length > 0 && (
            temFicha ? (
              <div className="flex flex-wrap gap-2 border-t border-borda pt-3">
                <Botao disabled={pendente} onClick={() => criar('compra')}>Criar pedido</Botao>
                <Botao variante="secundario" disabled={pendente} onClick={() => criar('condicional')}>Criar condicional</Botao>
              </div>
            ) : <p className="text-sm text-caramelo border-t border-borda pt-3">Informe o WhatsApp da cliente para criar o pedido.</p>
          )}
        </>
      )}
    </div>
  );
}
