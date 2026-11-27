import { useState, type ReactNode } from 'react';
import { router, usePage } from '@inertiajs/react';
import {
  AppBar, Badge, Box, Divider, Drawer, IconButton, InputBase, List, ListItemButton, ListItemIcon, ListItemText, ListSubheader, Tab, Tabs, Toolbar, Tooltip, Typography,
  useMediaQuery, useTheme,
} from '@mui/material';
import {
  Campaign, ConfirmationNumber, Groups, HelpOutlined, Home, Inventory2, Logout, Menu as MenuIcone, Notifications, PointOfSale, Insights, ReceiptLong,
  Settings, ShoppingBag, Storefront, SupportAgent, ChevronLeft, Search,
} from '@mui/icons-material';
import { ComTema } from '@/tema/ComTema';
import { SinalEquipe } from '@/Components/painel/SinalEquipe';
import { abasDaPagina, areaAtiva, itemAtivo, menuDoPainel, type ItemMenu } from '@/lib/menu-painel';

const ICONES: Record<string, typeof Home> = {
  inicio: Home, caixa: PointOfSale, atendimento: SupportAgent, pedidos: ReceiptLong, sugestoes: ShoppingBag, vitrines: Storefront,
  clientes: Groups, cupons: ConfirmationNumber, produtos: Inventory2, resultados: Insights, equipe: Campaign, configuracoes: Settings, tutorial: HelpOutlined,
};
const LARGURA = 248;
const RECOLHIDA = 68;

/** Painel da equipe (D-35): menu lateral por seções, recolhível no computador e em gaveta no celular; abas no topo. */
export default function PainelLayout({ titulo, acoes, children }: { titulo?: string; acoes?: ReactNode; children: ReactNode }) {
  return (
    <ComTema area="painel">
      <SinalEquipe />
      <Moldura titulo={titulo} acoes={acoes}>{children}</Moldura>
    </ComTema>
  );
}

