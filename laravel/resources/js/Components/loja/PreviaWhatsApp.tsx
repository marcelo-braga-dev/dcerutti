import { Fragment, type ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { WhatsApp } from '@mui/icons-material';
import { nomeDaLoja } from '@/lib/loja';
import { WHATSAPP } from '@/tema/cores';
import { FotoCheia } from './Vitrine';

const TOKEN = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|https?:\/\/[^\s]+)/g;

/** Uma linha com a marcação do WhatsApp (*negrito*, _itálico_, ~riscado~ e links), sem HTML cru. */
function linha(texto: string): ReactNode[] {
  return texto.split(TOKEN).map((parte, i) => {
    if (!parte) return null;
    if (/^https?:\/\//.test(parte)) {
      let curto = parte;
      try { const u = new URL(parte); curto = `${u.host}${u.pathname.length > 18 ? `${u.pathname.slice(0, 16)}…` : u.pathname}`; } catch { /* como veio */ }
      return <Box component="span" key={i} sx={{ color: '#027eb5', wordBreak: 'break-all' }}>{curto}</Box>;
    }
    const m = parte.match(/^([*_~])(.+)\1$/);
    if (m) {
      const dentro = linha(m[2]);
      return m[1] === '*' ? <strong key={i}>{dentro}</strong> : m[1] === '_' ? <em key={i}>{dentro}</em> : <s key={i}>{dentro}</s>;
    }
    return <Fragment key={i}>{parte}</Fragment>;
  });
}

/** Prévia do link (D-20): imita o cartão que o WhatsApp monta com a imagem do pedido. */
export type CartaoLink = { fotos: (string | null)[]; extras: number; codigo: string; resumo: string; titulo: string; dominio: string };

function Cartao({ c }: { c: CartaoLink }) {
  const fotos = c.fotos.slice(0, 4);
  return (
    <Box sx={{ mx: -0.75, mt: -0.25, mb: 1, borderRadius: 1, overflow: 'hidden', bgcolor: 'rgba(0,0,0,.05)' }}>
      <Box sx={{ aspectRatio: '1200 / 630', display: 'grid', gridTemplateColumns: '60% 40%', bgcolor: 'marca.creme' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: fotos.length <= 1 ? '1fr' : '1fr 1fr', gap: '2px', p: 0.75 }}>
          {fotos.map((f, i) => (
            <Box key={i} sx={{ position: 'relative', bgcolor: 'marca.bege', gridRow: fotos.length === 3 && i === 0 ? 'span 2' : undefined }}>
              <FotoCheia src={f} />
              {i === fotos.length - 1 && c.extras > 0 && <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', bgcolor: 'rgba(46,37,32,.6)', color: '#fff', fontWeight: 800 }}>+{c.extras}</Box>}
            </Box>
          ))}
        </Box>
        <Stack sx={{ p: 1, justifyContent: 'center', color: 'marca.marrom-950' }}>
          <Typography sx={{ fontSize: '0.5rem', letterSpacing: '0.2em', fontWeight: 900, color: 'secondary.main' }}>{nomeDaLoja().toUpperCase()}</Typography>
          <Typography sx={{ fontWeight: 800, fontSize: '0.7rem', lineHeight: 1.2 }}>{c.codigo}</Typography>
          <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', lineHeight: 1.2 }}>{c.resumo}</Typography>
        </Stack>
      </Box>
      <Box sx={{ px: 1, py: 0.75, bgcolor: '#d9eecb' }}>
        <Typography sx={{ fontWeight: 600, fontSize: '0.78rem', lineHeight: 1.3 }}>{c.titulo}</Typography>
        <Typography sx={{ fontSize: '0.7rem', color: '#667781' }}>{c.dominio}</Typography>
      </Box>
    </Box>
  );
}

/** A mensagem como aparece na conversa (balão verde, com a hora): a mesma função que monta o link do WhatsApp. */
export function PreviaWhatsApp({ texto, para, hora, cartao }: { texto: string; para: string; hora: string; cartao?: CartaoLink }) {
  return (
    <Box sx={{ bgcolor: '#efe7dd', p: { xs: 1.5, sm: 2 } }} aria-label={`Prévia da mensagem para ${para}`}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', pb: 1.5, mb: 1.5, borderBottom: '1px solid rgba(0,0,0,.05)', fontSize: 14 }}>
        <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: 'whatsapp.main', color: '#fff', display: 'grid', placeItems: 'center' }}><WhatsApp sx={{ fontSize: 16 }} /></Box>
        <strong>{para}</strong>
      </Stack>
      <Box sx={{ ml: 'auto', maxWidth: '94%', bgcolor: WHATSAPP.balao, borderRadius: 2, borderTopRightRadius: 0, boxShadow: 1, px: 1.5, py: 1, fontSize: '0.82rem', lineHeight: 1.6, color: '#111b21', overflowWrap: 'anywhere' }}>
        {cartao && <Cartao c={cartao} />}
        {texto.split('\n').map((l, i) => <Box key={i} sx={l ? undefined : { height: 12 }}>{linha(l)}</Box>)}
        <Box sx={{ textAlign: 'right', fontSize: '0.65rem', color: '#667781', mt: 0.5 }}>{hora} ✓✓</Box>
      </Box>
    </Box>
  );
}
