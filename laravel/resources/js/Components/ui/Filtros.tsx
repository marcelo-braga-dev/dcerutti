import type { ReactNode } from 'react';
import { Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';

export type Opcao = { rotulo: string; href: string; ativo: boolean; n?: number };

/** Caixa de filtros do painel (src/components/painel/filtros.tsx): linhas de opções e o "limpar". */
export function PainelFiltros({ limpar, children }: { limpar?: string | null; children: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2, display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-end' }}>
      {children}
      {limpar && <Button href={limpar} size="small" sx={{ ml: 'auto' }}>Limpar filtros</Button>}
    </Paper>
  );
}

export function LinhaFiltro({ rotulo, opcoes }: { rotulo: string; opcoes: Opcao[] }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>{rotulo}</Typography>
      <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }}>
        {opcoes.map(o => (
          <Chip key={o.href} component="a" href={o.href} clickable label={o.n != null ? `${o.rotulo} · ${o.n}` : o.rotulo} color={o.ativo ? 'primary' : 'default'} variant={o.ativo ? 'filled' : 'outlined'} size="small" />
        ))}
      </Stack>
    </Box>
  );
}
