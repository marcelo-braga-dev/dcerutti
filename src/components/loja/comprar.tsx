'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ProdutoCatalogo } from '@/lib/catalogo';
import { botao } from '@/components/ui/botao';
import { useSacola } from './sacola';

export function Comprar({ p }: { p: ProdutoCatalogo }) {
  const { adicionar } = useSacola();
  const [tamanho, setTamanho] = useState<string | null>(null);
  const [adicionado, setAdicionado] = useState<string | null>(null);
  const esgotado = !p.variantes.some(v => v.disponivel > 0);
  const escolhida = p.variantes.find(v => v.tamanho === tamanho);

  const adicionarNaSacola = () => {
    if (!escolhida) return;
    adicionar({
      varianteId: escolhida.id, referencia: p.referencia, nome: p.nome, marca: p.marca, cor: p.cor, tamanho: escolhida.tamanho,
      codigoInterno: escolhida.codigoInterno, preco: p.preco, imagem: p.imagens[0] ?? null,
    });
    setAdicionado(escolhida.tamanho);
    setTamanho(null);
  };

  return (
    <div className="grid gap-4">
      <div>
        <div className="flex justify-between rotulo text-suave mb-3">
          <span>Tamanho{escolhida?.codigoInterno ? ` · Cód. ${escolhida.codigoInterno}` : ''}</span>
          {escolhida && <span className="text-oliva">{escolhida.disponivel} em estoque</span>}
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tamanho">
          {p.variantes.map(v => {
            const off = v.disponivel <= 0;
            const ativo = v.tamanho === tamanho;
            return (
              <button key={v.id} type="button" role="radio" aria-checked={ativo} disabled={off} onClick={() => { setTamanho(v.tamanho); setAdicionado(null); }}
                className={`min-w-12 h-12 px-3 border font-display font-bold ${ativo ? 'bg-marrom-950 text-creme border-marrom-950' : off ? 'border-borda text-borda-forte line-through cursor-not-allowed' : 'border-borda-forte bg-card hover:border-marrom-950'}`}>
                {v.tamanho}
              </button>
            );
          })}
        </div>
      </div>
      <button type="button" onClick={adicionarNaSacola} disabled={!escolhida} className={botao('primario', 'g', 'w-full')}>
        {esgotado ? 'Esgotado' : escolhida ? 'Adicionar à sacola' : 'Selecione um tamanho'}
      </button>
      {adicionado && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 bg-oliva/10 border border-oliva px-4 py-3 text-oliva">
          <span>Tam. {adicionado} adicionado à sacola.</span>
          <Link href="/sacola" className={botao('oliva', 'p')}>Ver sacola</Link>
        </div>
      )}
    </div>
  );
}
