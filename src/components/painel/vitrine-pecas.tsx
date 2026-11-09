'use client';

import { useState, useTransition } from 'react';
import { Foto } from '@/components/loja/foto';
import { Alerta } from '@/components/ui/basicos';
import { Botao, botao } from '@/components/ui/botao';
import { classeCampo } from '@/components/ui/formulario';
import { brl } from '@/lib/dinheiro';
import { buscarPecas, type PecaSelecao } from '@/server/acoes/pedidos';
import { incluirPecaNaVitrine, moverPeca, salvarOferta, tirarPecaDaVitrine } from '@/server/acoes/vitrines';

type Peca = { id: number; produtoId: number; nome: string; imagem: string | null; preco: number; oferta: number | null; tamanhos: string[]; ativa: boolean };

/** As peças da vitrine: buscar, ordenar, preço especial e tirar. */
export function VitrinePecas({ id, pecas }: { id: string; pecas: Peca[] }) {
  const [termo, setTermo] = useState('');
  const [achadas, setAchadas] = useState<PecaSelecao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const executar = (fn: () => Promise<{ ok: boolean; erro?: string }>) => {
    setErro(null);
    iniciar(async () => { const r = await fn(); if (!r.ok) setErro(r.erro ?? 'Não foi possível concluir.'); });
  };
  const naVitrine = new Set(pecas.map(p => p.produtoId));

  return (
    <div className="grid gap-4">
      {erro && <Alerta>{erro}</Alerta>}
      {pecas.length === 0 ? <p className="text-sm text-suave">Nenhuma peça ainda. Busque abaixo.</p> : (
        <ul className="grid gap-3">
          {pecas.map((p, i) => (
            <li key={p.id} className={`flex flex-wrap items-center gap-3 border border-borda p-2 ${p.ativa ? '' : 'opacity-60'}`}>
              <span className="relative w-12 h-16 shrink-0 bg-bege overflow-hidden"><Foto src={p.imagem} alt="" sizes="48px" /></span>
              <div className="min-w-0 flex-1 basis-40 text-sm">
                <div className="font-semibold text-marrom-950">{p.nome}</div>
                <div className="text-suave">{brl(p.preco)}{p.tamanhos.length ? ` · ${p.tamanhos.join(', ')}` : ' · sem estoque'}</div>
              </div>
              <form className="flex items-center gap-1" onSubmit={e => { e.preventDefault(); const texto = String(new FormData(e.currentTarget).get('oferta') ?? ''); executar(() => salvarOferta(id, p.id, texto)); }}>
                <input key={String(p.oferta)} name="oferta" defaultValue={p.oferta == null ? '' : String(p.oferta).replace('.', ',')} inputMode="decimal" placeholder="Preço especial" aria-label={`Preço especial de ${p.nome}`} className={`${classeCampo} !h-9 w-32 text-sm`} />
                <button type="submit" disabled={pendente} className={botao('secundario', 'p')}>Salvar</button>
              </form>
              <span className="flex items-center gap-1 text-sm">
                <button type="button" disabled={pendente || i === 0} onClick={() => executar(() => moverPeca(id, p.id, -1))} aria-label={`Subir ${p.nome}`} className="px-2 py-1 disabled:text-borda-forte">↑</button>
                <button type="button" disabled={pendente || i === pecas.length - 1} onClick={() => executar(() => moverPeca(id, p.id, 1))} aria-label={`Descer ${p.nome}`} className="px-2 py-1 disabled:text-borda-forte">↓</button>
                <button type="button" disabled={pendente} onClick={() => executar(() => tirarPecaDaVitrine(id, p.id))} aria-label={`Tirar ${p.nome}`} className="underline underline-offset-2 text-vermelho px-1">Tirar</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); iniciar(async () => setAchadas(await buscarPecas(termo))); }}>
        <input value={termo} onChange={e => setTermo(e.target.value)} placeholder="Buscar peça por nome ou referência" aria-label="Buscar peça para a vitrine" className={`${classeCampo} flex-1 min-w-0`} />
        <button type="submit" disabled={pendente} className={botao('secundario')}>Buscar</button>
      </form>
      {achadas && (achadas.length === 0 ? <p className="text-sm text-suave">Nenhuma peça com estoque encontrada.</p> : (
        <ul className="grid gap-2 max-h-72 overflow-y-auto">
          {achadas.map(p => (
            <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">{p.nome} <span className="text-suave">· {brl(p.preco)}</span></span>
              <Botao variante="secundario" tamanho="p" disabled={pendente || naVitrine.has(p.id)} aria-label={`Adicionar ${p.nome}`} onClick={() => executar(() => incluirPecaNaVitrine(id, p.id))}>{naVitrine.has(p.id) ? 'Na vitrine' : 'Adicionar'}</Botao>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

/** Copia um texto: endereço da vitrine, legenda. */
export function BotaoCopiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button type="button" className={botao('secundario', 'p')} onClick={async () => { await navigator.clipboard?.writeText(texto).then(() => setCopiado(true), () => setCopiado(false)); }}>
      {copiado ? 'Copiado' : rotulo}
    </button>
  );
}
