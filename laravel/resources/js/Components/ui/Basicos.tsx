import type { ReactNode } from 'react';
import { Alert, Box, Chip, IconButton, Stack, Typography, type ChipProps } from '@mui/material';
import { WhatsApp } from '@mui/icons-material';

/** Título da página com rótulo acima e ações à direita (src/components/ui/basicos.tsx). */
export function CabecalhoPagina({ sobre, titulo, acoes, children }: { sobre?: string; titulo: string; acoes?: ReactNode; children?: ReactNode }) {
  return (
    <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2, mb: 3 }}>
      <Box>
        {sobre && <Typography variant="overline" color="secondary" sx={{ lineHeight: 1.5, display: 'block' }}>{sobre}</Typography>}
        <Typography variant="h4" component="h1" sx={{ fontSize: { xs: 26, sm: 32 } }}>{titulo}</Typography>
        {children && <Typography color="text.secondary" sx={{ mt: 1 }}>{children}</Typography>}
      </Box>
      {acoes && <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>{acoes}</Stack>}
    </Stack>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ border: 1, borderStyle: 'dashed', borderColor: 'marca.borda-forte', borderRadius: 3, p: 5, textAlign: 'center', color: 'text.secondary' }}>{children}</Box>
  );
}

export function Aviso({ tipo = 'erro', children }: { tipo?: 'erro' | 'ok' | 'aviso'; children: ReactNode }) {
  return <Alert severity={tipo === 'erro' ? 'error' : tipo === 'ok' ? 'success' : 'warning'} variant="outlined">{children}</Alert>;
}

type CorEtiqueta = 'oliva' | 'cinza' | 'caramelo' | 'contorno' | 'vermelho';

export function Etiqueta({ cor = 'contorno', children, sx }: { cor?: CorEtiqueta; children: ReactNode; sx?: ChipProps['sx'] }) {
  const estilo: Record<CorEtiqueta, ChipProps> = {
    oliva: { color: 'success' }, cinza: { color: 'default' }, caramelo: { color: 'secondary' }, vermelho: { color: 'error' }, contorno: { variant: 'outlined' },
  };
  return <Chip size="small" label={children} {...estilo[cor]} sx={{ height: 22, fontSize: 11, fontWeight: 700, ...sx }} />;
}

export function EtiquetaStatus({ status }: { status: 'pendente' | 'confirmado' | 'cancelado' }) {
  if (status === 'confirmado') return <Etiqueta cor="oliva">Confirmado</Etiqueta>;
  if (status === 'cancelado') return <Etiqueta cor="cinza">Cancelado</Etiqueta>;
  return <Etiqueta cor="caramelo">Pendente</Etiqueta>;
}

/** Q-09: o tipo é neutro; a cor fica reservada para o status. */
export function EtiquetaTipo({ tipo }: { tipo: 'compra' | 'condicional' }) {
  return <Etiqueta>{tipo === 'condicional' ? 'Condicional' : 'Pedido'}</Etiqueta>;
}

/** Foto da peça em 3:4 com fundo bege; sem foto, só o fundo. */
export function Foto({ src, alt = '', largura = 40, sx }: { src: string | null | undefined; alt?: string; largura?: number; sx?: object }) {
  return (
    <Box sx={{ width: largura, aspectRatio: '3 / 4', borderRadius: 1.5, overflow: 'hidden', bgcolor: 'marca.bege', flexShrink: 0, ...sx }}>
      {src && <Box component="img" src={src} alt={alt} loading="lazy" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
    </Box>
  );
}

export function BotaoWhatsApp({ href, rotulo, tamanho = 32 }: { href: string; rotulo: string; tamanho?: number }) {
  return (
    <IconButton href={href} target="_blank" rel="noopener" aria-label={rotulo} title={rotulo}
      sx={{ width: tamanho, height: tamanho, bgcolor: 'whatsapp.main', color: '#fff', '&:hover': { bgcolor: 'whatsapp.dark' }, position: 'relative', zIndex: 1 }}>
      <WhatsApp sx={{ fontSize: tamanho * 0.55 }} />
    </IconButton>
  );
}
