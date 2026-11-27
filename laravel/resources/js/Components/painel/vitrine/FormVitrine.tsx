import { useForm } from '@inertiajs/react';
import { Box, Button, MenuItem, TextField } from '@mui/material';
import { paraCampoDataHora } from '@/lib/datas';
import { TIPOS_VITRINE, type TipoVitrine } from '@/lib/vitrines';

export type DadosVitrine = { id: string; tipo: string; titulo: string; descricao: string | null; urlInstagram: string | null; legenda: string | null; inicioPrevisto: string | null; ofertaAte: string | null; responsavelId: string };
type Campos = { tipo: string; titulo: string; descricao: string; urlInstagram: string; legenda: string; inicioPrevisto: string; ofertaAte: string; responsavelId: string };

/** Dados da vitrine (porta de components/painel/form-vitrine.tsx). O tipo só muda antes de criar: define o que a página mostra. */
export function FormVitrine({ vitrine, vendedoras, legendaSugerida }: { vitrine?: DadosVitrine; vendedoras?: { id: string; nome: string }[] | null; legendaSugerida?: string }) {
  const form = useForm<Campos>({
    tipo: vitrine?.tipo ?? 'post', titulo: vitrine?.titulo ?? '', descricao: vitrine?.descricao ?? '', urlInstagram: vitrine?.urlInstagram ?? '',
    legenda: vitrine?.legenda ?? legendaSugerida ?? '', inicioPrevisto: vitrine?.inicioPrevisto ? paraCampoDataHora(vitrine.inicioPrevisto) : '',
    ofertaAte: vitrine?.ofertaAte ? paraCampoDataHora(vitrine.ofertaAte) : '', responsavelId: vitrine?.responsavelId ?? '',
  });
  const d = form.data;
  const e = form.errors as Record<string, string>;
  const set = (k: keyof Campos) => (x: React.ChangeEvent<HTMLInputElement>) => form.setData(k, x.target.value);
  const enviar = (ev: React.FormEvent) => { ev.preventDefault(); vitrine ? form.put(`/painel/vitrines/${vitrine.id}`, { preserveScroll: true }) : form.post('/painel/vitrines'); };
  const largo = { gridColumn: { sm: 'span 2' } };
  return (
    <Box component="form" onSubmit={enviar} noValidate sx={{ display: 'grid', gridTemplateColumns: { sm: '1fr 1fr' }, gap: 2.5 }}>
      {!vitrine && (
        <TextField select label="Tipo" value={d.tipo} onChange={set('tipo')} error={!!e.tipo} helperText={e.tipo}>
          {(Object.keys(TIPOS_VITRINE) as TipoVitrine[]).map(t => <MenuItem key={t} value={t}>{TIPOS_VITRINE[t]}</MenuItem>)}
        </TextField>
      )}
      <TextField label="Título" value={d.titulo} onChange={set('titulo')} placeholder="Novidades de inverno" error={!!e.titulo} helperText={e.titulo} sx={largo} />
      <TextField label="Descrição (opcional)" value={d.descricao} onChange={set('descricao')} multiline minRows={2} sx={largo} />
      <TextField label="Link no Instagram" type="url" value={d.urlInstagram} onChange={set('urlInstagram')} placeholder="https://www.instagram.com/p/…" error={!!e.urlInstagram}
        helperText={e.urlInstagram ?? 'O link da publicação ou do perfil, onde a live vai acontecer.'} sx={largo} />
      <TextField label="Data e hora da live" type="datetime-local" value={d.inicioPrevisto} onChange={set('inicioPrevisto')} error={!!e.inicioPrevisto} helperText={e.inicioPrevisto ?? 'Só para live.'} slotProps={{ inputLabel: { shrink: true } }} />
      <TextField label="Preço especial até" type="datetime-local" value={d.ofertaAte} onChange={set('ofertaAte')} error={!!e.ofertaAte} helperText={e.ofertaAte ?? 'Em branco: enquanto a vitrine estiver ativa.'} slotProps={{ inputLabel: { shrink: true } }} />
      {vendedoras && (
        <TextField select label="Quem atende os pedidos" value={d.responsavelId} onChange={set('responsavelId')} error={!!e.responsavelId} helperText={e.responsavelId} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
          <MenuItem value="">Escolha…</MenuItem>
          {vendedoras.map(v => <MenuItem key={v.id} value={v.id}>{v.nome}</MenuItem>)}
        </TextField>
      )}
      <TextField label="Legenda para o Instagram" value={d.legenda} onChange={set('legenda')} multiline minRows={4} error={!!e.legenda}
        helperText={e.legenda ?? 'Links em legendas não abrem no Instagram: por isso, a legenda aponta para o link da bio.'} sx={largo} />
      <Box sx={largo}><Button type="submit" variant="contained" disabled={form.processing}>{vitrine ? 'Salvar' : 'Criar vitrine'}</Button></Box>
    </Box>
  );
}
