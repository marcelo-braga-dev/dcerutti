import { useEffect, useRef, useState, type ReactNode } from 'react';
import { router, usePage } from '@inertiajs/react';
import { LinkSimples } from '@/Components/loja/LinkSimples';
import { Badge, Box, Button, Divider, Drawer, Fab, IconButton, InputBase, Paper, Stack, Typography } from '@mui/material';
import {
  Check, ChatBubbleOutlined, Close, CreditCard, FavoriteBorder, HomeOutlined, Instagram, LocalShippingOutlined, Menu as IconeMenu,
  PersonOutlined, Search, ShoppingBagOutlined, WhatsApp,
} from '@mui/icons-material';
import { ComTema } from '@/tema/ComTema';
import { Rastreador } from '@/Components/loja/Rastreador';
import { FotoCheia } from '@/Components/loja/Vitrine';
import { useFavoritos } from '@/Components/loja/Favoritos';
import { brl } from '@/lib/dinheiro';
import { plural } from '@/lib/pedido';
import { useSacola } from '@/lib/sacola';
import { linkWhatsApp } from '@/lib/whatsapp';

const LINKS = [
  { href: '/catalogo?ordem=novidades', rotulo: 'Novidades', ativo: (p: URLSearchParams) => p.get('ordem') === 'novidades' },
  { href: '/catalogo?genero=feminino', rotulo: 'Feminino', ativo: (p: URLSearchParams) => p.get('genero') === 'feminino' },
  { href: '/catalogo?genero=masculino', rotulo: 'Masculino', ativo: (p: URLSearchParams) => p.get('genero') === 'masculino' },
  { href: '/catalogo?promo=1', rotulo: 'Promoções', ativo: (p: URLSearchParams) => p.get('promo') === '1' },
  { href: '/catalogo?imperdivel=1', rotulo: 'Imperdível', ativo: (p: URLSearchParams) => p.get('imperdivel') === '1', destaque: true },
  { href: '/catalogo', rotulo: 'Ver tudo', ativo: (p: URLSearchParams) => p.size === 0 },
];

/**
 * Loja (porta de src/app/(loja)/layout.tsx): faixa de avisos, topo com busca, conta, favoritos e sacola, seções, rodapé,
 * WhatsApp flutuante e o painel que aparece ao pôr uma peça na sacola. `estatico`: no editor, o topo não fica fixo.
 */
