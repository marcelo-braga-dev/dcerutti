import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, ListSubheader, Stack, TextField, Typography } from '@mui/material';
import { LinkOutlined, PhotoCameraOutlined, VisibilityOffOutlined, VisibilityOutlined } from '@mui/icons-material';
import { limparLink, linkDe, linkPadrao, TEXTOS_INICIO, type CampoImagem, type CampoTexto, type ConteudoInicio, type Secao } from '@/lib/conteudo-inicio';
import { LinkSimples } from './LinkSimples';
import { FotoCheia } from './Vitrine';

/**
 * Edição visual da página inicial (porta de src/components/loja/editavel.tsx). Fora do editor não há provedor e os
 * componentes só mostram o conteúdo; dentro dele, texto editável com um clique, "Trocar foto", "Link" e ocultar seção.
 */
type Edicao = {
  conteudo: ConteudoInicio;
  mudarTexto: (campo: CampoTexto, valor: string) => void;
  trocarImagem: (campo: CampoImagem) => void;
  usarAutomatica: (campo: CampoImagem) => void;
  alternarSecao: (s: Secao) => void;
  abrirLink: (campo: string, rotulo: string) => void;
  versao: number;
  enviando: CampoImagem | null;
};

const Ctx = createContext<Edicao | null>(null);
export const ProvedorEdicao = Ctx.Provider;
export const useEdicao = () => useContext(Ctx);
const AMARELO = '#ffd86b';
const parar = (ev: React.SyntheticEvent) => { ev.preventDefault(); ev.stopPropagation(); };

/** Texto da página: `valor` pronto (com a cidade, o frete…); `bruto`, o que o gestor edita (com {cidade}). */
export function Texto({ campo, valor, bruto }: { campo: CampoTexto; valor: string; bruto: string }) {
  const e = useEdicao();
  const ref = useRef<HTMLSpanElement>(null);
  const atual = e ? e.conteudo.textos[campo] ?? TEXTOS_INICIO[campo] : bruto;
  // Escrito no elemento só ao montar e no "Desfazer": reescrever a cada tecla faria o cursor pular.
  useEffect(() => {
    if (ref.current && ref.current.textContent !== atual) ref.current.textContent = atual;
  }, [e?.versao]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!e) return <>{valor}</>;
  return (
    <Box component="span" ref={ref} contentEditable="plaintext-only" suppressContentEditableWarning spellCheck data-editavel title="Clique para editar"
      onInput={ev => e.mudarTexto(campo, ev.currentTarget.textContent ?? '')}
      onKeyDown={ev => { if (ev.key === 'Enter') { ev.preventDefault(); ev.currentTarget.blur(); } }}
      onClick={parar}
      sx={{ display: 'inline-block', minWidth: '2ch', borderRadius: 1, cursor: 'text', mx: '-2px', px: '2px', outline: '1px dashed rgba(224,178,58,.6)', outlineOffset: 2, '&:hover': { outline: '2px dashed #e0b23a' }, '&:focus': { outline: '2px solid #e0b23a', bgcolor: 'rgba(255,216,107,.2)' } }} />
  );
}

/** Foto de um espaço da página: a escolhida pelo gestor ou a automática. No editor, com "Trocar foto". */
export function ImagemEditavel({ campo, salva, automatica, sx }: { campo: CampoImagem; salva: string | null; automatica: string | null; sx?: object }) {
  const e = useEdicao();
  const escolhida = e ? e.conteudo.imagens[campo] ?? null : salva;
  const foto = <FotoCheia src={escolhida || automatica} sx={sx} className="zoom" />;
  if (!e) return foto;
  return (
    <>
      {foto}
      <Stack data-editor-ui direction="row" spacing={0.75} onClick={parar} sx={{ position: 'absolute', left: 12, top: 12, zIndex: 10, flexWrap: 'wrap' }}>
        <Button size="small" variant="contained" startIcon={<PhotoCameraOutlined />} onClick={() => e.trocarImagem(campo)} disabled={e.enviando === campo}
          sx={{ borderRadius: 99, bgcolor: 'background.paper', color: 'marca.marrom-950', boxShadow: `0 0 0 2px ${AMARELO}`, '&:hover': { bgcolor: AMARELO } }}>
          {e.enviando === campo ? 'Enviando…' : 'Trocar foto'}
        </Button>
        {escolhida && <Button size="small" variant="contained" onClick={() => e.usarAutomatica(campo)} sx={{ borderRadius: 99 }}>Usar foto automática</Button>}
      </Stack>
    </>
  );
}

