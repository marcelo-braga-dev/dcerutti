import { Head, router, usePage } from '@inertiajs/react';
import { Box, Button, Card, MenuItem, Stack, TextField, Typography } from '@mui/material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina, Etiqueta, Vazio } from '@/Components/ui/Basicos';
import { LinkSimples } from '@/Components/loja/LinkSimples';
import type { LinhaAtendimento } from './Index';
import { CANAIS, ETAPAS, MOTIVOS_PERDA, type Canal, type Etapa } from '@/lib/atendimento';
import { formatarData } from '@/lib/datas';

type F = { vitrine: string | null; etapa: string | null; canal: string | null; vendedor: string | null; q: string; pagina: number };
type Props = { filtros: F; total: number; lista: LinhaAtendimento[]; contagem: Record<string, number>; vendedores: { id: string; name: string }[]; vitrines: { id: string; titulo: string }[] };

/** Todos os atendimentos, com filtros por etapa, canal e quem atende (porta de painel/atendimento/lista). */
export default function Lista({ filtros: f, total, lista, contagem, vendedores }: Props) {
  const gestor = usePage().props.usuario?.papel === 'gestor';
  const url = (m: Partial<Record<keyof F, string | null>>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ vitrine: f.vitrine, etapa: f.etapa, canal: f.canal, vendedor: f.vendedor, q: f.q, ...m })) if (v) p.set(k, String(v));
    const t = p.toString();
    return `/painel/atendimento/lista${t ? `?${t}` : ''}`;
  };
  const totalGeral = Object.values(contagem).reduce((a, b) => a + Number(b), 0);
  return (
    <PainelLayout>
      <Head title="Atendimentos" />
      <CabecalhoPagina sobre="Atendimento" titulo="Atendimentos" acoes={<><Button variant="outlined" href="/painel/atendimento">Hoje</Button><Button variant="contained" href="/painel/atendimento/novo">+ Novo atendimento</Button></>} />
      <Stack direction="row" useFlexGap role="group" aria-label="Filtrar por etapa" sx={{ flexWrap: 'wrap', gap: 1, mb: 2 }}>
        <Button size="small" variant={f.etapa ? 'outlined' : 'contained'} href={url({ etapa: null, pagina: null })}>Todos ({totalGeral})</Button>
        {(Object.keys(ETAPAS) as Etapa[]).map(e => <Button key={e} size="small" variant={f.etapa === e ? 'contained' : 'outlined'} href={url({ etapa: e, pagina: null })}>{ETAPAS[e]} ({contagem[e] ?? 0})</Button>)}
      </Stack>
      <Stack component="form" direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1, mb: 3 }} onSubmit={(e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); const d = new FormData(e.currentTarget); router.visit(url({ q: String(d.get('q') || '') || null, canal: String(d.get('canal') || '') || null, vendedor: String(d.get('vendedor') || '') || null, pagina: null })); }}>
        <TextField name="q" size="small" defaultValue={f.q} placeholder="Nome, WhatsApp, @ ou código" slotProps={{ htmlInput: { 'aria-label': 'Buscar' } }} sx={{ flex: 1, minWidth: 200 }} />
        <TextField select name="canal" size="small" defaultValue={f.canal ?? ''} slotProps={{ select: { displayEmpty: true }, htmlInput: { 'aria-label': 'Canal' } }} sx={{ minWidth: 170 }}>
          <MenuItem value="">Todos os canais</MenuItem>{(Object.keys(CANAIS) as Canal[]).map(c => <MenuItem key={c} value={c}>{CANAIS[c]}</MenuItem>)}
        </TextField>
        {gestor && (
          <TextField select name="vendedor" size="small" defaultValue={f.vendedor ?? ''} slotProps={{ select: { displayEmpty: true }, htmlInput: { 'aria-label': 'Quem atende' } }} sx={{ minWidth: 170 }}>
            <MenuItem value="">Toda a equipe</MenuItem><MenuItem value="nenhum">Sem responsável</MenuItem>{vendedores.map(v => <MenuItem key={v.id} value={v.id}>{v.name}</MenuItem>)}
          </TextField>
        )}
        <Button type="submit" variant="outlined">Filtrar</Button>
      </Stack>
      {!lista.length ? <Vazio>Nenhum atendimento encontrado.</Vazio> : (
        <Stack spacing={1.5}>
          {lista.map(a => (
            <Card key={a.id} variant="outlined" sx={{ p: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, opacity: a.fechadoEm ? 0.7 : 1 }}>
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><LinkSimples href={`/painel/atendimento/${a.id}`} sx={{ fontWeight: 600 }}>{a.nome}</LinkSimples><Etiqueta cor="caramelo">{ETAPAS[a.etapa]}</Etiqueta><Etiqueta>{CANAIS[a.canal]}</Etiqueta></Stack>
                <Typography variant="body2" color="text.secondary">{a.codigo}{a.instagram ? ` · @${a.instagram}` : ''}{gestor ? ` · ${a.responsavel ?? 'Sem responsável'}` : ''}{a.proximoContatoEm ? ` · retorno em ${formatarData(a.proximoContatoEm)}` : ''}{a.motivoPerda ? ` · ${MOTIVOS_PERDA[a.motivoPerda] ?? a.motivoPerda}` : ''}</Typography>
              </Box>
              <Button size="small" variant="outlined" href={`/painel/atendimento/${a.id}`}>Abrir</Button>
            </Card>
          ))}
        </Stack>
      )}
      {lista.length < total && <Box sx={{ mt: 2, textAlign: 'center' }}><Button variant="outlined" href={url({ pagina: String(f.pagina + 1) })} {...{ preserveScroll: true }}>Carregar mais</Button></Box>}
    </PainelLayout>
  );
}
