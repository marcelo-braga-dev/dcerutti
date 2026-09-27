'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ItemSacola = {
  varianteId: number;
  referencia: string;
  nome: string;
  marca: string;
  cor: string | null;
  tamanho: string;
  codigoInterno: string | null;
  preco: number;
  imagem: string | null;
  quantidade: number;
};

type Sacola = {
  itens: ItemSacola[];
  pronta: boolean;
  quantidade: number;
  subtotal: number;
  adicionar: (i: Omit<ItemSacola, 'quantidade'>) => void;
  alterar: (varianteId: number, delta: number) => void;
  remover: (varianteId: number) => void;
  limpar: () => void;
};

const CHAVE = 'dcerutti-sacola-v1';
const Ctx = createContext<Sacola | null>(null);

/** Sacola no navegador (RF-05). Não guarda nada sensível: preços são revalidados no servidor ao enviar. */
export function ProvedorSacola({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<ItemSacola[]>([]);
  const [pronta, setPronta] = useState(false);

  useEffect(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE) ?? '[]');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Array.isArray(salvo)) setItens(salvo);
    } catch {}
    setPronta(true);
    const aoMudar = (e: StorageEvent) => {
      if (e.key === CHAVE) try { setItens(JSON.parse(e.newValue ?? '[]')); } catch {}
    };
    window.addEventListener('storage', aoMudar);
    return () => window.removeEventListener('storage', aoMudar);
  }, []);

  useEffect(() => {
    if (pronta) try { localStorage.setItem(CHAVE, JSON.stringify(itens)); } catch {}
  }, [itens, pronta]);

  const adicionar = useCallback((i: Omit<ItemSacola, 'quantidade'>) => {
    setItens(atual => {
      const ex = atual.find(x => x.varianteId === i.varianteId);
      return ex ? atual.map(x => (x.varianteId === i.varianteId ? { ...x, quantidade: Math.min(20, x.quantidade + 1) } : x)) : [...atual, { ...i, quantidade: 1 }];
    });
  }, []);
  const alterar = useCallback((id: number, delta: number) => {
    setItens(atual => atual.map(x => (x.varianteId === id ? { ...x, quantidade: Math.min(20, x.quantidade + delta) } : x)).filter(x => x.quantidade > 0));
  }, []);
  const remover = useCallback((id: number) => setItens(atual => atual.filter(x => x.varianteId !== id)), []);
  const limpar = useCallback(() => setItens([]), []);

  const valor = useMemo(
    () => ({
      itens, pronta, adicionar, alterar, remover, limpar,
      quantidade: itens.reduce((a, i) => a + i.quantidade, 0),
      subtotal: itens.reduce((a, i) => a + i.preco * i.quantidade, 0),
    }),
    [itens, pronta, adicionar, alterar, remover, limpar],
  );
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useSacola() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSacola precisa estar dentro de <ProvedorSacola>.');
  return s;
}
