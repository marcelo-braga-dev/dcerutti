'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import type { ProdutoCatalogo } from '@/lib/catalogo';
import { brl } from '@/lib/dinheiro';
import { rastrear } from '@/lib/rastro';
import { linkWhatsApp } from '@/lib/whatsapp';
import { IconeCheck, IconeSacola } from '@/components/ui/icones';
import { IconeWhatsApp } from './previa-whatsapp';
import { useSacola } from './sacola';

/**
 * Escolha do tamanho e "Adicionar à sacola". No celular, uma barra fixa no rodapé mantém o preço e o botão à mão;
 * sem tamanho escolhido, ela leva até os tamanhos. "Dúvida no tamanho?" abre o WhatsApp de quem atende com a peça.
 */
export function Comprar({ p, atendimento }: { p: ProdutoCatalogo; atendimento: { nome: string; telefone: string } }) {
  const { adicionar } = useSacola();
  const [tamanho, setTamanho] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [destacar, setDestacar] = useState(false);
  const tamanhos = useRef<HTMLDivElement>(null);
  const esgotado = !p.variantes.some(v => v.disponivel > 0);
  const escolhida = p.variantes.find(v => v.tamanho === tamanho);
  const primeiroNome = atendimento.nome.split(' ')[0];
  const duvida = linkWhatsApp(atendimento.telefone,
    `Olá, ${primeiroNome}! Estou vendo a peça ${p.nome} (Ref. ${p.referencia})${escolhida ? `, tamanho ${escolhida.tamanho}` : ''} e tenho uma dúvida.`);

  const adicionarNaSacola = () => {
    if (!escolhida) {
      tamanhos.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setDestacar(true);
      setTimeout(() => setDestacar(false), 1200);
      return;
    }
    const ok = adicionar({
      varianteId: escolhida.id, referencia: p.referencia, nome: p.nome, marca: p.marca, cor: p.cor, tamanho: escolhida.tamanho,
      codigoInterno: escolhida.codigoInterno, preco: p.preco, imagem: p.imagens[0] ?? null, maximo: escolhida.disponivel,
    });
    // U-06: o tamanho continua escolhido, para adicionar outra unidade se quiser.
    setAviso(ok
      ? { ok, texto: `Tam. ${escolhida.tamanho} adicionado à sacola.` }
      : { ok, texto: `Você já tem na sacola todas as ${escolhida.disponivel} unidade${escolhida.disponivel === 1 ? '' : 's'} disponíveis do tam. ${escolhida.tamanho}.` });
  };
  const rotuloBotao = esgotado ? 'Esgotado' : escolhida ? 'Adicionar à sacola' : 'Escolha o tamanho';

  return (
    <div className="grid gap-5">
      <div ref={tamanhos} className={`rounded-2xl transition-colors ${destacar ? 'bg-bege -mx-3 px-3 py-3 ring-2 ring-caramelo/40' : ''}`}>
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <span className="text-sm font-bold text-marrom-950">Tamanho{escolhida ? <span className="font-normal text-suave"> · {escolhida.tamanho}</span> : ''}</span>
          {escolhida && (
            <span className={`text-sm font-medium ${escolhida.disponivel <= 2 ? 'text-imperdivel' : 'text-oliva'}`}>
              {escolhida.disponivel <= 2 ? 'Corra! Só ' : ''}{escolhida.disponivel} em estoque
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tamanho">
          {p.variantes.map(v => {
            const off = v.disponivel <= 0;
            const ativo = v.tamanho === tamanho;
            return (
              <button key={v.id} type="button" role="radio" aria-checked={ativo} disabled={off} title={off ? 'Esgotado' : undefined}
                onClick={() => { setTamanho(v.tamanho); setAviso(null); if (v.tamanho !== tamanho) rastrear({ tipo: 'tamanho', varianteId: v.id }); }}
                className={`relative min-w-14 h-12 px-3 rounded-xl border text-[0.95rem] font-bold transition ${ativo ? 'bg-marrom-950 text-creme border-marrom-950 shadow-md shadow-marrom-950/20' : off ? 'border-borda text-borda-forte line-through cursor-not-allowed bg-creme/60' : 'border-borda-forte bg-card text-marrom-950 hover:border-marrom-950'}`}>
                {v.tamanho}
                {!off && v.disponivel === 1 && !ativo && <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-imperdivel ring-2 ring-card" title="Última peça" />}
              </button>
            );
          })}
        </div>
        {escolhida?.codigoInterno && <p className="mt-2 text-xs text-suave">Cód. {escolhida.codigoInterno}</p>}
        <a href={duvida} target="_blank" rel="noopener" className="mt-3 inline-flex items-center gap-1.5 text-sm text-marrom-950 underline underline-offset-4 decoration-borda-forte hover:decoration-marrom-950">
          <IconeWhatsApp className="size-4 text-whatsapp" />Dúvida no tamanho? Pergunte a {primeiroNome}
        </a>
      </div>

      <button type="button" onClick={adicionarNaSacola} disabled={esgotado}
        className="w-full h-14 inline-flex items-center justify-center gap-2.5 rounded-full bg-marrom-950 text-creme text-base font-semibold hover:bg-marrom-700 active:scale-[0.99] transition disabled:opacity-50 disabled:pointer-events-none shadow-lg shadow-marrom-950/20">
        {!esgotado && <IconeSacola className="size-5" />}{rotuloBotao}
      </button>

      {aviso && (
        <div role="status" className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-medium ${aviso.ok ? 'bg-oliva/10 text-oliva' : 'bg-bege text-caramelo'}`}>
          <span className="flex items-center gap-2">{aviso.ok && <IconeCheck className="size-4" />}{aviso.texto}</span>
          <Link href="/sacola" className="underline underline-offset-4 font-semibold">Ver sacola</Link>
        </div>
      )}

      {/* Celular: barra fixa com preço e botão. */}
      {!esgotado && (
        <div className="lg:hidden fixed inset-x-0 bottom-0 z-20 bg-card/95 backdrop-blur-xl border-t border-borda px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center gap-3 rounded-t-3xl shadow-[0_-12px_32px_-16px_rgba(46,37,32,0.35)]">
          <div className="min-w-0">
            <div className="text-lg font-extrabold leading-none tracking-tight">{brl(p.preco)}</div>
            <div className="text-xs text-suave truncate mt-1">{escolhida ? `Tam. ${escolhida.tamanho}` : 'Escolha o tamanho'}</div>
          </div>
          <button type="button" onClick={adicionarNaSacola} className="flex-1 h-12 inline-flex items-center justify-center gap-2 rounded-full bg-marrom-950 text-creme font-semibold">
            <IconeSacola className="size-5" />{escolhida ? 'Adicionar' : 'Escolher tamanho'}
          </button>
        </div>
      )}
    </div>
  );
}
