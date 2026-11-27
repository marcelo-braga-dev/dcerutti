import { useMemo, type ReactNode } from 'react';
import { usePage } from '@inertiajs/react';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { criarTema } from './tema';
import { lembrarLoja } from '@/lib/loja';

/** Tema MUI com as cores da loja; usado pelos layouts. A loja e a conta usam as fontes da loja, o painel e o caixa as do sistema. */
export function ComTema({ area, children }: { area: 'painel' | 'loja'; children: ReactNode }) {
  const { identidade } = usePage().props;
  lembrarLoja({ nome: identidade.nome, slogan: identidade.slogan });
  const tema = useMemo(() => criarTema(identidade.cores, area), [identidade.cores, area]);
  return (
    <ThemeProvider theme={tema}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
