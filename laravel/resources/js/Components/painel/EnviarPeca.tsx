import { useState } from 'react';
import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material';
import { Dialogo } from '@/Components/ui/Dialogo';
import { Foto } from '@/Components/ui/Basicos';
import { LinkSimples } from '@/Components/loja/LinkSimples';
import { linkDirect } from '@/lib/atendimento';
import { getJson, postJson } from '@/lib/http';
import { linkWhatsApp } from '@/lib/whatsapp';

type Envio = { ok: true; referencia: string; produtoId: number; nome: string; preco: number; link: string; texto: string; fotos: string[]; videos: string[]; semEstoque: boolean };

/** Compartilha o arquivo pelo celular (o WhatsApp recebe foto ou vídeo de verdade); sem suporte, baixa. */
async function compartilharArquivo(url: string, nome: string): Promise<'ok' | 'baixar'> {
  try {
    const r = await fetch(url);
    if (!r.ok) return 'baixar';
    const b = await r.blob();
    const arquivo = new File([b], `${nome}.${url.split('.').pop()?.split('?')[0] ?? 'jpg'}`, { type: b.type });
    if (!navigator.canShare?.({ files: [arquivo] })) return 'baixar';
    await navigator.share({ files: [arquivo] });
    return 'ok';
  } catch (e) {
    // A pessoa fechou o compartilhar: não é erro. Arquivo de outro site (sem permissão de leitura): baixa.
    return e instanceof DOMException && e.name === 'AbortError' ? 'ok' : 'baixar';
  }
}

/** "Enviar peça" (porta de components/painel/enviar-peca.tsx): link assinado por quem envia, texto pronto, fotos e vídeos. */
export function EnviarPeca({ referencia, nome, telefone, instagram, atendimentoId }: { referencia: string; nome: string; telefone?: string | null; instagram?: string | null; atendimentoId?: string }) {
  const [aberto, setAberto] = useState(false);
  const [envio, setEnvio] = useState<Envio | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const ref = encodeURIComponent(referencia);

  const abrir = async () => {
    setAberto(true);
    setErro(null);
    setAviso(null);
    setCarregando(true);
    const r = await getJson<Envio | { ok: false; erro: string }>(`/painel/pecas/${ref}/envio`).catch(() => ({ ok: false as const, erro: 'Sem conexão. Tente de novo.' }));
    setCarregando(false);
    if (r.ok) setEnvio(r);
    else setErro(r.erro);
  };
  const contou = () => { postJson(`/painel/pecas/${ref}/enviada`, { atendimentoId }).catch(() => {}); };
  const copiar = async (texto: string, msg: string) => {
    try { await navigator.clipboard.writeText(texto); setAviso(msg); contou(); } catch { setAviso('O navegador não deixou copiar. Selecione o texto e copie.'); }
  };
  const compartilhar = async (url: string) => {
    const r = await compartilharArquivo(url, referencia);
    if (r === 'baixar') setAviso('Este aparelho não compartilha arquivos daqui: use Baixar e envie pela conversa.');
    else contou();
  };
  const midia = (src: string, video: boolean, i: number) => (
    <Box component="li" key={src} sx={{ display: 'grid', gap: 0.5, fontSize: 12, textAlign: 'center' }}>
      {video ? <Box component="video" src={`${src}#t=0.5`} muted playsInline preload="metadata" aria-label={`Vídeo ${i + 1}`} sx={{ aspectRatio: '3 / 4', width: '100%', objectFit: 'cover', bgcolor: 'marca.bege' }} />
        : <Foto src={src} alt={`Foto ${i + 1}`} sx={{ width: '100%' }} />}
      <Box component="button" type="button" onClick={() => compartilhar(src)} sx={{ border: 0, bgcolor: 'transparent', textDecoration: 'underline', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>Compartilhar</Box>
      <Box component="a" href={src} download target="_blank" rel="noopener" onClick={contou} sx={{ color: 'text.secondary' }}>Baixar</Box>
    </Box>
  );

  return (
    <>
      <Button variant="outlined" size="small" onClick={abrir} aria-label={`Enviar ${nome}`} sx={{ flexShrink: 0 }}>Enviar</Button>
      <Dialogo titulo={`Enviar ${nome}`} aberto={aberto} fechar={() => setAberto(false)}>
        <Stack spacing={2}>
          {erro && <Alert severity="error">{erro}</Alert>}
          {carregando && <Typography variant="body2" color="text.secondary">Preparando…</Typography>}
          {envio && !carregando && (
            <>
              {envio.semEstoque && <Alert severity="warning">Esta peça está sem estoque agora.</Alert>}
              <TextField label="Texto pronto" value={envio.texto} multiline minRows={5} slotProps={{ htmlInput: { readOnly: true, 'aria-label': 'Texto da peça' } }} />
              <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
                {telefone && <Button component="a" href={linkWhatsApp(telefone, envio.texto)} target="_blank" rel="noopener" data-acao="nenhuma" onClick={contou} variant="contained" color="whatsapp" size="small">Enviar no WhatsApp</Button>}
                <Button variant="outlined" size="small" onClick={() => copiar(envio.texto, 'Texto copiado: cole na conversa.')}>Copiar texto</Button>
                <Button variant="outlined" size="small" onClick={() => copiar(envio.link, 'Link copiado: cole na conversa.')}>Copiar link</Button>
                {instagram && <Button component="a" href={linkDirect(instagram)} target="_blank" rel="noopener" variant="outlined" size="small">Abrir o Direct</Button>}
              </Stack>
              {aviso && <Typography role="status" variant="body2" sx={{ color: 'marca.oliva' }}>{aviso}</Typography>}
              {envio.fotos.length + envio.videos.length > 0 ? (
                <Box sx={{ display: 'grid', gap: 1 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'text.secondary' }}>Fotos e vídeos</Typography>
                  <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, maxHeight: 288, overflowY: 'auto' }}>
                    {envio.fotos.slice(0, 9).map((f, i) => midia(f, false, i))}
                    {envio.videos.map((v, i) => midia(v, true, i))}
                  </Box>
                </Box>
              ) : <Typography variant="body2" color="text.secondary">Esta peça ainda não tem foto nem vídeo.</Typography>}
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', borderTop: 1, borderColor: 'divider', pt: 1.5 }}>
                <LinkSimples href={`/painel/produtos/${envio.produtoId}/midia`} sx={{ fontSize: 14, textDecoration: 'underline' }}>Adicionar foto ou vídeo</LinkSimples>
                <Button size="small" onClick={() => setAberto(false)}>Fechar</Button>
              </Stack>
            </>
          )}
        </Stack>
      </Dialogo>
    </>
  );
}

