import { useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, IconButton, LinearProgress, Stack, Typography } from '@mui/material';
import { ChevronLeft, ChevronRight, CloudUpload, DeleteOutlined, PlayArrow, Videocam } from '@mui/icons-material';
import { Foto } from '@/Components/ui/Basicos';
import { enviarCapa, enviarComProgresso, enviarFoto, tamanhoLegivel } from '@/lib/midia';

export type VideoProduto = { url: string; capa: string | null };
const MAX_VIDEOS = 5;

/** Área de escolher (ou soltar) arquivos; desligada, com o motivo, quando não dá para enviar. */
function ZonaEnvio({ rotulo, detalhe, aceita, bloqueio, aoEscolher }: { rotulo: string; detalhe: string; aceita: string; bloqueio: string | null; aoEscolher: (f: File[]) => void }) {
  const [sobre, setSobre] = useState(false);
  return (
    <Box component="label" onDragOver={e => { if (!bloqueio) { e.preventDefault(); setSobre(true); } }} onDragLeave={() => setSobre(false)}
      onDrop={e => { e.preventDefault(); setSobre(false); if (!bloqueio && e.dataTransfer.files.length) aoEscolher([...e.dataTransfer.files]); }}
      sx={{ display: 'flex', gap: 1.5, alignItems: 'center', px: 2, py: 1.5, border: 2, borderStyle: 'dashed', borderRadius: 3, cursor: bloqueio ? 'not-allowed' : 'pointer',
        borderColor: sobre ? 'secondary.main' : 'marca.borda-forte', bgcolor: sobre ? 'marca.bege' : 'background.default' }}>
      <CloudUpload color={bloqueio ? 'disabled' : 'secondary'} />
      <Box><Typography variant="body2" sx={{ fontWeight: 600 }}>{sobre ? 'Solte para enviar' : rotulo}</Typography><Typography variant="caption" color={bloqueio ? 'secondary' : 'text.secondary'}>{bloqueio ?? detalhe}</Typography></Box>
      <input type="file" accept={aceita} multiple hidden disabled={!!bloqueio} onChange={e => { if (e.target.files?.length) aoEscolher([...e.target.files]); e.target.value = ''; }} />
    </Box>
  );
}

const mover = <T,>(lista: T[], i: number, d: number) => { const n = [...lista]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; };

/** Fotos do produto (a primeira é a capa): enviar, reordenar e remover. `restrito` = vendedora, só acrescenta. */
export function FotosProduto({ referencia, valor, mudar, restrito = false, iniciais = [] }: { referencia: string; valor: string[]; mudar: (v: string[]) => void; restrito?: boolean; iniciais?: string[] }) {
  const [estado, setEstado] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<number | null>(null);
  const enviar = async (arquivos: File[]) => {
    let lista = valor;
    for (const [i, a] of arquivos.entries()) {
      setEstado(`Enviando foto ${i + 1} de ${arquivos.length}…`);
      const r = await enviarFoto(referencia, a, setProgresso);
      if (r.status !== 200 || !r.dados.publica) { setProgresso(null); return setEstado(r.dados.erro ?? 'Falha no envio da foto.'); }
      lista = [...lista, r.dados.publica];
      mudar(lista);
    }
    setProgresso(null);
    setEstado('Fotos enviadas. Salve para gravar.');
  };
  return (
    <Stack sx={{ gap: 1.5 }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>Fotos <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>· {valor.length} · a primeira é a capa</Box></Typography>
      {valor.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 1.25 }}>
          {valor.map((url, i) => (
            <Box key={url}>
              <Box sx={{ position: 'relative' }}><Foto src={url} largura={'100%' as never} sx={{ width: '100%' }} />{i === 0 && <Box sx={{ position: 'absolute', left: 4, top: 4, bgcolor: 'primary.main', color: '#fff', fontSize: 10, px: 0.75, borderRadius: 1 }}>Capa</Box>}</Box>
              <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                <IconButton size="small" disabled={i === 0} onClick={() => mudar(mover(valor, i, -1))} aria-label={`Mover foto ${i + 1} para antes`}><ChevronLeft fontSize="small" /></IconButton>
                {(!restrito || !iniciais.includes(url)) && <IconButton size="small" color="error" onClick={() => mudar(valor.filter(x => x !== url))} aria-label={`Remover foto ${i + 1}`}><DeleteOutlined fontSize="small" /></IconButton>}
                <IconButton size="small" disabled={i === valor.length - 1} onClick={() => mudar(mover(valor, i, 1))} aria-label={`Mover foto ${i + 1} para depois`}><ChevronRight fontSize="small" /></IconButton>
              </Stack>
            </Box>
          ))}
        </Box>
      )}
      <ZonaEnvio rotulo="Arraste fotos aqui ou clique para escolher" detalhe="JPG, PNG, WebP ou AVIF · até 8 MB · viram WebP leve" aceita="image/*"
        bloqueio={!referencia ? 'Preencha a referência para liberar o envio.' : progresso != null ? 'Aguarde o envio terminar.' : null} aoEscolher={enviar} />
      {progresso != null && <LinearProgress variant="determinate" value={progresso} />}
      {estado && <Typography variant="caption" color="text.secondary">{estado}</Typography>}
    </Stack>
  );
}

