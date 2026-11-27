import { createTheme, type Theme } from '@mui/material/styles';
import { coresDa, WHATSAPP, type Token } from './cores';
import { LinkInertia } from './LinkInertia';

declare module '@mui/material/styles' {
  interface Palette { marca: Record<Token, string>; whatsapp: Palette['primary']; imperdivel: Palette['primary'] }
  interface PaletteOptions { marca?: Record<Token, string>; whatsapp?: PaletteOptions['primary']; imperdivel?: PaletteOptions['primary'] }
}
declare module '@mui/material/Button' {
  interface ButtonPropsColorOverrides { whatsapp: true; imperdivel: true }
}
declare module '@mui/material/Chip' {
  interface ChipPropsColorOverrides { whatsapp: true; imperdivel: true }
}
declare module '@mui/material/Badge' {
  interface BadgePropsColorOverrides { imperdivel: true }
}
declare module '@mui/material/Fab' {
  interface FabPropsColorOverrides { whatsapp: true }
}
declare module '@mui/material/Switch' {
  interface SwitchPropsColorOverrides { imperdivel: true }
}

const FONTE_DISPLAY = '"Archivo", "Arial Narrow", system-ui, sans-serif';
const FONTE_TEXTO = '"Hanken Grotesk", system-ui, sans-serif';
export const FONTE_TITULO = '"Fraunces", Georgia, serif';
export const FONTE_LOJA = '"Plus Jakarta Sans", system-ui, sans-serif';

/**
 * Tema MUI a partir da identidade (docs/29, 3.7): primária, secundária, fundos, texto e as cores de estado vêm das cores
 * da loja. `area` muda as fontes: a loja usa Plus Jakarta Sans em tudo, como no sistema atual.
 */
export function criarTema(mudadas?: Partial<Record<Token, string>>, area: 'painel' | 'loja' = 'painel'): Theme {
  const c = coresDa(mudadas);
  const texto = area === 'loja' ? FONTE_LOJA : FONTE_TEXTO;
  const display = area === 'loja' ? FONTE_LOJA : FONTE_DISPLAY;
  return createTheme({
    palette: {
      mode: 'light',
      primary: { main: c['marrom-950'], dark: c['marrom-700'], contrastText: c.creme },
      secondary: { main: c.caramelo, contrastText: c.creme },
      success: { main: c.oliva, contrastText: '#ffffff' },
      error: { main: c.vermelho },
      warning: { main: c.caramelo },
      background: { default: c.creme, paper: c.card },
      text: { primary: c['marrom-900'], secondary: c.suave },
      divider: c.borda,
      whatsapp: { main: WHATSAPP.principal, dark: WHATSAPP.escuro, contrastText: '#ffffff' },
      imperdivel: { main: c.imperdivel, contrastText: '#ffffff' },
      marca: c,
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: texto,
      h1: { fontFamily: display, fontWeight: 700 },
      h2: { fontFamily: display, fontWeight: 700 },
      h3: { fontFamily: display, fontWeight: 700 },
      h4: { fontFamily: display, fontWeight: 700 },
      h5: { fontFamily: display, fontWeight: 600 },
      h6: { fontFamily: display, fontWeight: 600 },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiButtonBase: { defaultProps: { LinkComponent: LinkInertia } },
      MuiButton: { defaultProps: { disableElevation: true } },
      MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { outlined: { borderColor: c.borda } } },
      MuiCard: { defaultProps: { variant: 'outlined' } },
      MuiTextField: { defaultProps: { size: 'small', fullWidth: true } },
      MuiOutlinedInput: { styleOverrides: { root: { backgroundColor: c.card }, notchedOutline: { borderColor: c['borda-forte'] } } },
      MuiAppBar: { defaultProps: { elevation: 0 } },
      MuiLink: { defaultProps: { underline: 'hover', component: LinkInertia }, styleOverrides: { root: { color: c.caramelo } } },
    },
  });
}
