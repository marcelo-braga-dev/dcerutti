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
      {pecas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-borda-forte p-6 text-center text-sm text-suave">Nenhuma peça ainda. Busque abaixo e adicione as peças da live ou da publicação.</div>
      ) : (
        <ul className="grid gap-2.5">
          {pecas.map((p, i) => {
            const desconto = p.oferta != null && p.oferta < p.preco ? Math.round((1 - p.oferta / p.preco) * 100) : 0;
            return (
              <li key={p.id} className={`grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto_auto] items-center gap-x-4 gap-y-3 rounded-2xl border border-borda bg-creme/40 p-2.5 sm:pr-3 ${p.ativa ? '' : 'opacity-60'}`}>
                <span className="relative w-14 h-[4.6rem] shrink-0 rounded-xl overflow-hidden bg-bege"><Foto src={p.imagem} alt="" sizes="56px" /></span>
                <div className="min-w-0 text-sm grid gap-1">
                  <div className="font-semibold text-marrom-950 truncate">{i + 1}. {p.nome}</div>
                  <div className="text-suave">{desconto > 0 ? <><s>{brl(p.preco)}</s> <strong className="text-imperdivel">{brl(p.oferta!)}</strong> <span className="text-imperdivel font-semibold">−{desconto}%</span></> : brl(p.preco)}</div>
                  <div className="flex flex-wrap gap-1">
                    {p.tamanhos.length ? p.tamanhos.map(t => <span key={t} className="h-5 px-1.5 rounded-md bg-card border border-borda text-[0.68rem] font-semibold grid place-items-center">{t}</span>)
                      : <span className="text-xs text-vermelho">{p.ativa ? 'Sem estoque' : 'Fora do catálogo'}</span>}
                  </div>
                </div>
                <form className="col-span-2 sm:col-span-1 flex items-center gap-1.5" onSubmit={e => { e.preventDefault(); const texto = String(new FormData(e.currentTarget).get('oferta') ?? ''); executar(() => salvarOferta(id, p.id, texto)); }}>
                  <input key={String(p.oferta)} name="oferta" defaultValue={p.oferta == null ? '' : String(p.oferta).replace('.', ',')} inputMode="decimal" placeholder="Preço especial" aria-label={`Preço especial de ${p.nome}`} className={`${classeCampo} !h-9 w-full sm:w-32 text-sm`} />
                  <button type="submit" disabled={pendente} className={botao('secundario', 'p')}>Salvar</button>
                </form>
                <span className="col-span-2 sm:col-span-1 flex items-center justify-end gap-0.5">
                  <button type="button" disabled={pendente || i === 0} onClick={() => executar(() => moverPeca(id, p.id, -1))} aria-label={`Subir ${p.nome}`} title="Subir" className="size-9 grid place-items-center rounded-lg hover:bg-bege disabled:opacity-30">↑</button>
                  <button type="button" disabled={pendente || i === pecas.length - 1} onClick={() => executar(() => moverPeca(id, p.id, 1))} aria-label={`Descer ${p.nome}`} title="Descer" className="size-9 grid place-items-center rounded-lg hover:bg-bege disabled:opacity-30">↓</button>
                  <button type="button" disabled={pendente} onClick={() => executar(() => tirarPecaDaVitrine(id, p.id))} aria-label={`Tirar ${p.nome}`} className="h-9 px-2.5 rounded-lg text-sm text-vermelho hover:bg-vermelho/10">Tirar</button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="grid gap-3 rounded-2xl bg-creme/60 border border-borda p-3">
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); iniciar(async () => setAchadas(await buscarPecas(termo))); }}>
          <input value={termo} onChange={e => setTermo(e.target.value)} placeholder="Buscar peça por nome, referência ou cor" aria-label="Buscar peça para a vitrine" className={`${classeCampo} flex-1 min-w-0`} />
          <button type="submit" disabled={pendente} className={botao('primario')}>Buscar</button>
        </form>
        {achadas && (achadas.length === 0 ? <p className="text-sm text-suave px-1">Nenhuma peça com estoque encontrada.</p> : (
          <ul className="grid sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto">
            {achadas.map(p => (
              <li key={p.id} className="flex items-center gap-3 rounded-xl bg-card border border-borda p-2">
                <span className="relative w-10 h-12 shrink-0 rounded-lg overflow-hidden bg-bege"><Foto src={p.imagem} alt="" sizes="40px" /></span>
                <span className="min-w-0 flex-1 text-sm"><span className="block truncate text-marrom-950">{p.nome}</span><span className="text-suave">{brl(p.preco)}</span></span>
                <Botao variante={naVitrine.has(p.id) ? 'fantasma' : 'secundario'} tamanho="p" disabled={pendente || naVitrine.has(p.id)} aria-label={`Adicionar ${p.nome}`} onClick={() => executar(() => incluirPecaNaVitrine(id, p.id))}>{naVitrine.has(p.id) ? 'Na vitrine ✓' : '+ Adicionar'}</Botao>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}

/** Copia um texto: endereço da vitrine, legenda. */
export function BotaoCopiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button type="button" className={botao('secundario', 'p')} onClick={async () => { await navigator.clipboard?.writeText(texto).then(() => setCopiado(true), () => setCopiado(false)); }}>
      {copiado ? 'Copiado ✓' : rotulo}
    </button>
  );
}
