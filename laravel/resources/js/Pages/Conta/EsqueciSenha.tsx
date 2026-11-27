import { Head, useForm, usePage } from '@inertiajs/react';
import { Alert, Box, Button, Link, Stack, TextField, Typography } from '@mui/material';
import ContaLayout from '@/Layouts/ContaLayout';

/** B-03: pede o link de senha nova (porta de src/app/(conta)/esqueci-senha/page.tsx). */
export default function EsqueciSenha() {
  const { flash } = usePage().props;
  const form = useForm({ email: '' });
  return (
    <ContaLayout>
      <Head title="Esqueci a senha" />
      <Typography variant="h5" component="h1" gutterBottom>Esqueci a senha</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>Digite o e-mail da sua conta. Enviamos um link para você criar uma senha nova.</Typography>
      {flash.sucesso ? <Alert severity="success">{flash.sucesso}</Alert> : (
        <Box component="form" noValidate onSubmit={e => { e.preventDefault(); form.post('/esqueci-senha'); }}>
          <Stack spacing={2.5}>
            <TextField label="E-mail" type="email" autoComplete="email" value={form.data.email} onChange={e => form.setData('email', e.target.value)} error={!!form.errors.email} helperText={form.errors.email} />
            <Button type="submit" variant="contained" size="large" fullWidth loading={form.processing}>{form.processing ? 'Enviando…' : 'Enviar link'}</Button>
          </Stack>
        </Box>
      )}
      <Typography align="center" sx={{ mt: 3 }}><Link href="/entrar" variant="body2">Voltar para entrar</Link></Typography>
    </ContaLayout>
  );
}
