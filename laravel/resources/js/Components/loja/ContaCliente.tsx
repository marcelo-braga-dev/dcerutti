import type { ReactNode } from 'react';
import { Head, router, usePage } from '@inertiajs/react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { WhatsApp } from '@mui/icons-material';
import LojaLayout from '@/Layouts/LojaLayout';
import { EtiquetaStatus, EtiquetaTipo } from '@/Components/ui/Basicos';
import { formatarData } from '@/lib/datas';
import { linkWhatsApp } from '@/lib/whatsapp';
import { LinkSimples } from './LinkSimples';
import { estiloTitulo } from './Vitrine';

/** App\Http\Controllers\Loja\MinhaContaController::resumo. */
export type ResumoConta = {
  email: string;
  cuponsLigados: boolean;
  resumo: {
    ultimoPedido: { codigo: string; tipo: 'compra' | 'condicional'; status: 'pendente' | 'confirmado' | 'cancelado'; criadoEm: string } | null;
    pedidos: number; favoritos: number; cupons: number; atendimento: { nome: string; telefone: string } | null;
  } | null;
};

const ABAS = [
  { href: '/minha-conta/pedidos', rotulo: 'Meus pedidos' },
  { href: '/minha-conta/sugestoes', rotulo: 'Sugestões para você' },
  { href: '/minha-conta/favoritos', rotulo: 'Favoritos' },
  { href: '/minha-conta/cupons', rotulo: 'Meus cupons', cupons: true },
  { href: '/minha-conta', rotulo: 'Meus dados' },
];

