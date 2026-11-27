import { Head, useForm } from '@inertiajs/react';
import { Alert, Box, Button, Link, Stack, TextField, Typography } from '@mui/material';
import ContaLayout from '@/Layouts/ContaLayout';

/** B-03: senha nova pelo link do e-mail (porta de src/app/(conta)/redefinir-senha/page.tsx). */
export default function RedefinirSenha({ token }: { token: string }) {
  const form = useForm({ token, senha: '', confirmacao: '' });
  const erros = form.errors as Record<string, string>;
  return (
    <ContaLayout>
      <Head title="Nova senha" />
      {!token ? (
        <>
          <Typography variant="h5" component="h1" gutterBottom>Link incompleto</Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>Abra o link exatamente como chegou no e-mail, ou peça um novo.</Typography>
          <Link href="/esqueci-senha" sx={{ fontWeight: 600 }}>Pedir novo link</Link>
        </>
      ) : (
        <>
          <Typography variant="h5" component="h1" gutterBottom>Criar senha nova</Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>Depois de salvar, todas as sessões abertas da sua conta são encerradas.</Typography>
          {erros.erro && <Alert severity="error" sx={{ mb: 2 }}>{erros.erro} <Link href="/esqueci-senha">Pedir novo link</Link></Alert>}
          <Box component="form" noValidate onSubmit={e => { e.preventDefault(); form.post('/redefinir-senha', { onFinish: () => form.reset('senha', 'confirmacao') }); }}>
            <Stack spacing={2.5}>
              <TextField label="Senha nova" type="password" autoComplete="new-password" value={form.data.senha} onChange={e => form.setData('senha', e.target.value)} error={!!erros.senha} helperText={erros.senha ?? 'Pelo menos 8 caracteres.'} />
              <TextField label="Repita a senha nova" type="password" autoComplete="new-password" value={form.data.confirmacao} onChange={e => form.setData('confirmacao', e.target.value)} error={!!erros.confirmacao} helperText={erros.confirmacao} />
              <Button type="submit" variant="contained" size="large" fullWidth loading={form.processing}>{form.processing ? 'Salvando…' : 'Salvar senha'}</Button>
            </Stack>
          </Box>
        </>
      )}
    </ContaLayout>
  );
}
