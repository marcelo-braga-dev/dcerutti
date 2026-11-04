'use client';

import { useState } from 'react';
import type { ProdutoCatalogo } from '@/lib/catalogo';
import { rastrear } from '@/lib/rastro';
import { useSacola } from './sacola';

/**
 * Compra rápida no card (computador): ao passar o mouse na foto, os tamanhos disponíveis aparecem na base dela e um
 * clique põe a peça na sacola (o painel da sacola confirma). No celular o card só leva à página da peça.
 */
export function AdicaoRapida({ p }: { p: ProdutoCatalogo }) {
  const { adicionar } = useSacola();
  const [aviso, setAviso] = useState<string | null>(null);
  const disponiveis = p.variantes.filter(v => v.disponivel > 0);
  if (!disponiveis.length) return null;
  const por = (id: number) => {
    const v = disponiveis.find(x => x.id === id)!;
    rastrear({ tipo: 'tamanho', varianteId: v.id });
    const ok = adicionar({
      varianteId: v.id, referencia: p.referencia, nome: p.nome, marca: p.marca, cor: p.cor, tamanho: v.tamanho,
      codigoInterno: v.codigoInterno, preco: p.preco, imagem: p.imagens[0] ?? null, maximo: v.disponivel,
    });
    setAviso(ok ? null : `Todas as unidades do ${v.tamanho} já estão na sacola`);
  };
  return (
    <div className="hidden lg:block absolute inset-x-2 bottom-2 z-10 translate-y-3 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100 focus-within:translate-y-0 focus-within:opacity-100">
      <div className="rounded-2xl bg-card/95 backdrop-blur p-2.5 shadow-lg shadow-marrom-950/10">
        <div className="text-[0.7rem] font-semibold text-suave text-center mb-2">{aviso ?? 'Adicionar rápido · escolha o tamanho'}</div>
        <div className="flex flex-wrap justify-center gap-1.5">
          {disponiveis.slice(0, 8).map(v => (
            <button key={v.id} type="button" onClick={() => por(v.id)} aria-label={`Pôr ${p.nome} tamanho ${v.tamanho} na sacola`}
              className="min-w-9 h-8 px-2 rounded-full border border-borda-forte bg-card text-xs font-bold text-marrom-950 hover:bg-marrom-950 hover:text-creme hover:border-marrom-950 transition-colors">
              {v.tamanho}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