export default function LojaLayout({ children, estatico = false }: { children: ReactNode; estatico?: boolean }) {
  const { loja } = usePage().props;
  return (
    <ComTema area="loja">
      <Box sx={{ bgcolor: 'background.paper', minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
        {loja?.rastrear && <Rastreador />}
        <Avisos />
        <Cabecalho estatico={estatico} />
        <Box component="main" sx={{ flex: 1, width: '100%', mx: 'auto', maxWidth: 1440, px: { xs: 2, sm: 4 } }}>{children}</Box>
        <Rodape />
        <WhatsAppFlutuante />
        <GavetaSacola />
      </Box>
    </ComTema>
  );
}

function Avisos() {
  const { loja } = usePage().props;
  if (!loja) return null;
  const cidade = loja.cidadeCondicional.split('/')[0];
  const itens = [
    { icone: <HomeOutlined sx={{ fontSize: 16 }} />, texto: `Prove em casa em ${cidade}: pague só o que ficar` },
    loja.frete?.gratisAcima ? { icone: <LocalShippingOutlined sx={{ fontSize: 16 }} />, texto: `Frete grátis acima de ${brl(loja.frete.gratisAcima)}` } : null,
    loja.parcelas > 1 ? { icone: <CreditCard sx={{ fontSize: 16 }} />, texto: `Parcele em até ${loja.parcelas}x` } : null,
    { icone: <ChatBubbleOutlined sx={{ fontSize: 16 }} />, texto: 'Atendimento de pessoa para pessoa no WhatsApp' },
  ].filter(a => a !== null);
  const lista = (oculta?: boolean) => (
    <Stack component="ul" direction="row" aria-hidden={oculta || undefined} sx={{ flexShrink: 0, m: 0, p: 0, listStyle: 'none', alignItems: 'center' }}>
      {itens.map(i => <Stack component="li" key={i.texto} direction="row" spacing={1} sx={{ alignItems: 'center', px: 3, whiteSpace: 'nowrap' }}><Box sx={{ color: 'marca.areia', display: 'flex' }}>{i.icone}</Box>{i.texto}</Stack>)}
    </Stack>
  );
  return (
    <Box sx={{ bgcolor: 'marca.marrom-950', color: 'marca.creme', fontSize: '0.78rem', fontWeight: 500, height: 36, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
      <Box sx={{ display: { xs: 'none', md: 'flex' }, mx: 'auto' }}>{lista()}</Box>
      <Box sx={{ display: { xs: 'flex', md: 'none' }, width: 'max-content', animation: 'avisos 28s linear infinite', '@keyframes avisos': { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } } }}>{lista()}{lista(true)}</Box>
    </Box>
  );
}

function Cabecalho({ estatico }: { estatico: boolean }) {
  const { usuario, identidade, loja, url } = { ...usePage().props, url: usePage().url };
  const s = useSacola();
  const favoritos = useFavoritos().ids.size;
  const [menu, setMenu] = useState(false);
  const [buscaAberta, setBuscaAberta] = useState(false);
  const params = new URLSearchParams(url.split('?')[1] ?? '');
  const noCatalogo = url.startsWith('/catalogo');
  const [termo, setTermo] = useState(noCatalogo ? params.get('q') ?? '' : '');
  const cliente = usuario?.papel === 'cliente';
  const primeiroNome = usuario?.nome.split(' ')[0];
  useEffect(() => { setMenu(false); setBuscaAberta(false); }, [url]);
  const buscar = (e: React.FormEvent) => {
    e.preventDefault();
    const q = termo.trim();
    router.visit(q ? `/catalogo?q=${encodeURIComponent(q)}` : '/catalogo');
  };
  const campoBusca = (autoFocus = false) => (
    <Box component="form" role="search" onSubmit={buscar} sx={{ display: 'flex', alignItems: 'center', gap: 1, height: 44, px: 2, borderRadius: 99, bgcolor: 'background.default', border: 1, borderColor: 'divider', flex: 1 }}>
      <Search sx={{ color: 'text.secondary', fontSize: 20 }} />
      <InputBase value={termo} onChange={e => setTermo(e.target.value)} placeholder="Buscar peça, cor ou referência" autoFocus={autoFocus} sx={{ flex: 1, fontSize: 14 }} inputProps={{ 'aria-label': 'Buscar no catálogo', maxLength: 80 }} />
    </Box>
  );
  const quantidade = s.pronta ? s.quantidade : 0;
  return (
    <Box component="header" sx={{ position: estatico ? 'static' : 'sticky', top: 0, zIndex: 20, bgcolor: 'rgba(255,253,249,.95)', backdropFilter: 'blur(12px)', borderBottom: 1, borderColor: 'divider' }}>
      <Box sx={{ maxWidth: 1440, mx: 'auto', px: { xs: 1, sm: 4 }, height: { xs: 64, lg: 76 }, display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 2 } }}>
        <IconButton sx={{ display: { lg: 'none' } }} onClick={() => setMenu(true)} aria-label="Abrir menu"><IconeMenu /></IconButton>
        <LinkSimples href="/" sx={{ display: 'flex', alignItems: 'center', mr: { lg: 2 }, flexShrink: 0 }} aria-label={`${identidade.nome}, página inicial`}>
          <Box component="img" src={identidade.logo.url} alt={identidade.nome} sx={{ height: { xs: 34, lg: 44 }, width: 'auto' }} />
        </LinkSimples>
        <Box sx={{ display: { xs: 'none', md: 'flex' }, flex: 1, maxWidth: 560, mx: 'auto' }}>{campoBusca()}</Box>
        <Box sx={{ flex: { xs: 1, md: 0 } }} />
        <IconButton sx={{ display: { md: 'none' } }} onClick={() => setBuscaAberta(v => !v)} aria-label="Buscar"><Search /></IconButton>
        {usuario ? (
          <Button href={cliente ? '/minha-conta/pedidos' : '/painel'} startIcon={<PersonOutlined />} sx={{ color: 'marca.marrom-950', borderRadius: 99, display: { xs: 'none', sm: 'inline-flex' } }}>
            {cliente ? `Olá, ${primeiroNome}` : 'Painel'}
          </Button>
        ) : (
          <Button href={`/entrar?volta=${encodeURIComponent(url)}`} startIcon={<PersonOutlined />} sx={{ color: 'marca.marrom-950', borderRadius: 99, display: { xs: 'none', sm: 'inline-flex' } }}>Entrar</Button>
        )}
        {cliente && (
          <IconButton href="/minha-conta/favoritos" aria-label={`Favoritos (${favoritos})`}>
            <Badge badgeContent={favoritos} color="imperdivel"><FavoriteBorder /></Badge>
          </IconButton>
        )}
        <IconButton href="/sacola" aria-label={`Sacola (${plural(quantidade, 'peça', 'peças')})`}>
          <Badge badgeContent={quantidade} color="primary"><ShoppingBagOutlined /></Badge>
        </IconButton>
      </Box>
      {buscaAberta && <Box sx={{ display: { md: 'none' }, px: 2, pb: 1.5 }}>{campoBusca(true)}</Box>}
      <Box component="nav" aria-label="Seções" sx={{ maxWidth: 1440, mx: 'auto', px: { xs: 2, sm: 4 }, display: 'flex', gap: { xs: 1, lg: 0.5 }, overflowX: 'auto', scrollbarWidth: 'none', pb: { xs: 1.25, lg: 0 }, height: { lg: 44 }, alignItems: 'center' }}>
        {LINKS.map(l => {
          const ativo = noCatalogo && l.ativo(params);
          return (
            <Button key={l.href} href={l.href} size="small" aria-current={ativo ? 'page' : undefined}
              sx={{ flexShrink: 0, borderRadius: 99, px: 2, fontWeight: 600, color: l.destaque ? 'imperdivel.main' : 'marca.marrom-950', bgcolor: ativo ? 'marca.bege' : { xs: 'background.default', lg: 'transparent' }, border: { xs: 1, lg: 0 }, borderColor: 'divider' }}>
              {l.rotulo}
            </Button>
          );
        })}
      </Box>
      <Drawer open={menu} onClose={() => setMenu(false)} slotProps={{ paper: { sx: { width: 'min(86vw, 360px)', bgcolor: 'background.paper' } } }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', p: 2 }}>
          <Box component="img" src={identidade.logo.url} alt={identidade.nome} sx={{ height: 34 }} />
          <IconButton onClick={() => setMenu(false)} aria-label="Fechar menu"><Close /></IconButton>
        </Stack>
        <Divider />
        <Stack sx={{ p: 2 }} spacing={0.5}>
          {LINKS.map(l => <Button key={l.href} href={l.href} sx={{ justifyContent: 'flex-start', color: l.destaque ? 'imperdivel.main' : 'marca.marrom-950', fontSize: 16 }}>{l.rotulo}</Button>)}
        </Stack>
        {!!loja?.atalhos.length && (
          <>
            <Divider />
            <Typography sx={{ px: 3, pt: 2, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'secondary.main' }}>Categorias</Typography>
            <Stack sx={{ p: 2 }} spacing={0.25}>
              {loja.atalhos.map(a => <Button key={a.href} href={a.href} sx={{ justifyContent: 'flex-start', color: 'marca.marrom-950' }}>{a.rotulo}</Button>)}
            </Stack>
          </>
        )}
        <Divider />
        <Stack sx={{ p: 2 }} spacing={1}>
          {usuario ? (
            <>
              <Button href={cliente ? '/minha-conta/pedidos' : '/painel'} startIcon={<PersonOutlined />} sx={{ justifyContent: 'flex-start' }}>{cliente ? 'Minha conta' : 'Painel'}</Button>
              <Button onClick={() => router.post('/sair')} sx={{ justifyContent: 'flex-start', color: 'text.secondary' }}>Sair</Button>
            </>
          ) : <Button href="/entrar" variant="contained" sx={{ borderRadius: 99 }}>Entrar</Button>}
          {loja && <Button href={linkWhatsApp(loja.whatsapp, `Olá! Vim pelo catálogo da ${identidade.nome}.`)} target="_blank" rel="noopener" startIcon={<WhatsApp />} color="whatsapp" variant="outlined" sx={{ borderRadius: 99 }}>Falar com a loja</Button>}
        </Stack>
      </Drawer>
    </Box>
  );
}

function Rodape() {
  const { identidade, loja } = usePage().props;
  const cidade = loja?.cidadeCondicional.split('/')[0] ?? '';
  return (
    <Box component="footer" sx={{ mt: { xs: 10, sm: 14 }, bgcolor: 'marca.marrom-950', color: 'marca.areia' }}>
      <Box sx={{ maxWidth: 1440, mx: 'auto', px: { xs: 2, sm: 4 }, py: { xs: 6, sm: 8 }, display: 'grid', gap: 5, gridTemplateColumns: { md: '1.4fr 1fr 1fr' } }}>
        <Box>
          <Box component="img" src={identidade.logoClara.url} alt={identidade.nome} sx={{ height: 48, width: 'auto' }} />
          {identidade.slogan && <Typography sx={{ mt: 2, color: 'marca.creme', fontSize: 15 }}>{identidade.slogan}</Typography>}
          <Typography sx={{ mt: 1, fontSize: 14, maxWidth: 360 }}>Estoque pronto em {cidade} (SC). Monte sua sacola e envie pelo WhatsApp: uma pessoa da loja cuida do seu pedido.</Typography>
        </Box>
        <Stack spacing={1}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'marca.creme' }}>Comprar</Typography>
          {LINKS.slice(0, 5).map(l => <LinkSimples key={l.href} href={l.href} sx={{ color: 'inherit', textDecoration: 'none', fontSize: 14, '&:hover': { color: 'marca.creme' } }}>{l.rotulo}</LinkSimples>)}
        </Stack>
        <Stack spacing={1}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'marca.creme' }}>Atendimento</Typography>
          {loja && <Box component="a" href={linkWhatsApp(loja.whatsapp, `Olá! Vim pelo catálogo da ${identidade.nome}.`)} target="_blank" rel="noopener" sx={{ color: 'inherit', textDecoration: 'none', fontSize: 14, display: 'flex', gap: 1, alignItems: 'center' }}><WhatsApp sx={{ fontSize: 18 }} />WhatsApp da loja</Box>}
          {loja?.instagram && <Box component="a" href={`https://instagram.com/${loja.instagram}`} target="_blank" rel="noopener" sx={{ color: 'inherit', textDecoration: 'none', fontSize: 14, display: 'flex', gap: 1, alignItems: 'center' }}><Instagram sx={{ fontSize: 18 }} />@{loja.instagram}</Box>}
          <LinkSimples href="/privacidade" sx={{ color: 'inherit', textDecoration: 'none', fontSize: 14 }}>Política de privacidade</LinkSimples>
        </Stack>
      </Box>
      <Box sx={{ borderTop: 1, borderColor: 'rgba(246,242,236,.12)', py: 2.5, textAlign: 'center', fontSize: 12 }}>© {new Date().getFullYear()} {identidade.nome}</Box>
    </Box>
  );
}

