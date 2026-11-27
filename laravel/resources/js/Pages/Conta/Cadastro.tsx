import { Head, useForm, usePage } from '@inertiajs/react';
import { Alert, Box, Button, Checkbox, FormControlLabel, FormHelperText, Link, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Check } from '@mui/icons-material';
import ContaLayout from '@/Layouts/ContaLayout';
import { formatarTelefone } from '@/lib/telefone';

type Props = { convite: { id: string; nome: string } | null; vendedores: { id: string; nome: string }[]; volta: string | null };

const mascaraCpf = (v: string) => v.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
const rotulo = { fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'secondary.main' } as const;

/** A cliente cria a conta (porta de src/app/(conta)/cadastro/page.tsx); `?v=` é o convite da vendedora. */
export default function Cadastro({ convite, vendedores, volta }: Props) {
  const { identidade } = usePage().props;
  const form = useForm({ nome: '', telefone: '', email: '', senha: '', endereco: '', cidade: 'Maravilha', cpf: '', vendedorId: convite?.id ?? '', aceitaOfertas: false, aceite: false, volta: volta ?? '' });
  const erros = form.errors as Record<string, string>;
  return (
    <ContaLayout>
      <Head title="Criar conta" />
      {convite ? (
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 3, p: 1.5, bgcolor: 'marca.bege', borderRadius: 3 }}>
          <Box sx={{ width: 40, height: 40, display: 'grid', placeItems: 'center', bgcolor: 'marca.marrom-950', color: 'marca.creme', fontWeight: 800, borderRadius: 2 }}>{convite.nome[0]}</Box>
          <Box><Typography sx={rotulo}>Convite de {convite.nome.split(' ')[0]}</Typography><Typography variant="body2" color="text.secondary">Quem vai te atender: {convite.nome}.</Typography></Box>
        </Stack>
      ) : <Typography sx={{ ...rotulo, mb: 1 }}>Cliente</Typography>}
      <Typography variant="h5" component="h1">Criar conta</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>Leva um minuto e é grátis. Seu pedido vai direto para o WhatsApp de quem te atende.</Typography>
      <Stack spacing={0.75} sx={{ mb: 3 }}>
        {['Preços exclusivos de quem é de casa', 'Prove em casa e pague só o que ficar (em Maravilha)', 'Atendimento de pessoa para pessoa, sem robô'].map(t => (
          <Stack key={t} direction="row" spacing={1} sx={{ alignItems: 'center', fontSize: 14 }}><Check sx={{ fontSize: 16, color: 'success.main' }} /><span>{t}</span></Stack>
        ))}
      </Stack>
      {erros.erro && <Alert severity="error" sx={{ mb: 2 }}>{erros.erro}</Alert>}
      <Box component="form" noValidate onSubmit={e => { e.preventDefault(); form.post('/cadastro', { onFinish: () => form.reset('senha') }); }}>
        <Stack spacing={2.5}>
          <Typography sx={rotulo}>Seus dados</Typography>
          <TextField label="Nome completo" autoComplete="name" value={form.data.nome} onChange={e => form.setData('nome', e.target.value)} error={!!erros.nome} helperText={erros.nome} />
          <TextField label="WhatsApp" type="tel" autoComplete="tel" placeholder="(49) 99999-9999" value={form.data.telefone} onChange={e => form.setData('telefone', formatarTelefone(e.target.value))} error={!!erros.telefone} helperText={erros.telefone ?? 'É por ele que quem te atende fala com você.'} />
          <TextField label="E-mail" type="email" autoComplete="email" placeholder="voce@email.com" value={form.data.email} onChange={e => form.setData('email', e.target.value)} error={!!erros.email} helperText={erros.email ?? 'Para entrar e recuperar a senha.'} />
          <TextField label="Senha" type="password" autoComplete="new-password" value={form.data.senha} onChange={e => form.setData('senha', e.target.value)} error={!!erros.senha} helperText={erros.senha ?? 'Pelo menos 8 caracteres.'} />
          <Typography sx={{ ...rotulo, pt: 1 }}>Para a entrega</Typography>
          <TextField label="Endereço" autoComplete="street-address" placeholder="Rua, número, bairro" value={form.data.endereco} onChange={e => form.setData('endereco', e.target.value)} error={!!erros.endereco} helperText={erros.endereco} />
          <TextField label="Cidade" autoComplete="address-level2" value={form.data.cidade} onChange={e => form.setData('cidade', e.target.value)} error={!!erros.cidade} helperText={erros.cidade} />
          <TextField label="CPF (opcional)" placeholder="000.000.000-00" value={form.data.cpf} onChange={e => form.setData('cpf', mascaraCpf(e.target.value))} error={!!erros.cpf} helperText={erros.cpf} />
          {!convite && vendedores.length > 1 && (
            <TextField select label={`Quem te atende na ${identidade.nome}?`} value={form.data.vendedorId} onChange={e => form.setData('vendedorId', e.target.value)}>
              <MenuItem value="">Tanto faz</MenuItem>
              {vendedores.map(v => <MenuItem key={v.id} value={v.id}>{v.nome}</MenuItem>)}
            </TextField>
          )}
          <FormControlLabel control={<Checkbox checked={form.data.aceitaOfertas} onChange={e => form.setData('aceitaOfertas', e.target.checked)} />} label="Quero receber ofertas e novidades pelo WhatsApp (opcional)" />
          <Box>
            <FormControlLabel control={<Checkbox checked={form.data.aceite} onChange={e => form.setData('aceite', e.target.checked)} />} label="Li e aceito a política de privacidade" />
            <FormHelperText error={!!erros.aceite}>{erros.aceite ?? <>Veja como usamos seus dados na <Link href="/privacidade" target="_blank">política de privacidade</Link>.</>}</FormHelperText>
          </Box>
          <Button type="submit" variant="contained" size="large" fullWidth loading={form.processing} loadingPosition="start">{form.processing ? 'Criando conta…' : 'Criar conta'}</Button>
        </Stack>
      </Box>
      <Typography variant="caption" color="text.secondary" align="center" sx={{ display: 'block', mt: 3 }}>Seus dados ficam só com a loja e servem para o seu atendimento.</Typography>
      <Typography align="center" color="text.secondary" sx={{ mt: 2 }}>Já tem conta? <Link href={volta ? `/entrar?volta=${encodeURIComponent(volta)}` : '/entrar'} sx={{ fontWeight: 600 }}>Entrar</Link></Typography>
    </ContaLayout>
  );
}
