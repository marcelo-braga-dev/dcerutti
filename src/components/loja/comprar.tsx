'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ProdutoCatalogo } from '@/lib/catalogo';
import { botao } from '@/components/ui/botao';
import { useSacola } from './sacola';

export function Comprar({ p }: { p: ProdutoCatalogo }) {
  const { adicionar } = useSacola();
  const [tamanho, setTamanho] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const esgotado = !p.variantes.some(v => v.disponivel > 0);
  const escolhida = p.variantes.find(v => v.tamanho === tamanho);

  const adicionarNaSacola = () => {
    if (!escolhida) return;
    const ok = adicionar({
      varianteId: escolhida.id, referencia: p.referencia, nome: p.nome, marca: p.marca, cor: p.cor, tamanho: escolhida.tamanho,
      codigoInterno: escolhida.codigoInterno, preco: p.preco, imagem: p.imagens[0] ?? null, maximo: escolhida.disponivel,
    });
    // U-06: o tamanho continua escolhido, para adicionar outra unidade se quiser.
    setAviso(ok
      ? { ok, texto: `Tam. ${escolhida.tamanho} adicionado à sacola.` }
      : { ok, texto: `Você já tem na sacola todas as ${escolhida.disponivel} unidade${escolhida.disponivel === 1 ? '' : 's'} disponíveis do tam. ${escolhida.tamanho}.` });
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
              <button key={v.id} type="button" role="radio" aria-checked={ativo} disabled={off} onClick={() => { setTamanho(v.tamanho); setAviso(null); }}
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
      {aviso && (
        <div role="status" className={`flex flex-wrap items-center justify-between gap-3 border px-4 py-3 ${aviso.ok ? 'bg-oliva/10 border-oliva text-oliva' : 'bg-bege border-caramelo text-caramelo'}`}>
          <span>{aviso.texto}</span>
          <Link href="/sacola" className={botao('oliva', 'p')}>Ver sacola</Link>
        </div>
      )}
    </div>
  );
}
