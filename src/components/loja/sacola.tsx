'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { rastrear } from '@/lib/rastro';

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
  /** Disponível no momento em que entrou na sacola (B-05). Sem valor em sacolas antigas: vale o limite geral. */
  maximo?: number;
};

type Sacola = {
  itens: ItemSacola[];
  pronta: boolean;
  quantidade: number;
  subtotal: number;
  /** Devolve false quando a peça já está na sacola no máximo disponível. */
  adicionar: (i: Omit<ItemSacola, 'quantidade'>) => boolean;
  alterar: (varianteId: number, delta: number) => void;
  remover: (varianteId: number) => void;
  limpar: () => void;
  /** Aplica a conferência do servidor: preço e máximo atuais; devolve o que mudou. */
  conferir: (c: Record<number, { preco: number; disponivel: number } | null>) => { precos: string[]; ajustados: string[] };
  /** "Comprar de novo": junta as peças à sacola (somando quantidades, sem passar do máximo). */
  juntar: (novos: ItemSacola[]) => void;
  /** Última peça adicionada (a gaveta da sacola mostra), com o instante para reabrir a cada adição. */
  ultimo: { item: Omit<ItemSacola, 'quantidade'>; em: number } | null;
};

const CHAVE = 'dcerutti-sacola-v1';
const LIMITE = 20;
export const maximoDo = (i: Pick<ItemSacola, 'maximo'>) => Math.min(LIMITE, i.maximo ?? LIMITE);
const Ctx = createContext<Sacola | null>(null);

/** Sacola no navegador (RF-05). Não guarda nada sensível: preços são revalidados no servidor ao enviar. */
export function ProvedorSacola({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<ItemSacola[]>([]);
  const [pronta, setPronta] = useState(false);
  const [ultimo, setUltimo] = useState<Sacola['ultimo']>(null);

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
    const ex = itens.find(x => x.varianteId === i.varianteId);
    if (ex && ex.quantidade >= maximoDo(i)) return false;
    setItens(atual => {
      const e = atual.find(x => x.varianteId === i.varianteId);
      return e
        ? atual.map(x => (x.varianteId === i.varianteId ? { ...x, ...i, quantidade: Math.min(maximoDo(i), x.quantidade + 1) } : x))
        : [...atual, { ...i, quantidade: 1 }];
    });
    rastrear({ tipo: 'sacola', varianteId: i.varianteId, delta: 1 }); // histórico do cliente (docs/21)
    setUltimo({ item: i, em: Date.now() });
    return true;
  }, [itens]);
  const alterar = useCallback((id: number, delta: number) => {
    const x = itens.find(i => i.varianteId === id);
    const real = x ? Math.max(0, Math.min(maximoDo(x), x.quantidade + delta)) - x.quantidade : 0;
    if (real) rastrear({ tipo: 'sacola', varianteId: id, delta: real });
    setItens(atual => atual.map(x => (x.varianteId === id ? { ...x, quantidade: Math.min(maximoDo(x), x.quantidade + delta) } : x)).filter(x => x.quantidade > 0));
  }, [itens]);
  const remover = useCallback((id: number) => {
    const x = itens.find(i => i.varianteId === id);
    if (x) rastrear({ tipo: 'sacola', varianteId: id, delta: -Math.min(20, x.quantidade) });
    setItens(atual => atual.filter(x => x.varianteId !== id));
  }, [itens]);
  const limpar = useCallback(() => setItens([]), []);
  const juntar = useCallback((novos: ItemSacola[]) => {
    setItens(atual => {
      const r = [...atual];
      for (const n of novos) {
        const i = r.findIndex(x => x.varianteId === n.varianteId);
        if (i < 0) r.push({ ...n, quantidade: Math.min(maximoDo(n), n.quantidade) });
        else r[i] = { ...r[i], ...n, quantidade: Math.min(maximoDo(n), r[i].quantidade + n.quantidade) };
      }
      return r;
    });
    for (const n of novos) rastrear({ tipo: 'sacola', varianteId: n.varianteId, delta: Math.min(20, n.quantidade) });
  }, []);
  const conferir = useCallback((c: Record<number, { preco: number; disponivel: number } | null>) => {
    const precos: string[] = [], ajustados: string[] = [];
    setItens(atual => atual.map(x => {
      const agora = c[x.varianteId];
      if (!agora) return x; // indisponível: fica marcado na tela para a pessoa remover
      if (Math.abs(agora.preco - x.preco) > 0.004) precos.push(x.nome);
      const quantidade = Math.max(1, Math.min(x.quantidade, agora.disponivel || 1));
      if (quantidade !== x.quantidade) ajustados.push(x.nome);
      return { ...x, preco: agora.preco, maximo: agora.disponivel, quantidade };
    }));
    return { precos, ajustados };
  }, []);

  const valor = useMemo(
    () => ({
      itens, pronta, adicionar, alterar, remover, limpar, conferir, juntar, ultimo,
      quantidade: itens.reduce((a, i) => a + i.quantidade, 0),
      subtotal: itens.reduce((a, i) => a + i.preco * i.quantidade, 0),
    }),
    [itens, pronta, adicionar, alterar, remover, limpar, conferir, juntar, ultimo],
  );
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useSacola() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSacola precisa estar dentro de <ProvedorSacola>.');
  return s;
}