const POSICAO = {
  fora: { top: -12, right: -8 },
  dentro: { top: { xs: 8, sm: 12 }, right: { xs: 8, sm: 12 } },
  seta: { right: { xs: 12, sm: 24 }, bottom: { xs: 64, sm: 80 } },
  lado: { right: '100%', mr: 1, top: '50%', transform: 'translateY(-50%)' },
};

/** Botão ou card com destino editável. Sem destino, é só um bloco. Endereço de fora abre em outra aba. */
export function LinkEditavel({ campo, rotulo = '', href, posicao = 'fora', sx, children }: {
  campo?: string; rotulo?: string; href: string; posicao?: keyof typeof POSICAO; sx?: object; children: ReactNode;
}) {
  const e = useEdicao();
  const destino = e && campo ? linkDe(e.conteudo, campo) : href;
  const editar = e && campo ? (
    <Box data-editor-ui onClick={parar} sx={{ position: 'absolute', zIndex: 20, ...POSICAO[posicao] }}>
      <Button size="small" startIcon={<LinkOutlined />} onClick={() => e.abrirLink(campo, rotulo)} title={destino ? `Leva para: ${destino}` : 'Sem link'}
        sx={{ height: 28, px: 1.25, whiteSpace: 'nowrap', borderRadius: 99, fontSize: '0.7rem', boxShadow: `0 0 0 2px ${AMARELO}`, color: 'marca.marrom-950', bgcolor: e.conteudo.links[campo] ? AMARELO : 'background.paper', '&:hover': { bgcolor: AMARELO } }}>
        Link
      </Button>
    </Box>
  ) : null;
  const estilo = { ...(editar ? { position: 'relative' } : {}), ...sx };
  if (!destino) return <Box sx={estilo}>{children}{editar}</Box>;
  if (/^(https?|mailto|tel):/i.test(destino))
    return <Box component="a" href={destino} {...(/^https?:/i.test(destino) ? { target: '_blank', rel: 'noopener' } : {})} sx={{ color: 'inherit', textDecoration: 'none', display: 'block', ...estilo }}>{children}{editar}</Box>;
  return <LinkSimples href={destino} sx={{ display: 'block', ...estilo }}>{children}{editar}</LinkSimples>;
}

export type GrupoDestinos = { grupo: string; itens: { rotulo: string; href: string }[] };