/** D-29: vídeos do produto. O vídeo vai direto para o servidor com progresso; a capa é um quadro tirado no navegador. */
export function VideosProduto({ referencia, valor, mudar, restrito = false, iniciais = [] }: { referencia: string; valor: VideoProduto[]; mudar: (v: VideoProduto[]) => void; restrito?: boolean; iniciais?: VideoProduto[] }) {
  const [estado, setEstado] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<{ etapa: 'capa' | 'video'; pct: number; tamanho: number } | null>(null);
  const [vendo, setVendo] = useState<string | null>(null);
  const [dica, setDica] = useState(false);
  const enviar = async (arquivos: File[]) => {
    const lista = arquivos.slice(0, MAX_VIDEOS - valor.length);
    if (!lista.length) return setEstado(`No máximo ${MAX_VIDEOS} vídeos por produto.`);
    let atual = valor;
    for (const a of lista) {
      if (a.size > 100 * 1024 * 1024) return setEstado(`“${a.name}” tem ${tamanhoLegivel(a.size)}: passa de 100 MB. Encurte ou exporte em resolução menor.`);
      setEnviando({ etapa: 'capa', pct: 0, tamanho: a.size });
      setEstado('Preparando a capa do vídeo…');
      const capa = await enviarCapa(referencia, a);
      setEnviando(e => e && { ...e, etapa: 'video' });
      setEstado('Enviando o vídeo…');
      const r = await enviarComProgresso(`/api/upload/video?referencia=${encodeURIComponent(referencia)}`, a, pct => setEnviando(e => e && { ...e, pct }));
      setEnviando(null);
      if (!(r.status === 200 && r.dados.publica)) return setEstado(r.dados.erro ?? (r.status === 413 ? 'Vídeo grande demais.' : 'Falha no envio do vídeo.'));
      atual = [...atual, { url: r.dados.publica, capa }];
      mudar(atual);
    }
    setEstado('Vídeos enviados. Salve para gravar.');
  };
  return (
    <Stack sx={{ gap: 1.5 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="body2" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.75 }}><Videocam fontSize="small" color="secondary" />Vídeos <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>· {valor.length} de {MAX_VIDEOS}</Box></Typography>
        <Button size="small" onClick={() => setDica(d => !d)}>Gravando no iPhone?</Button>
      </Stack>
      {dica && <Alert severity="info">Em <strong>Ajustes → Câmera → Formatos</strong>, escolha <strong>Mais Compatível</strong>. O padrão (HEVC) é recusado, porque não toca em Android nem no Windows. Grave curto (até 30 s) e na vertical.</Alert>}
      {valor.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 1.25 }}>
          {valor.map((v, i) => (
            <Box key={v.url}>
              <Box component="button" type="button" onClick={() => setVendo(v.url)} aria-label={`Assistir ao vídeo ${i + 1}`} sx={{ position: 'relative', width: '100%', p: 0, border: 0, cursor: 'pointer', bgcolor: 'transparent' }}>
                {v.capa ? <Foto src={v.capa} largura={'100%' as never} sx={{ width: '100%' }} /> : <Box component="video" src={`${v.url}#t=0.5`} muted playsInline preload="metadata" sx={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', borderRadius: 1.5, bgcolor: 'primary.main' }} />}
                <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}><Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: 'background.paper', display: 'grid', placeItems: 'center' }}><PlayArrow fontSize="small" /></Box></Box>
              </Box>
              <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                <IconButton size="small" disabled={i === 0} onClick={() => mudar(mover(valor, i, -1))} aria-label={`Mover vídeo ${i + 1} para antes`}><ChevronLeft fontSize="small" /></IconButton>
                {(!restrito || !iniciais.some(x => x.url === v.url)) && <IconButton size="small" color="error" onClick={() => mudar(valor.filter(x => x.url !== v.url))} aria-label={`Remover vídeo ${i + 1}`}><DeleteOutlined fontSize="small" /></IconButton>}
                <IconButton size="small" disabled={i === valor.length - 1} onClick={() => mudar(mover(valor, i, 1))} aria-label={`Mover vídeo ${i + 1} para depois`}><ChevronRight fontSize="small" /></IconButton>
              </Stack>
            </Box>
          ))}
        </Box>
      )}
      {enviando && <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}><CircularProgress size={20} variant={enviando.etapa === 'capa' ? 'indeterminate' : 'determinate'} value={enviando.pct} /><Typography variant="caption">{enviando.etapa === 'capa' ? 'Gerando capa…' : `${enviando.pct}% de ${tamanhoLegivel(enviando.tamanho)}`}</Typography></Stack>}
      <ZonaEnvio rotulo="Arraste vídeos aqui ou clique para escolher" detalhe="MP4, MOV ou WebM · até 100 MB · curto e na vertical" aceita="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
        bloqueio={!referencia ? 'Preencha a referência para liberar o envio.' : enviando ? 'Aguarde o envio terminar.' : valor.length >= MAX_VIDEOS ? 'Remova um vídeo para enviar outro.' : null} aoEscolher={enviar} />
      {estado && <Typography variant="caption" color="text.secondary">{estado}</Typography>}
      <Dialog open={!!vendo} onClose={() => setVendo(null)} maxWidth="sm">{vendo && <Box component="video" src={vendo} controls autoPlay playsInline sx={{ display: 'block', maxWidth: '100%', maxHeight: '85dvh' }} />}</Dialog>
    </Stack>
  );
}
