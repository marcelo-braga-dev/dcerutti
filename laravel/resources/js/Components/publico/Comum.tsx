import { useEffect, useState, type ReactNode } from 'react';
import { usePage } from '@inertiajs/react';
import { Box, Container, Stack, Typography } from '@mui/material';
import { Check } from '@mui/icons-material';
import { ComTema } from '@/tema/ComTema';

/** Páginas abertas pelo link do WhatsApp (sugestão, peça, vitrine, pedido): sem login, coluna estreita, logo no topo. */
export function PublicoLayout({ children, largura = 'sm', acao, logoHref }: { children: ReactNode; largura?: 'sm' | 'md' | 'lg'; acao?: ReactNode; logoHref?: string }) {
  const { identidade } = usePage().props;
  return (
    <ComTema area="loja">
      <Box sx={{ bgcolor: 'background.paper', minHeight: '100dvh' }}>
        <Container maxWidth={largura} sx={{ pt: { xs: 2, sm: 4 }, pb: 3, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 3 }}>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
            <Box component={logoHref ? 'a' : 'span'} href={logoHref} aria-label={logoHref ? identidade.nome : undefined} sx={{ display: 'inline-flex' }}>
              <Box component="img" src={identidade.logo.url} alt={identidade.nome} sx={{ height: { xs: 40, sm: 48 }, width: 'auto', mixBlendMode: 'multiply' }} />
            </Box>
            {acao}
          </Stack>
          {children}
        </Container>
      </Box>
    </ComTema>
  );
}

function partes(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/** "2d 05h 12min" (ou "12min 08s" na última hora). Atualiza sozinha; terminado, mostra `fim`. */
export function Contagem({ ate, fim = 'agora' }: { ate: string; fim?: string }) {
  const alvo = new Date(ate).getTime();
  const [agora, setAgora] = useState<number | null>(null);
  useEffect(() => {
    const tique = () => setAgora(Date.now());
    const primeiro = setTimeout(tique, 0);
    const t = setInterval(tique, 1000);
    return () => { clearTimeout(primeiro); clearInterval(t); };
  }, []);
  if (agora == null) return <span style={{ fontVariantNumeric: 'tabular-nums' }}>…</span>;
  const falta = alvo - agora;
  if (falta <= 0) return <span>{fim}</span>;
  const { d, h, m, s } = partes(falta);
  const dois = (n: number) => String(n).padStart(2, '0');
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{d > 0 ? `${d}d ${dois(h)}h ${dois(m)}min` : h > 0 ? `${h}h ${dois(m)}min` : `${m}min ${dois(s)}s`}</span>;
}

export function SelosConfianca() {
  return (
    <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', columnGap: 2.5, rowGap: 0.75, fontSize: 14, color: 'text.secondary' }}>
      {['Sem cadastro', 'Pedido pelo WhatsApp', 'Reserva confirmada pela loja'].map(t => <Stack key={t} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}><Check sx={{ fontSize: 16, color: 'success.main' }} /><span>{t}</span></Stack>)}
    </Stack>
  );
}

/** Quem atende, com a inicial e o ponto verde do WhatsApp. */
export function QuemAtende({ nome, link, rotulo = 'Quem te atende' }: { nome: string | null; link: string; rotulo?: string }) {
  return (
    <Box component="a" href={link} target="_blank" rel="noopener" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: 'inherit', textDecoration: 'none', '&:hover .nome': { textDecoration: 'underline' } }}>
      <Box sx={{ position: 'relative', width: 44, height: 44, flexShrink: 0, borderRadius: '50%', bgcolor: 'secondary.main', color: 'marca.creme', fontWeight: 800, display: 'grid', placeItems: 'center' }}>
        {(nome ?? 'L')[0]}<Box sx={{ position: 'absolute', bottom: -2, right: -2, width: 14, height: 14, borderRadius: '50%', bgcolor: 'whatsapp.main', border: '2px solid', borderColor: 'background.paper' }} />
      </Box>
      <Box sx={{ lineHeight: 1.2 }}><Typography variant="caption" color="text.secondary" component="div">{rotulo}</Typography><Typography className="nome" sx={{ fontWeight: 600, color: 'marca.marrom-950' }}>{nome ?? 'Equipe da loja'} · WhatsApp</Typography></Box>
    </Box>
  );
}