/** Janela para escolher o destino de um botão ou card: uma página da loja ou um endereço digitado. */
export function DialogoLink({ campo, rotulo, atual, destinos, aoEscolher, aoFechar }: {
  campo: string; rotulo: string; atual: string; destinos: GrupoDestinos[]; aoEscolher: (link: string) => void; aoFechar: () => void;
}) {
  const [valor, setValor] = useState(atual);
  const [erro, setErro] = useState(false);
  const padrao = linkPadrao(campo) ?? '';
  const aplicar = (ev: FormEvent) => {
    ev.preventDefault();
    const limpo = limparLink(valor);
    if (limpo === null) return setErro(true);
    // Endereço copiado da própria loja vira caminho, para não abrir em outra aba.
    const url = URL.canParse(limpo) ? new URL(limpo) : null;
    aoEscolher(url?.origin === location.origin ? url.pathname + url.search + url.hash : limpo);
  };
  const conhecido = destinos.some(g => g.itens.some(d => d.href === valor));
  return (
    <Dialog open onClose={aoFechar} fullWidth maxWidth="sm" slotProps={{ paper: { component: 'form', onSubmit: aplicar, noValidate: true, sx: { borderRadius: 5 } } as never }}>
      <DialogTitle>Para onde este link leva?<Typography variant="body2" color="text.secondary">{rotulo}</Typography></DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField select label="Página da loja" value={conhecido ? valor : ''} onChange={ev => { if (ev.target.value) { setValor(ev.target.value); setErro(false); } }}>
            <MenuItem value="">Escolher uma página…</MenuItem>
            {destinos.flatMap(g => [<ListSubheader key={`g-${g.grupo}`}>{g.grupo}</ListSubheader>, ...g.itens.map(d => <MenuItem key={`${g.grupo}-${d.href}`} value={d.href}>{d.rotulo}</MenuItem>)])}
          </TextField>
          <TextField label="Ou digite o endereço" value={valor} onChange={ev => { setValor(ev.target.value); setErro(false); }} placeholder="/catalogo ou https://site.com.br" autoComplete="off"
            error={erro} helperText={erro ? 'Endereço inválido. Use um caminho da loja (/catalogo) ou um endereço completo (https://site.com.br).' : undefined} />
          <Typography variant="caption" color="text.secondary">{padrao ? `Padrão: ${padrao}. Deixe vazio para voltar a ele.` : 'Deixe vazio para ficar sem link.'} Endereços de fora abrem em outra aba.</Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={aoFechar}>Cancelar</Button>
        <Button type="submit" variant="contained" sx={{ borderRadius: 99, px: 3 }}>Aplicar</Button>
      </DialogActions>
    </Dialog>
  );
}

/** Seção da página. No editor, com o botão de ocultar; oculta, fica apagada (e fora do site ao salvar). */
export function SecaoEditavel({ secao, rotulo, children }: { secao: Secao; rotulo: string; children: ReactNode }) {
  const e = useEdicao();
  if (!e) return <>{children}</>;
  const oculta = e.conteudo.ocultas.includes(secao);
  return (
    <Box sx={{ position: 'relative', minWidth: 0, borderRadius: 9, outline: '2px dashed transparent', outlineOffset: 8, '&:hover': { outlineColor: 'rgba(224,178,58,.7)' }, '&:hover .barra-secao': { opacity: 1 } }}>
      <Stack data-editor-ui className="barra-secao" direction="row" spacing={1} sx={{ position: 'absolute', top: -20, right: 8, zIndex: 20, alignItems: 'center', opacity: { xs: 1, lg: 0 }, transition: 'opacity .2s' }}>
        <Box sx={{ height: 32, px: 1.5, display: 'grid', placeItems: 'center', borderRadius: 99, bgcolor: AMARELO, color: 'marca.marrom-950', fontSize: 12, fontWeight: 700, boxShadow: 1 }}>{rotulo}</Box>
        <Button size="small" variant="contained" color={oculta ? 'success' : 'primary'} startIcon={oculta ? <VisibilityOutlined /> : <VisibilityOffOutlined />} onClick={() => e.alternarSecao(secao)} sx={{ borderRadius: 99, height: 32 }}>
          {oculta ? 'Mostrar seção' : 'Ocultar seção'}
        </Button>
      </Stack>
      {oculta && <Box sx={{ position: 'absolute', inset: 0, zIndex: 10, display: 'grid', placeItems: 'center', borderRadius: 8, bgcolor: 'rgba(255,253,249,.7)', pointerEvents: 'none' }}><Box sx={{ px: 2, py: 1, borderRadius: 99, bgcolor: 'marca.marrom-950', color: 'marca.creme', fontSize: 14, fontWeight: 600 }}>Seção oculta no site</Box></Box>}
      <Box sx={{ opacity: oculta ? 0.4 : 1 }}>{children}</Box>
    </Box>
  );
}

/** Reduz a foto no navegador (até 2000 px, JPEG) para caber no limite de envio. */
export async function reduzirFoto(arquivo: File): Promise<Blob> {
  const bitmap = await createImageBitmap(arquivo).catch(() => null);
  if (!bitmap) return arquivo;
  const escala = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  if (escala === 1 && arquivo.size < 1.5 * 1024 * 1024) return arquivo;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise(r => canvas.toBlob(b => r(b ?? arquivo), 'image/jpeg', 0.88));
}
