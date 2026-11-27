import { useState, useSyncExternalStore } from 'react';
import { router, usePage } from '@inertiajs/react';
import { IconButton } from '@mui/material';
import { Favorite, FavoriteBorder } from '@mui/icons-material';
import { postJson } from '@/lib/http';

/** Favoritos da cliente (D-22): os ids vêm do servidor a cada página; o clique é otimista e volta se o servidor recusar. */
let mudados: Map<number, boolean> = new Map();
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach(o => o());
const assinar = (o: () => void) => { ouvintes.add(o); return () => { ouvintes.delete(o); }; };
let versao = 0;

export function useFavoritos() {
  const { loja } = usePage().props;
  useSyncExternalStore(assinar, () => versao, () => 0);
  const base = new Set(loja?.favoritos ?? []);
  for (const [id, sim] of mudados) if (sim) base.add(id); else base.delete(id);
  return { ativo: !!loja?.cliente, ids: base };
}

function marcar(id: number, sim: boolean | null) {
  mudados = new Map(mudados);
  if (sim === null) mudados.delete(id); else mudados.set(id, sim);
  versao++;
  avisar();
}

/** Coração: guarda a peça nos favoritos. Fora da conta de cliente, leva ao login e volta para a peça. */
export function BotaoFavorito({ produtoId, nome, grande = false, sx }: { produtoId: number; nome: string; grande?: boolean; sx?: object }) {
  const { ativo, ids } = useFavoritos();
  const [, setOcupado] = useState(false);
  const marcado = ids.has(produtoId);
  const alternar = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!ativo) return router.visit(`/entrar?volta=${encodeURIComponent(location.pathname + location.search)}`);
    marcar(produtoId, !marcado);
    setOcupado(true);
    postJson<{ favorito: boolean } | null>(`/favoritos/${produtoId}`, {})
      .then(r => { if (!r || (r as { ok?: boolean }).ok === false) marcar(produtoId, marcado); })
      .catch(() => marcar(produtoId, marcado))
      .finally(() => setOcupado(false));
  };
  return (
    <IconButton onClick={alternar} aria-pressed={marcado} aria-label={marcado ? `Tirar ${nome} dos favoritos` : `Guardar ${nome} nos favoritos`}
      sx={grande
        ? { width: 48, height: 48, border: 1, borderColor: 'marca.borda-forte', bgcolor: 'background.paper', ...sx }
        : { width: 36, height: 36, bgcolor: 'rgba(255,253,249,.9)', boxShadow: 1, '&:hover': { bgcolor: 'background.paper', transform: 'scale(1.1)' }, ...sx }}>
      {marcado ? <Favorite sx={{ color: '#e3261b', fontSize: grande ? 26 : 20 }} /> : <FavoriteBorder sx={{ color: 'text.primary', fontSize: grande ? 26 : 20 }} />}
    </IconButton>
  );
}
