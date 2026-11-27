import { useRef, useState } from 'react';
import { Box, Dialog, IconButton, Stack } from '@mui/material';
import { Close } from '@mui/icons-material';
import { FotoCheia } from '@/Components/loja/Vitrine';

type Video = { url: string; capa: string | null };

/** Fotos e vídeos da peça: trilho no celular, miniaturas no computador e tela cheia ao tocar. */
export function Galeria({ imagens, videos, nome }: { imagens: string[]; videos: Video[]; nome: string }) {
  const itens = [...imagens.map(src => ({ tipo: 'foto' as const, src, capa: src })), ...videos.map(v => ({ tipo: 'video' as const, src: v.url, capa: v.capa }))];
  const [atual, setAtual] = useState(0);
  const [cheia, setCheia] = useState(false);
  const trilho = useRef<HTMLDivElement>(null);
  if (!itens.length) return <Box sx={{ position: 'relative', aspectRatio: '3 / 4', borderRadius: 6, overflow: 'hidden' }}><FotoCheia src={null} /></Box>;
  const midia = (i: (typeof itens)[number], inteira = false) => i.tipo === 'video'
    ? <Box component="video" src={i.src} poster={i.capa ?? undefined} controls playsInline muted loop sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: inteira ? 'contain' : 'cover', bgcolor: '#000' }} />
    : <FotoCheia src={i.src} alt={nome} sx={inteira ? { objectFit: 'contain' } : undefined} />;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { lg: itens.length > 1 ? '84px 1fr' : '1fr' }, gap: 1.5, minWidth: 0 }}>
      {itens.length > 1 && (
        <Stack spacing={1} sx={{ display: { xs: 'none', lg: 'flex' }, maxHeight: '80vh', overflowY: 'auto', scrollbarWidth: 'none' }}>
          {itens.map((i, n) => (
            <Box key={i.src} component="button" type="button" onClick={() => setAtual(n)} aria-label={`Ver ${i.tipo === 'video' ? 'vídeo' : 'foto'} ${n + 1}`}
              sx={{ position: 'relative', p: 0, border: 0, cursor: 'pointer', aspectRatio: '3 / 4', borderRadius: 3, overflow: 'hidden', bgcolor: 'marca.bege', outline: n === atual ? '2px solid' : 'none', outlineColor: 'marca.marrom-950', outlineOffset: 2, flexShrink: 0 }}>
              <FotoCheia src={i.capa} />
              {i.tipo === 'video' && <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#fff', fontSize: 22, bgcolor: 'rgba(0,0,0,.25)' }}>▶</Box>}
            </Box>
          ))}
        </Stack>
      )}
      <Box sx={{ position: 'relative', minWidth: 0 }}>
        <Box ref={trilho} onScroll={e => { const el = e.currentTarget; setAtual(Math.round(el.scrollLeft / el.clientWidth)); }}
          sx={{ display: { xs: 'flex', lg: 'none' }, overflowX: 'auto', scrollSnapType: 'x mandatory', scrollbarWidth: 'none', borderRadius: 6, mx: { xs: -2, sm: 0 } }}>
          {itens.map(i => <Box key={i.src} onClick={() => i.tipo === 'foto' && setCheia(true)} sx={{ position: 'relative', flex: '0 0 100%', aspectRatio: '3 / 4', scrollSnapAlign: 'start', bgcolor: 'marca.bege' }}>{midia(i)}</Box>)}
        </Box>
        <Box onClick={() => itens[atual].tipo === 'foto' && setCheia(true)} sx={{ display: { xs: 'none', lg: 'block' }, position: 'relative', aspectRatio: '3 / 4', borderRadius: 6, overflow: 'hidden', bgcolor: 'marca.bege', cursor: itens[atual].tipo === 'foto' ? 'zoom-in' : 'default' }}>
          {midia(itens[atual])}
        </Box>
        {itens.length > 1 && (
          <Stack direction="row" spacing={0.75} sx={{ display: { lg: 'none' }, justifyContent: 'center', mt: 1.5 }}>
            {itens.map((i, n) => <Box key={i.src} sx={{ width: n === atual ? 20 : 6, height: 6, borderRadius: 99, bgcolor: n === atual ? 'marca.marrom-950' : 'marca.borda-forte', transition: 'all .2s' }} />)}
          </Stack>
        )}
      </Box>
      <Dialog fullScreen open={cheia} onClose={() => setCheia(false)} slotProps={{ paper: { sx: { bgcolor: '#111' } } }}>
        <IconButton onClick={() => setCheia(false)} aria-label="Fechar" sx={{ position: 'absolute', right: 12, top: 12, zIndex: 2, color: '#fff', bgcolor: 'rgba(255,255,255,.12)' }}><Close /></IconButton>
        <Box sx={{ position: 'relative', flex: 1 }}>{midia(itens[atual], true)}</Box>
      </Dialog>
    </Box>
  );
}
