import { Head, useForm, usePage } from '@inertiajs/react';
import { Alert, Box, Button, Link, Stack, TextField, Typography } from '@mui/material';
import ContaLayout from '@/Layouts/ContaLayout';

type Props = { volta: string | null; redefinida: boolean; whatsappLoja: string };

/** Porta de src/app/(conta)/entrar/page.tsx. */
export default function Entrar({ volta, redefinida, whatsappLoja }: Props) {
  const { flash } = usePage().props;
  const form = useForm({ email: '', senha: '', volta: volta ?? '' });
  const ajuda = `https://wa.me/55${whatsappLoja}?text=${encodeURIComponent('Oi! Preciso de ajuda para entrar na loja.')}`;
  return (
    <ContaLayout>
      <Head title="Entrar" />
      <Typography variant="h5" component="h1" gutterBottom>Entrar</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>Entre para ver os preços, montar a sua sacola e pedir pelo WhatsApp.</Typography>
      {redefinida && <Alert severity="success" sx={{ mb: 2 }}>Senha nova salva. Entre com ela.</Alert>}
      {flash.erro && <Alert severity="error" sx={{ mb: 2 }}>{flash.erro}</Alert>}
      <Box component="form" noValidate onSubmit={e => { e.preventDefault(); form.post('/entrar', { onFinish: () => form.reset('senha') }); }}>
        <Stack spacing={2.5}>
          <TextField label="E-mail" type="email" name="email" autoComplete="email" placeholder="voce@email.com" value={form.data.email}
            onChange={e => form.setData('email', e.target.value)} error={!!form.errors.email} helperText={form.errors.email} />
          <TextField label="Senha" type="password" name="senha" autoComplete="current-password" value={form.data.senha}
            onChange={e => form.setData('senha', e.target.value)} error={!!form.errors.senha} helperText={form.errors.senha} />
          <Button type="submit" variant="contained" size="large" fullWidth loading={form.processing} loadingPosition="start">
            {form.processing ? 'Entrando…' : 'Entrar'}
          </Button>
        </Stack>
      </Box>
      <Typography align="center" sx={{ mt: 2 }}>
        <Link href="/esqueci-senha" variant="body2" color="text.secondary">Esqueci a senha</Link>
      </Typography>
      <Box sx={{ mt: 3, p: 2, borderRadius: 3, bgcolor: 'background.default', border: 1, borderColor: 'divider', textAlign: 'center' }}>
        <Typography sx={{ fontWeight: 600 }}>Ainda não tem conta?</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ my: 1 }}>Leva um minuto e é grátis: você vê os preços de quem é de casa e pede direto pelo WhatsApp.</Typography>
        <Button href={volta ? `/cadastro?volta=${encodeURIComponent(volta)}` : '/cadastro'} variant="outlined" sx={{ borderRadius: 99 }}>Criar minha conta</Button>
      </Box>
      <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 3 }}>
        Precisa de ajuda? <Link href={ajuda} target="_blank" rel="noopener">Fale com a loja no WhatsApp</Link>
      </Typography>
    </ContaLayout>
  );
}
