import { Head, router, useForm, usePage } from '@inertiajs/react';
import { Alert, Box, Button, Card, Checkbox, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina, Etiqueta, Vazio } from '@/Components/ui/Basicos';
import { VARIAVEIS_RESPOSTA } from '@/lib/atendimento';

type Resposta = { id: number; titulo: string; texto: string; usuarioId: string | null };

function FormResposta({ r, gestor }: { r?: Resposta; gestor: boolean }) {
  const form = useForm({ id: r?.id ?? null, titulo: r?.titulo ?? '', texto: r?.texto ?? '', daLoja: !r && gestor });
  const e = form.errors as Record<string, string>;
  return (
    <Stack component="form" spacing={1.5} sx={{ mt: r ? 1 : 0 }} onSubmit={(ev: React.FormEvent) => { ev.preventDefault(); form.post('/painel/atendimento/respostas', { preserveScroll: true, onSuccess: () => { if (!r) form.reset(); } }); }}>
      <TextField size="small" label="Título" value={form.data.titulo} onChange={x => form.setData('titulo', x.target.value)} placeholder="Boas-vindas" error={!!e.titulo} helperText={e.titulo} />
      <TextField label="Texto" multiline minRows={r ? 3 : 4} value={form.data.texto} onChange={x => form.setData('texto', x.target.value)} placeholder="Oi, {nome}! Aqui é {vendedora}…" error={!!e.texto} helperText={e.texto} />
      {!r && gestor && <FormControlLabel control={<Checkbox checked={form.data.daLoja} onChange={x => form.setData('daLoja', x.target.checked)} />} label="Disponível para toda a equipe" />}
      {e.erro && <Alert severity="error">{e.erro}</Alert>}
      <Stack direction="row" spacing={1}>
        <Button type="submit" variant={r ? 'outlined' : 'contained'} loading={form.processing}>{r ? 'Salvar' : 'Criar resposta'}</Button>
        {r && <Button color="error" onClick={() => { if (confirm(`Apagar a resposta "${r.titulo}"?`)) router.delete(`/painel/atendimento/respostas/${r.id}`, { preserveScroll: true }); }}>Apagar</Button>}
      </Stack>
    </Stack>
  );
}

/** Modelos para falar com as clientes: os da loja (gestor) e os pessoais (porta de painel/atendimento/respostas). */
export default function Respostas({ respostas }: { respostas: Resposta[] }) {
  const { usuario } = usePage().props;
  const gestor = usuario?.papel === 'gestor';
  return (
    <PainelLayout>
      <Head title="Respostas prontas" />
      <CabecalhoPagina sobre="Atendimento" titulo="Respostas prontas">Modelos para falar com as clientes. Variáveis: {VARIAVEIS_RESPOSTA.map(v => `{${v}}`).join(', ')}. A mensagem sempre pode ser ajustada antes de enviar.</CabecalhoPagina>
      <Box sx={{ display: 'grid', gridTemplateColumns: { lg: '1fr 22rem' }, gap: 3, alignItems: 'start' }}>
        <Stack spacing={1.5} sx={{ minWidth: 0 }}>
          {!respostas.length && <Vazio>Nenhuma resposta ainda.</Vazio>}
          {respostas.map(r => {
            const pode = r.usuarioId ? r.usuarioId === usuario?.id : gestor;
            return (
              <Card key={r.id} variant="outlined" sx={{ p: 2 }}>
                <Etiqueta cor={r.usuarioId ? 'contorno' : 'caramelo'}>{r.usuarioId ? 'Minha' : 'Da loja'}</Etiqueta>
                {pode ? <FormResposta r={r} gestor={gestor} /> : <><Typography sx={{ fontWeight: 600, mt: 1 }}>{r.titulo}</Typography><Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>{r.texto}</Typography></>}
              </Card>
            );
          })}
        </Stack>
        <Card variant="outlined" sx={{ p: 2.5 }}><Typography variant="h6" sx={{ mb: 1.5 }}>Nova resposta</Typography><FormResposta gestor={gestor} /></Card>
      </Box>
    </PainelLayout>
  );
}