function Moldura({ titulo, acoes, children }: { titulo?: string; acoes?: ReactNode; children: ReactNode }) {
  const { usuario, painel, identidade } = usePage().props;
  const caminho = usePage().url.split('?')[0];
  const tema = useTheme();
  const computador = useMediaQuery(tema.breakpoints.up('md'));
  const [aberta, setAberta] = useState(false);
  const [recolhida, setRecolhida] = useState(() => {
    try { return localStorage.getItem('dcerutti-menu-recolhido') === '1'; } catch { return false; }
  });
  const gestor = usuario?.papel === 'gestor';
  const menu = menuDoPainel(gestor, painel?.pendentes ?? 0, { atendimento: painel?.atendimento ? { fila: 0 } : null, vitrines: painel?.vitrines, pagamentos: painel?.pagamentos });
  const ativa = areaAtiva(menu, caminho);
  const abas = abasDaPagina(menu, caminho);
  const estreita = computador && recolhida;
  const largura = estreita ? RECOLHIDA : LARGURA;
  const alternar = () => {
    const novo = !recolhida;
    setRecolhida(novo);
    try { localStorage.setItem('dcerutti-menu-recolhido', novo ? '1' : '0'); } catch { /* sem armazenamento */ }
  };

  const item = (i: ItemMenu) => {
    const Icone = ICONES[i.icone] ?? Home;
    const selecionado = ativa?.href === i.href || itemAtivo(i.href, caminho);
    const botao = (
      <ListItemButton key={i.href} href={i.href} selected={selecionado} onClick={() => setAberta(false)}
        sx={{ borderRadius: 2, mx: 1, mb: 0.25, color: 'primary.contrastText', '&.Mui-selected': { bgcolor: 'rgba(255,255,255,.12)' }, '&:hover': { bgcolor: 'rgba(255,255,255,.08)' } }}>
        <ListItemIcon sx={{ minWidth: 40, color: 'inherit' }}>
          <Badge color="secondary" badgeContent={i.contador} invisible={!i.contador}><Icone fontSize="small" /></Badge>
        </ListItemIcon>
        {!estreita && <ListItemText primary={i.rotulo} slotProps={{ primary: { sx: { fontSize: 14 } } }} />}
      </ListItemButton>
    );
    return estreita ? <Tooltip key={i.href} title={i.rotulo} placement="right">{botao}</Tooltip> : botao;
  };

  const conteudoMenu = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'primary.main', color: 'primary.contrastText' }}>
      <Toolbar sx={{ justifyContent: estreita ? 'center' : 'space-between', px: 2 }}>
        {!estreita && <Box component="img" src={identidade.logoClara.url} alt={identidade.nome} sx={{ height: 34 }} />}
        {computador && <IconButton onClick={alternar} sx={{ color: 'inherit' }} aria-label={recolhida ? 'Abrir o menu' : 'Recolher o menu'}>{recolhida ? <MenuIcone /> : <ChevronLeft />}</IconButton>}
      </Toolbar>
      <Box component="nav" aria-label="Menu do painel" sx={{ flex: 1, overflowY: 'auto', pb: 2 }}>
        {menu.map((s, k) => (
          <List key={k} dense subheader={s.titulo && !estreita ? <ListSubheader disableSticky sx={{ bgcolor: 'transparent', color: 'marca.areia', lineHeight: '32px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>{s.titulo}</ListSubheader> : undefined}>
            {s.itens.map(item)}
          </List>
        ))}
      </Box>
      <Divider sx={{ borderColor: 'rgba(255,255,255,.12)' }} />
      <List dense>
        <ListItemButton onClick={() => router.post('/sair')} sx={{ mx: 1, borderRadius: 2, color: 'inherit' }}>
          <ListItemIcon sx={{ minWidth: 40, color: 'inherit' }}><Logout fontSize="small" /></ListItemIcon>
          {!estreita && <ListItemText primary="Sair" secondary={usuario?.nome} slotProps={{ secondary: { sx: { color: 'marca.areia' } } }} />}
        </ListItemButton>
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh', bgcolor: 'background.default' }}>
      {computador ? (
        <Drawer variant="permanent" sx={{ width: largura, flexShrink: 0, '& .MuiDrawer-paper': { width: largura, border: 0, transition: 'width .2s' } }}>{conteudoMenu}</Drawer>
      ) : (
        <Drawer open={aberta} onClose={() => setAberta(false)} sx={{ '& .MuiDrawer-paper': { width: LARGURA, border: 0 } }}>{conteudoMenu}</Drawer>
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <AppBar position="sticky" color="inherit" sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
          <Toolbar sx={{ gap: 1 }}>
            {!computador && <IconButton edge="start" onClick={() => setAberta(true)} aria-label="Abrir o menu"><MenuIcone /></IconButton>}
            <Typography variant="h6" component="h1" sx={{ flex: 1, fontSize: 18 }} noWrap>{titulo ?? ativa?.rotulo ?? 'Painel'}</Typography>
            <Box component="form" role="search" onSubmit={e => { e.preventDefault(); const q = new FormData(e.currentTarget).get('q'); router.get('/painel/busca', { q: String(q ?? '') }); }} sx={{ display: { xs: 'none', md: 'block' } }}>
              <InputBase name="q" placeholder="Buscar cliente, pedido ou peça…" inputProps={{ 'aria-label': 'Buscar' }} startAdornment={<Search fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />}
                sx={{ width: 300, px: 1.5, py: 0.5, borderRadius: 99, bgcolor: 'background.default', border: 1, borderColor: 'divider', fontSize: 14 }} />
            </Box>
            {!computador && <IconButton href="/painel/busca" aria-label="Buscar"><Search /></IconButton>}
            {acoes}
            <IconButton href="/painel/notificacoes" aria-label="Notificações">
              <Badge color="secondary" badgeContent={painel?.notificacoes} max={99}><Notifications /></Badge>
            </IconButton>
          </Toolbar>
          {abas && (
            <Tabs value={abas.ativa} variant="scrollable" allowScrollButtonsMobile sx={{ px: { xs: 1, md: 2 } }}>
              {abas.abas.map(a => <Tab key={a.href} value={a.href} href={a.href} label={a.contador ? `${a.rotulo} (${a.contador})` : a.rotulo} />)}
            </Tabs>
          )}
        </AppBar>
        <Box component="main" sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>{children}</Box>
      </Box>
    </Box>
  );
}