/** Na ficha da cliente: busca a peça e envia. */
export function BuscarEEnviarPeca({ telefone, instagram }: { telefone: string; instagram: string | null }) {
  const [termo, setTermo] = useState('');
  const [achadas, setAchadas] = useState<{ id: number; referencia: string; nome: string }[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const buscar = async (e: React.FormEvent) => {
    e.preventDefault();
    setBuscando(true);
    setAchadas(await getJson<{ id: number; referencia: string; nome: string }[]>(`/painel/pecas/busca?q=${encodeURIComponent(termo)}`).catch(() => []));
    setBuscando(false);
  };
  return (
    <Stack spacing={1.5}>
      <Stack component="form" direction="row" spacing={1} onSubmit={buscar}>
        <TextField size="small" value={termo} onChange={e => setTermo(e.target.value)} placeholder="Nome ou referência da peça" slotProps={{ htmlInput: { 'aria-label': 'Buscar peça para enviar' } }} sx={{ flex: 1 }} />
        <Button type="submit" variant="outlined" disabled={buscando}>Buscar</Button>
      </Stack>
      {achadas && (achadas.length === 0 ? <Typography variant="body2" color="text.secondary">Nenhuma peça com estoque encontrada.</Typography> : (
        <Stack component="ul" spacing={1} sx={{ m: 0, p: 0, listStyle: 'none', maxHeight: 288, overflowY: 'auto' }}>
          {achadas.map(p => (
            <Stack component="li" key={p.id} direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, fontSize: 14 }}>
              <Box sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</Box>
              <EnviarPeca referencia={p.referencia} nome={p.nome} telefone={telefone} instagram={instagram} />
            </Stack>
          ))}
        </Stack>
      ))}
    </Stack>
  );
}