/** Botão do WhatsApp da loja no canto. Some na sacola, na peça e na conta, que já têm os botões de WhatsApp. */
function WhatsAppFlutuante() {
  const { loja, identidade } = usePage().props;
  const url = usePage().url;
  if (!loja || /^\/(sacola|produto\/|minha-conta)/.test(url)) return null;
  return (
    <Fab color="whatsapp" href={linkWhatsApp(loja.whatsapp, `Olá! Vim pelo catálogo da ${identidade.nome}.`)} target="_blank" rel="noopener" aria-label="Falar com a loja no WhatsApp"
      sx={{ position: 'fixed', right: 16, bottom: url.startsWith('/catalogo') ? { xs: 80, lg: 24 } : 24, zIndex: 30 }}>
      <WhatsApp sx={{ fontSize: 30 }} />
    </Fab>
  );
}

/** Aparece ao pôr uma peça na sacola; não bloqueia a tela e fecha sozinho em 6 s (menos com o mouse em cima). */
function GavetaSacola() {
  const s = useSacola();
  const url = usePage().url;
  const pausada = useRef(false);
  const [desde, setDesde] = useState(0);
  const ultimo = s.ultimo;
  useEffect(() => { if (ultimo) setDesde(ultimo.em); }, [ultimo]);
  useEffect(() => { s.fecharUltimo(); }, [url]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ultimo) return;
    const t = setInterval(() => { if (!pausada.current && Date.now() - desde > 6000) s.fecharUltimo(); }, 500);
    return () => clearInterval(t);
  }, [ultimo, desde]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ultimo) return null;
  const i = ultimo.item;
  return (
    <Paper role="status" aria-live="polite" elevation={12} onMouseEnter={() => { pausada.current = true; }} onMouseLeave={() => { pausada.current = false; setDesde(Date.now()); }}
      sx={{ position: 'fixed', zIndex: 40, top: { xs: 12, sm: 24 }, right: { xs: 12, sm: 24 }, left: { xs: 12, sm: 'auto' }, width: { sm: 400 }, borderRadius: 6, overflow: 'hidden', border: 1, borderColor: 'divider' }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', pl: 2.5, pr: 1, height: 56 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: 'success.main', fontWeight: 600, fontSize: 14 }}>
          <Box sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: 'success.main', color: 'marca.creme', display: 'grid', placeItems: 'center' }}><Check sx={{ fontSize: 15 }} /></Box>
          <span>Peça na sacola</span>
        </Stack>
        <IconButton onClick={() => s.fecharUltimo()} aria-label="Fechar"><Close /></IconButton>
      </Stack>
      <Stack direction="row" spacing={2} sx={{ px: 2.5, pb: 2 }}>
        <Box sx={{ position: 'relative', width: 64, flexShrink: 0, aspectRatio: '3 / 4', borderRadius: 3, overflow: 'hidden', bgcolor: 'marca.bege' }}><FotoCheia src={i.imagem} /></Box>
        <Box sx={{ minWidth: 0, fontSize: 14 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 500, color: 'marca.marrom-950' }}>{i.nome}</Typography>
          <Typography sx={{ fontSize: 14, color: 'text.secondary', mt: 0.5 }}>Tam. {i.tamanho}{i.cor ? ` · ${i.cor}` : ''}</Typography>
          <Typography sx={{ fontSize: 14, fontWeight: 700, mt: 0.5 }}>{brl(i.preco)}</Typography>
        </Box>
      </Stack>
      <Box sx={{ px: 2.5, pb: 2.5, display: 'grid', gap: 1.5 }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', fontSize: 14, borderRadius: 4, bgcolor: 'background.default', px: 2, py: 1.5 }}>
          <Box component="span" sx={{ color: 'text.secondary' }}>Sua sacola · {plural(s.quantidade, 'peça', 'peças')}</Box>
          <strong>{brl(s.subtotal)}</strong>
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
          <Button variant="outlined" onClick={() => s.fecharUltimo()} sx={{ height: 48, borderRadius: 99 }}>Continuar</Button>
          <Button variant="contained" href="/sacola" sx={{ height: 48, borderRadius: 99 }}>Ver sacola</Button>
        </Box>
      </Box>
    </Paper>
  );
}
