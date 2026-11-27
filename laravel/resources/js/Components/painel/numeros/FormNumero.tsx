import { useForm } from '@inertiajs/react';
import { Box, Button, Stack, TextField } from '@mui/material';
import { formatarTelefone } from '@/lib/telefone';

/** Cadastro e edição de um número da loja (D-31). */
export function FormNumero({ numero, aoConcluir }: { numero?: { id: number; telefone: string; apelido: string; observacao: string | null }; aoConcluir?: () => void }) {
  const form = useForm({ telefone: numero ? formatarTelefone(numero.telefone) : '', apelido: numero?.apelido ?? '', observacao: numero?.observacao ?? '' });
  const e = form.errors as Record<string, string>;
  const enviar = (ev: React.FormEvent) => {
    ev.preventDefault();
    const op = { preserveScroll: true, onSuccess: () => aoConcluir?.() };
    if (numero) form.put(`/painel/numeros/${numero.id}`, op); else form.post('/painel/numeros', op);
  };
  return (
    <Stack component="form" spacing={2} noValidate onSubmit={enviar}>
      <TextField label="WhatsApp" type="tel" placeholder="(49) 99999-9999" value={form.data.telefone} onChange={x => form.setData('telefone', formatarTelefone(x.target.value))} error={!!e.telefone} helperText={e.telefone} />
      <TextField label="Nome do número" placeholder="Loja Centro" value={form.data.apelido} onChange={x => form.setData('apelido', x.target.value)} error={!!e.apelido} helperText={e.apelido ?? 'Como a equipe reconhece este número.'} />
      <TextField label="Observação (opcional)" multiline minRows={2} placeholder="Chip na gaveta do caixa, celular da loja…" value={form.data.observacao} onChange={x => form.setData('observacao', x.target.value)} error={!!e.observacao} helperText={e.observacao} />
      {e.erro && <Box sx={{ color: 'error.main', fontSize: 14 }}>{e.erro}</Box>}
      <Box><Button type="submit" variant="contained" loading={form.processing}>{numero ? 'Salvar' : 'Cadastrar número'}</Button></Box>
    </Stack>
  );
}
