import { Head } from '@inertiajs/react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { Instagram, WhatsApp } from '@mui/icons-material';
import { Contagem, PublicoLayout } from '@/Components/publico/Comum';
import { SeloAoVivo } from '@/Components/publico/PedidoPublico';
import { LinkSimples } from '@/Components/loja/LinkSimples';
import { FotoCheia, estiloRotulo, estiloTitulo } from '@/Components/loja/Vitrine';
import { formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { TIPOS_VITRINE, type TipoVitrine } from '@/lib/vitrines';
import { linkWhatsApp } from '@/lib/whatsapp';

type Item = {
  slug: string; tipo: TipoVitrine; status: string; titulo: string; descricao: string | null; inicioPrevisto: string | null; urlInstagram: string | null; ofertaAte: string | null;
  pecas: number; imagem: string | null; imagens: string[]; aPartirDe: number | null; descontoMax: number;
};
type Props = { noAr: Item | null; proximas: Item[]; publicadas: Item[]; instagram: string; whatsapp: string };

/** Mosaico de até 3 fotos das peças: a capa da vitrine. */
function Mosaico({ v, alto }: { v: Item; alto?: boolean }) {
  const f = v.imagens.length ? v.imagens : [null];
  const tres = f.length >= 3;
  return (
    <Box sx={{ position: 'relative', display: 'grid', gap: '2px', overflow: 'hidden', bgcolor: 'marca.bege', height: alto ? { xs: 256, sm: 288 } : '100%', gridTemplateColumns: tres ? '1.5fr 1fr' : f.length === 2 ? '1fr 1fr' : '1fr', gridTemplateRows: tres ? '1fr 1fr' : undefined }}>
      {f.map((src, i) => <Box key={i} sx={{ position: 'relative', overflow: 'hidden', gridRow: tres && i === 0 ? 'span 2' : undefined }}><FotoCheia src={src} /></Box>)}
    </Box>
  );
}

const plural = (n: number) => `${n} ${n === 1 ? 'peça' : 'peças'}`;

/** Página do link da bio (porta de app/vitrines/page.tsx): a live no ar (ou a próxima) e as vitrines ativas. */
export default function Vitrines({ noAr, proximas, publicadas, instagram, whatsapp }: Props) {
  const destaque = noAr ?? proximas[0] ?? null;
  const outras = noAr ? proximas : proximas.slice(1);
  const vazio = !destaque && !publicadas.length;

  return (
    <PublicoLayout>
      <Head title="Vitrines" />
      <Stack spacing={1.5} sx={{ alignItems: 'center', textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 320 }}>Peças das nossas lives e publicações. Escolha o tamanho e peça pelo WhatsApp.</Typography>
        <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', justifyContent: 'center', gap: 1 }}>
          {instagram && <Button href={`https://www.instagram.com/${instagram}/`} target="_blank" rel="noopener" variant="outlined" startIcon={<Instagram />} sx={{ borderRadius: 99 }}>@{instagram}</Button>}
          <Button href={linkWhatsApp(whatsapp, 'Oi! Vim pelo link da bio e queria ajuda com as peças.')} target="_blank" rel="noopener" variant="contained" color="whatsapp" startIcon={<WhatsApp />} sx={{ borderRadius: 99 }}>Falar com a loja</Button>
        </Stack>
      </Stack>

      {vazio && (
        <Box sx={{ bgcolor: 'marca.card', border: 1, borderColor: 'marca.borda', borderRadius: 6, p: 4, textAlign: 'center', display: 'grid', gap: 1 }}>
          <Typography component="h2" sx={{ ...estiloTitulo, fontSize: '1.3rem' }}>Nenhuma vitrine no momento</Typography>
          <Typography variant="body2" color="text.secondary">Acompanhe a loja no Instagram: as próximas lives e novidades aparecem aqui.</Typography>
        </Box>
      )}

      {destaque && (
        <Box component="section" aria-label={destaque.status === 'no_ar' ? 'Ao vivo agora' : 'Próxima live'}>
          <LinkSimples href={`/vitrine/${encodeURIComponent(destaque.slug)}`} sx={{ display: 'block', borderRadius: 8, overflow: 'hidden', bgcolor: 'marca.marrom-950', color: 'marca.creme', boxShadow: 8 }}>
            <Box sx={{ position: 'relative' }}>
              <Mosaico v={destaque} alto />
              <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #2e2520, rgba(46,37,32,.3), transparent)' }} />
              <Box sx={{ position: 'absolute', left: 16, top: 16 }}>
                {destaque.status === 'no_ar'
                  ? <SeloAoVivo />
                  : <Box sx={{ height: 28, px: 1.5, borderRadius: 99, bgcolor: 'marca.card', color: 'marca.marrom-950', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>Próxima live{destaque.inicioPrevisto && <> · <Contagem ate={destaque.inicioPrevisto} fim="começando" /></>}</Box>}
              </Box>
            </Box>
            <Box sx={{ p: 2.5, display: 'grid', gap: 1, mt: -7, position: 'relative' }}>
              <Typography component="h2" sx={{ ...estiloTitulo, color: 'marca.creme', fontSize: '1.9rem', lineHeight: 1.1 }}>{destaque.titulo}</Typography>
              {destaque.status === 'agendada' && destaque.inicioPrevisto && <Typography variant="body2" sx={{ color: 'marca.areia' }}>{formatarDataHora(destaque.inicioPrevisto)}</Typography>}
              <Typography variant="body2" sx={{ color: 'marca.areia' }}>{plural(destaque.pecas)}{destaque.aPartirDe != null ? ` · a partir de ${brl(destaque.aPartirDe)}` : ''}</Typography>
              <Box sx={{ mt: 1, height: 44, borderRadius: 99, bgcolor: 'marca.creme', color: 'marca.marrom-950', fontSize: 14, fontWeight: 600, display: 'grid', placeItems: 'center' }}>{destaque.status === 'no_ar' ? 'Ver as peças da live' : 'Ver as peças'}</Box>
            </Box>
          </LinkSimples>
        </Box>
      )}

      {outras.length > 0 && <Lista titulo="Próximas lives" itens={outras} selo={v => (v.inicioPrevisto ? `Live em ${formatarDataHora(v.inicioPrevisto)}` : 'Live em breve')} />}
      {publicadas.length > 0 && <Lista titulo="Vitrines" itens={publicadas} selo={v => TIPOS_VITRINE[v.tipo]} />}
    </PublicoLayout>
  );
}

function Lista({ titulo, itens, selo }: { titulo: string; itens: Item[]; selo: (v: Item) => string }) {
  return (
    <Box component="section" sx={{ display: 'grid', gap: 1.5 }}>
      <Typography component="h2" sx={estiloRotulo}>{titulo}</Typography>
      <Stack spacing={1.5}>
        {itens.map(v => (
          <LinkSimples key={v.slug} href={`/vitrine/${encodeURIComponent(v.slug)}`} sx={{ display: 'grid', gridTemplateColumns: { xs: '7.5rem 1fr', sm: '9rem 1fr' }, bgcolor: 'marca.card', border: 1, borderColor: 'marca.borda', borderRadius: 6, overflow: 'hidden', '&:hover': { borderColor: 'marca.marrom-950' } }}>
            <Box sx={{ position: 'relative', minHeight: 152 }}><Mosaico v={v} /></Box>
            <Box sx={{ minWidth: 0, p: 2, display: 'grid', alignContent: 'center', gap: 0.75 }}>
              <Typography sx={{ ...estiloRotulo, fontSize: '0.6rem', color: 'text.secondary' }}>{selo(v)}</Typography>
              <Typography sx={{ fontWeight: 600, lineHeight: 1.3, color: 'marca.marrom-950' }}>{v.titulo}</Typography>
              <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center', gap: 1, fontSize: 14, color: 'text.secondary' }}>
                <span>{plural(v.pecas)}</span>
                {v.aPartirDe != null && <span>· a partir de <strong>{brl(v.aPartirDe)}</strong></span>}
                {v.descontoMax > 0 && <Box component="span" sx={{ height: 24, px: 1, borderRadius: 99, bgcolor: 'imperdivel.main', color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>até {v.descontoMax}% off</Box>}
              </Stack>
              {v.ofertaAte && <Typography variant="caption" sx={{ color: 'secondary.main' }}>Oferta termina em <Contagem ate={v.ofertaAte} fim="instantes" /></Typography>}
              <Typography variant="body2" sx={{ fontWeight: 600 }}>Ver as peças →</Typography>
            </Box>
          </LinkSimples>
        ))}
      </Stack>
    </Box>
  );
}
