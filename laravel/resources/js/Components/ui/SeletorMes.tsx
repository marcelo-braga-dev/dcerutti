import { IconButton, Stack, Typography } from '@mui/material';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import { nomeDoMes, somarMeses } from '@/lib/datas';

/** Mês anterior/próximo (src/components/painel/seletor-mes.tsx); não passa do mês atual. */
export function SeletorMes({ mes, base, atual }: { mes: string; base: string; atual: string }) {
  const link = (m: string) => `${base}${base.includes('?') ? '&' : '?'}mes=${m}`;
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5 }}>
      <IconButton href={link(somarMeses(mes, -1))} aria-label="Mês anterior" sx={{ border: 1, borderColor: 'divider' }}><ChevronLeft /></IconButton>
      <Typography variant="overline" sx={{ minWidth: 160, textAlign: 'center' }}>{nomeDoMes(mes)}</Typography>
      {mes < atual ? <IconButton href={link(somarMeses(mes, 1))} aria-label="Próximo mês" sx={{ border: 1, borderColor: 'divider' }}><ChevronRight /></IconButton> : <span style={{ width: 40 }} />}
    </Stack>
  );
}
