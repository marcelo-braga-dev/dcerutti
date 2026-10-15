'use client';

import { useRouter } from 'next/navigation';
import { createContext, useContext, useState, useTransition, type ReactNode } from 'react';
import { alternarFavorito } from '@/server/acoes/favoritos';

type Favoritos = { ativo: boolean; ids: Set<number>; alternar: (id: number) => void };
const Ctx = createContext<Favoritos>({ ativo: false, ids: new Set(), alternar: () => {} });

/** Favoritos da cliente logada (D-22). `ativo` falso para visitante e equipe: o coração leva ao login. */
export function ProvedorFavoritos({ iniciais, ativo, children }: { iniciais: number[]; ativo: boolean; children: ReactNode }) {
  const [ids, setIds] = useState(() => new Set(iniciais));
  const [, iniciar] = useTransition();
  const alternar = (id: number) => {
    const antes = new Set(ids);
    const depois = new Set(ids);
    if (depois.has(id)) depois.delete(id); else depois.add(id);
    setIds(depois); // otimista: volta se o servidor recusar
    iniciar(async () => {
      const r = await alternarFavorito(id).catch(() => null);
      if (!r) setIds(antes);
    });
  };
  return <Ctx.Provider value={{ ativo, ids, alternar }}>{children}</Ctx.Provider>;
}

export const useFavoritos = () => useContext(Ctx);

/** Coração: marca a peça como favorita. Fora da conta de cliente, leva ao login e volta para a peça. */
export function BotaoFavorito({ produtoId, nome, className = '', grande = false }: { produtoId: number; nome: string; className?: string; grande?: boolean }) {
  const { ativo, ids, alternar } = useFavoritos();
  const router = useRouter();
  const marcado = ids.has(produtoId);
  return (
    <button type="button" aria-pressed={marcado} aria-label={marcado ? `Tirar ${nome} dos favoritos` : `Guardar ${nome} nos favoritos`}
      onClick={e => {
        e.preventDefault();
        e.stopPropagation();
        if (!ativo) router.push(`/entrar?volta=${encodeURIComponent(location.pathname + location.search)}`);
        else alternar(produtoId);
      }}
      className={`grid place-items-center transition-colors ${grande ? 'size-12 border border-borda-forte bg-card hover:border-marrom-950' : 'size-9 rounded-full bg-card/90 hover:bg-card shadow-sm'} ${className}`}>
      <svg viewBox="0 0 24 24" className={`${grande ? 'size-6' : 'size-5'} transition-transform ${marcado ? 'scale-110' : ''}`} aria-hidden="true"
        fill={marcado ? '#e3261b' : 'none'} stroke={marcado ? '#e3261b' : 'currentColor'} strokeWidth={1.8} strokeLinejoin="round">
        <path d="M12 20s-7.5-4.6-9.2-9.3C1.7 7.6 3.6 4.5 6.9 4.5c2 0 3.6 1.1 5.1 3 1.5-1.9 3.1-3 5.1-3 3.3 0 5.2 3.1 4.1 6.2C19.5 15.4 12 20 12 20Z" />
      </svg>
    </button>
  );
}