/** Área da cliente (porta de src/app/(loja)/minha-conta/layout.tsx): nome, resumo e as abas. */
export function ContaCliente({ conta, titulo, children }: { conta: ResumoConta; titulo: string; children: ReactNode }) {
  const { usuario, loja, identidade } = usePage().props;
  const url = usePage().url.split('?')[0];
  const primeiro = usuario?.nome.split(' ')[0] ?? '';
  const r = conta.resumo;
  return (
    <LojaLayout>
      <Head title={titulo} />
      <Box sx={{ pt: { xs: 2, sm: 4 }, maxWidth: 1152, mx: 'auto' }}>
        <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2 }}>
          <Stack direction="row" spacing={2} sx={{ minWidth: 0, alignItems: 'center' }}>
            <Box aria-hidden sx={{ width: { xs: 56, sm: 64 }, height: { xs: 56, sm: 64 }, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: '50%', bgcolor: 'marca.marrom-950', fontSize: 24 }}>
              <Box component="span" sx={{ color: 'marca.creme' }}>{primeiro[0]}</Box>
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'secondary.main' }}>Minha conta</Typography>
              <Typography component="h1" noWrap sx={{ ...estiloTitulo, fontSize: { xs: '1.875rem', sm: '2.25rem' }, lineHeight: 1.2 }}>Olá, {primeiro}</Typography>
              <Typography variant="body2" color="text.secondary" noWrap>{conta.email}</Typography>
            </Box>
          </Stack>
          <Button variant="outlined" onClick={() => router.post('/sair')} sx={{ borderRadius: 99, color: 'text.secondary', borderColor: 'marca.borda-forte' }}>Sair</Button>
        </Stack>

        {r && (
          <Box sx={{ mt: 4, display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: { xs: 1, sm: 1.5 } }}>
            <Bloco rotulo="Último pedido" href="/minha-conta/pedidos">
              {r.ultimoPedido ? (
                <>
                  <Typography sx={{ fontWeight: 800, color: 'marca.marrom-950' }}>{r.ultimoPedido.codigo}</Typography>
                  <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}><EtiquetaTipo tipo={r.ultimoPedido.tipo} /><EtiquetaStatus status={r.ultimoPedido.status} /></Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>{formatarData(r.ultimoPedido.criadoEm)} · {r.pedidos} no total</Typography>
                </>
              ) : <Typography variant="body2" color="text.secondary">Nenhum ainda</Typography>}
            </Bloco>
            <Bloco rotulo="Favoritos" href="/minha-conta/favoritos">
              <Typography sx={{ fontWeight: 800, fontSize: 30, color: 'marca.marrom-950', lineHeight: 1.1 }}>{r.favoritos}</Typography>
              <Typography variant="caption" color="text.secondary">{r.favoritos === 1 ? 'peça guardada' : 'peças guardadas'}</Typography>
            </Bloco>
            {conta.cuponsLigados ? (
              <Bloco rotulo="Cupons" href="/minha-conta/cupons">
                <Typography sx={{ fontWeight: 800, fontSize: 30, color: 'marca.marrom-950', lineHeight: 1.1 }}>{r.cupons}</Typography>
                <Typography variant="caption" color="text.secondary">{r.cupons === 1 ? 'disponível para usar' : 'disponíveis para usar'}</Typography>
              </Bloco>
            ) : (
              <Bloco rotulo="Catálogo" href="/catalogo?ordem=novidades">
                <Typography variant="body2" sx={{ color: 'marca.marrom-950' }}>Ver as novidades</Typography>
                <Typography variant="caption" color="text.secondary">Peças que acabaram de chegar</Typography>
              </Bloco>
            )}
            <Box sx={{ borderRadius: 6, bgcolor: 'marca.creme', p: 2.5, display: 'grid', alignContent: 'start', gap: 0.5 }}>
              <Typography sx={rotulo}>Quem te atende</Typography>
              {r.atendimento ? (
                <>
                  <Typography noWrap sx={{ fontSize: 14, fontWeight: 600, color: 'marca.marrom-950' }}>{r.atendimento.nome}</Typography>
                  <Box component="a" href={linkWhatsApp(r.atendimento.telefone, `Olá, ${r.atendimento.nome.split(' ')[0]}!`)} target="_blank" rel="noopener" sx={{ display: 'inline-flex', gap: 0.75, alignItems: 'center', fontSize: 14, color: 'whatsapp.main' }}><WhatsApp sx={{ fontSize: 16 }} />Chamar no WhatsApp</Box>
                </>
              ) : (
                <Box component="a" href={linkWhatsApp(loja?.whatsapp ?? '', `Olá! Vim pelo catálogo da ${identidade.nome}.`)} target="_blank" rel="noopener" sx={{ display: 'inline-flex', gap: 0.75, alignItems: 'center', fontSize: 14, color: 'whatsapp.main' }}><WhatsApp sx={{ fontSize: 16 }} />Falar com a loja</Box>
              )}
            </Box>
          </Box>
        )}

        <Stack component="nav" direction="row" spacing={1} aria-label="Minha conta" sx={{ mt: 4, mx: { xs: -2, sm: 0 }, px: { xs: 2, sm: 0 }, overflowX: 'auto', scrollbarWidth: 'none', whiteSpace: 'nowrap' }}>
          {ABAS.filter(a => !a.cupons || conta.cuponsLigados).map(a => {
            const ativa = url === a.href;
            return <Button key={a.href} href={a.href} aria-current={ativa ? 'page' : undefined} variant={ativa ? 'contained' : 'outlined'} sx={{ flexShrink: 0, borderRadius: 99, ...(ativa ? {} : { borderColor: 'marca.borda-forte', color: 'marca.marrom-950' }) }}>{a.rotulo}</Button>;
          })}
        </Stack>
        <Box sx={{ pt: 4, minHeight: 256 }}>{children}</Box>
      </Box>
    </LojaLayout>
  );
}

export const rotulo = { fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'text.secondary' } as const;

function Bloco({ rotulo: r, href, children }: { rotulo: string; href: string; children: ReactNode }) {
  return (
    <LinkSimples href={href} sx={{ borderRadius: 6, bgcolor: 'marca.creme', p: 2.5, display: 'grid', alignContent: 'start', gap: 0.5, border: 1, borderColor: 'transparent', '&:hover': { borderColor: 'marca.marrom-950' } }}>
      <Typography sx={rotulo}>{r}</Typography>
      {children}
    </LinkSimples>
  );
}

/** Mensagem de "nada aqui", com um link opcional. */
export function VazioConta({ children, acao }: { children: ReactNode; acao?: { href: string; rotulo: string } }) {
  return (
    <Box sx={{ borderRadius: 6, border: '1px dashed', borderColor: 'marca.borda-forte', p: 5, textAlign: 'center', color: 'text.secondary' }}>
      {children}
      {acao && <Box sx={{ mt: 2 }}><Button href={acao.href} variant="contained" sx={{ borderRadius: 99 }}>{acao.rotulo}</Button></Box>}
    </Box>
  );
}
