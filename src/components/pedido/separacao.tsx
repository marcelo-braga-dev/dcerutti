'use client';

import { useEffect, useState } from 'react';
import { Foto } from '@/components/loja/foto';
import { brl } from '@/lib/dinheiro';

type Item = { id: number; nome: string; marca: string; referencia: string; cor: string | null; tamanho: string; codigoInterno: string | null; quantidade: number; preco: number; imagem: string | null; situacao: string };

/** Marcações só neste aparelho, por pedido: a vendedora volta ao link e continua de onde parou. */
const chave = (codigo: string) => `dcerutti-separacao-${codigo}`;
function lerMarcadas(codigo: string): number[] {
  try { const v = JSON.parse(localStorage.getItem(chave(codigo)) ?? '[]'); return Array.isArray(v) ? v.filter(n => typeof n === 'number') : []; } catch { return []; }
}

/**
 * Lista de separação do pedido público (D-20, D-36): peças grandes com tamanho, referência e código à vista, tocar marca
 * como separada (lembrado no aparelho) e "Copiar lista" para o estoque.
 */
export function Separacao({ codigo, itens, separavel }: { codigo: string; itens: Item[]; separavel: boolean }) {
  const [marcadas, setMarcadas] = useState<number[]>([]);
  // Depois de montar: o servidor não sabe o que foi marcado neste aparelho (evita diferença na hidratação).
  useEffect(() => { const t = setTimeout(() => setMarcadas(lerMarcadas(codigo)), 0); return () => clearTimeout(t); }, [codigo]);
  const [copiado, setCopiado] = useState(false);
  const ativos = itens.filter(i => i.situacao !== 'devolvido');
  const pecas = ativos.reduce((a, i) => a + i.quantidade, 0);
  const feitas = ativos.filter(i => marcadas.includes(i.id)).reduce((a, i) => a + i.quantidade, 0);

  const alternar = (id: number) => setMarcadas(m => {
    const n = m.includes(id) ? m.filter(x => x !== id) : [...m, id];
    try { localStorage.setItem(chave(codigo), JSON.stringify(n)); } catch { /* sem armazenamento */ }
    return n;
  });
  const copiar = async () => {
    const texto = [`${codigo} · ${pecas} ${pecas === 1 ? 'peça' : 'peças'}`, ...ativos.map(i => `• ${i.quantidade}× ${i.nome}${i.cor ? ` (${i.cor})` : ''} · tam. ${i.tamanho} · Ref. ${i.referencia}${i.codigoInterno ? ` · Cód. ${i.codigoInterno}` : ''}`)].join('\n');
    try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch { /* sem permissão */ }
  };

  return (
    <section className="grid gap-4" aria-label="Peças do pedido">
      {separavel && (
        <div className="sticky top-0 z-10 -mx-4 px-4 sm:mx-0 sm:px-0 py-3 bg-creme/90 backdrop-blur-md flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1 grid gap-1.5">
            <span className="text-sm"><strong className="text-marrom-950">{feitas} de {pecas}</strong> <span className="text-suave">{pecas === 1 ? 'peça separada' : 'peças separadas'}</span></span>
            <span className="h-1.5 rounded-full bg-bege overflow-hidden" aria-hidden="true"><span className="block h-full rounded-full bg-oliva transition-all" style={{ width: `${pecas ? (feitas / pecas) * 100 : 0}%` }} /></span>
          </div>
          <button type="button" onClick={copiar} className="shrink-0 h-10 px-4 rounded-full border border-borda-forte bg-card text-sm font-semibold text-marrom-950 hover:border-marrom-950">{copiado ? 'Lista copiada ✓' : 'Copiar lista'}</button>
        </div>
      )}
      <ul className="grid sm:grid-cols-2 gap-4">
        {itens.map(i => {
          const feita = marcadas.includes(i.id);
          const devolvida = i.situacao === 'devolvido';
          return (
            <li key={i.id} className={`bg-card border rounded-3xl overflow-hidden grid grid-cols-[7.5rem_1fr] sm:grid-cols-1 transition-colors ${feita ? 'border-oliva ring-1 ring-oliva' : 'border-borda'} ${devolvida ? 'opacity-50' : ''}`}>
              <div className="relative aspect-[3/4] bg-bege">
                <Foto src={i.imagem} alt={i.nome} sizes="(min-width: 640px) 320px, 120px" />
                <span className="absolute top-2 left-2 h-8 min-w-8 px-2.5 rounded-full bg-marrom-950 text-creme font-display font-extrabold grid place-items-center text-sm">{i.tamanho}</span>
                {i.quantidade > 1 && <span className="absolute top-2 right-2 h-8 px-2.5 rounded-full bg-card text-marrom-950 font-bold grid place-items-center text-sm">{i.quantidade}×</span>}
              </div>
              <div className="p-3 sm:p-4 grid gap-1.5 content-start">
                <div className="rotulo !text-[0.6rem] text-suave">{i.marca}</div>
                <div className="text-marrom-950 leading-snug">{i.nome}</div>
                <dl className="flex flex-wrap gap-1.5 text-xs">
                  {i.cor && <div className="h-6 px-2 rounded-md bg-creme border border-borda grid place-items-center"><dt className="sr-only">Cor</dt><dd>{i.cor}</dd></div>}
                  <div className="h-6 px-2 rounded-md bg-creme border border-borda grid place-items-center"><dt className="sr-only">Referência</dt><dd>Ref. {i.referencia}</dd></div>
                  {i.codigoInterno && <div className="h-6 px-2 rounded-md bg-creme border border-borda grid place-items-center"><dt className="sr-only">Código interno</dt><dd>Cód. {i.codigoInterno}</dd></div>}
                </dl>
                <div className="flex justify-between items-baseline mt-0.5">
                  <span className="text-sm text-suave">{i.quantidade} × {brl(i.preco)}</span>
                  <span className="font-extrabold">{brl(i.preco * i.quantidade)}</span>
                </div>
                {devolvida && <span className="text-sm text-suave">Devolvida</span>}
                {separavel && !devolvida && (
                  <button type="button" onClick={() => alternar(i.id)} aria-pressed={feita}
                    className={`mt-1 h-10 rounded-full text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors ${feita ? 'bg-oliva text-creme' : 'border border-borda-forte text-marrom-950 hover:border-marrom-950'}`}>
                    {feita ? '✓ Separada' : 'Marcar como separada'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
