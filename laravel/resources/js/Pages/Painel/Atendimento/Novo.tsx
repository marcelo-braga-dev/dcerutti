import { Head, useForm, usePage } from '@inertiajs/react';
import { Alert, Box, Button, Card, MenuItem, TextField } from '@mui/material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina } from '@/Components/ui/Basicos';
import { CANAIS, CANAIS_MANUAIS } from '@/lib/atendimento';
import { formatarTelefone } from '@/lib/telefone';

/** Novo rápido (docs/26): nome e um contato. Se o contato já tem dona, o atendimento vai para ela. */
export default function NovoAtendimento({ vendedores, telefone, nome }: { vendedores: { id: string; name: string }[] | null; telefone: string; nome: string }) {
  const { flash } = usePage().props;
  const form = useForm({ nome, telefone: telefone ? formatarTelefone(telefone) : '', instagram: '', canal: 'whatsapp', responsavelId: '', nota: '' });
  const e = form.errors as Record<string, string>;
  return (
    <PainelLayout>
      <Head title="Novo atendimento" />
      <Button href="/painel/atendimento" size="small" sx={{ mb: 2 }}>← Hoje</Button>
      <CabecalhoPagina sobre="Atendimento" titulo="Novo atendimento">Basta o nome e o WhatsApp ou o @ do Instagram.</CabecalhoPagina>
      {flash.sucesso && <Alert severity="info" sx={{ mb: 2, maxWidth: 680 }}>{flash.sucesso}</Alert>}
      {e.erro && <Alert severity="error" sx={{ mb: 2, maxWidth: 680 }}>{e.erro}</Alert>}
      <Card variant="outlined" component="form" noValidate onSubmit={(ev: React.FormEvent) => { ev.preventDefault(); form.post('/painel/atendimento', { onSuccess: () => form.reset() }); }} sx={{ p: { xs: 2.5, sm: 4 }, maxWidth: 680, display: 'grid', gridTemplateColumns: { sm: '1fr 1fr' }, gap: 2.5 }}>
        <TextField label="Nome" value={form.data.nome} onChange={x => form.setData('nome', x.target.value)} error={!!e.nome} helperText={e.nome} sx={{ gridColumn: { sm: 'span 2' } }} />
        <TextField label="WhatsApp" type="tel" placeholder="(49) 99999-9999" value={form.data.telefone} onChange={x => form.setData('telefone', formatarTelefone(x.target.value))} error={!!e.telefone} helperText={e.telefone} />
        <TextField label="Instagram" placeholder="@usuario" value={form.data.instagram} onChange={x => form.setData('instagram', x.target.value)} error={!!e.instagram} helperText={e.instagram} />
        <TextField select label="Por onde chegou" value={form.data.canal} onChange={x => form.setData('canal', x.target.value)}>{CANAIS_MANUAIS.map(c => <MenuItem key={c} value={c}>{CANAIS[c]}</MenuItem>)}</TextField>
        {vendedores && (
          <TextField select label="Quem atende" value={form.data.responsavelId} onChange={x => form.setData('responsavelId', x.target.value)} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }} helperText="Se o contato já tem ficha, vai para a vendedora da ficha.">
            <MenuItem value="">Vendedor padrão da loja</MenuItem>{vendedores.map(v => <MenuItem key={v.id} value={v.id}>{v.name}</MenuItem>)}
          </TextField>
        )}
        <TextField label="Nota (opcional)" multiline minRows={2} placeholder="O que ela procura, tamanho, ocasião…" value={form.data.nota} onChange={x => form.setData('nota', x.target.value)} helperText="Não registre dados sensíveis, como saúde ou documentos." sx={{ gridColumn: { sm: 'span 2' } }} />
        <Box sx={{ gridColumn: { sm: 'span 2' } }}><Button type="submit" variant="contained" loading={form.processing}>Registrar</Button></Box>
      </Card>
    </PainelLayout>
  );
}
