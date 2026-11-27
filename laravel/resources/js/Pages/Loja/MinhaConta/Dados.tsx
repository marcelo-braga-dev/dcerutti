import { useForm, usePage } from '@inertiajs/react';
import { Alert, Box, Button, Checkbox, FormControlLabel, Paper, Stack, TextField, Typography } from '@mui/material';
import { ContaCliente, rotulo, type ResumoConta } from '@/Components/loja/ContaCliente';
import { estiloTitulo } from '@/Components/loja/Vitrine';
import { formatarData } from '@/lib/datas';
import { formatarCep, formatarTelefone } from '@/lib/telefone';
import { linkWhatsApp } from '@/lib/whatsapp';
import { router } from '@inertiajs/react';
import { useState } from 'react';

type Props = {
  conta: ResumoConta;
  cliente: { nome: string; telefone: string; cpf: string | null; cep: string | null; endereco: string | null; cidade: string | null; aceitaOfertas: boolean } | null;
  vendedor: { nome: string; telefone: string } | null;
  aceitouPrivacidadeEm: string | null;
};

const mascaraCpf = (v: string) => v.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');

/** Meus dados e exclusão da conta (porta de src/app/(loja)/minha-conta/page.tsx). */
export default function Dados({ conta, cliente, vendedor, aceitouPrivacidadeEm }: Props) {
  const { flash, errors } = usePage().props as unknown as { flash: { sucesso: string | null }; errors: Record<string, string> };
  const form = useForm({ nome: cliente?.nome ?? '', telefone: cliente?.telefone ?? '', cpf: cliente?.cpf ?? '', cep: cliente?.cep ?? '', endereco: cliente?.endereco ?? '', cidade: cliente?.cidade ?? '', aceitaOfertas: cliente?.aceitaOfertas ?? false });
  const [excluindo, setExcluindo] = useState(false);
  const campo = (nome: keyof typeof form.data, label: string, extra: object = {}) => (
    <TextField label={label} value={form.data[nome] as string} onChange={e => form.setData(nome, e.target.value as never)} error={!!form.errors[nome]} helperText={form.errors[nome]} {...extra} />
  );
  const excluir = () => {
    if (!confirm('Excluir sua conta e seus dados pessoais? Não dá para desfazer.')) return;
    setExcluindo(true);
    router.delete('/minha-conta', { onFinish: () => setExcluindo(false) });
  };
  return (
    <ContaCliente conta={conta} titulo="Meus dados">
      <Box sx={{ display: 'grid', gridTemplateColumns: { lg: '1fr 320px' }, gap: 3, alignItems: 'start' }}>
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 5 }}>
          <Typography component="h2" sx={{ ...estiloTitulo, fontSize: 24 }}>Meus dados</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>Usados por quem te atende para combinar entrega e pagamento.</Typography>
          {flash.sucesso && <Alert severity="success" sx={{ mb: 2 }}>{flash.sucesso}</Alert>}
          {cliente ? (
            <Box component="form" noValidate onSubmit={e => { e.preventDefault(); form.put('/minha-conta', { preserveScroll: true }); }} sx={{ display: 'grid', gridTemplateColumns: { sm: '1fr 1fr' }, gap: 2.5 }}>
              <Box sx={{ gridColumn: { sm: 'span 2' }, display: 'grid' }}>{campo('nome', 'Nome completo', { autoComplete: 'name' })}</Box>
              <TextField label="WhatsApp" type="tel" value={form.data.telefone} onChange={e => form.setData('telefone', formatarTelefone(e.target.value))} error={!!form.errors.telefone} helperText={form.errors.telefone} autoComplete="tel" />
              <TextField label="CPF (opcional)" value={form.data.cpf} onChange={e => form.setData('cpf', mascaraCpf(e.target.value))} error={!!form.errors.cpf} helperText={form.errors.cpf} placeholder="000.000.000-00" />
              <TextField label="CEP" value={form.data.cep} onChange={e => form.setData('cep', formatarCep(e.target.value))} error={!!form.errors.cep} helperText={form.errors.cep} placeholder="89874-000" autoComplete="postal-code" />
              {campo('cidade', 'Cidade', { autoComplete: 'address-level2' })}
              <Box sx={{ gridColumn: { sm: 'span 2' }, display: 'grid' }}>{campo('endereco', 'Endereço', { placeholder: 'Rua, número, bairro', autoComplete: 'street-address' })}</Box>
              <Box sx={{ gridColumn: { sm: 'span 2' } }}>
                <FormControlLabel control={<Checkbox checked={form.data.aceitaOfertas} onChange={e => form.setData('aceitaOfertas', e.target.checked)} />} label="Quero receber ofertas e novidades pelo WhatsApp" />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Pode desmarcar quando quiser. Contato sobre os seus pedidos continua.</Typography>
              </Box>
              <Box sx={{ gridColumn: { sm: 'span 2' } }}><Button type="submit" variant="contained" loading={form.processing} sx={{ borderRadius: 99, px: 4 }}>Salvar meus dados</Button></Box>
            </Box>
          ) : <Typography variant="body2" color="text.secondary">Sua ficha ainda não foi criada. Fale com a loja.</Typography>}
        </Paper>
        <Stack spacing={3}>
          {vendedor && (
            <Paper variant="outlined" sx={{ p: 3, borderRadius: 5 }}>
              <Typography sx={{ ...rotulo, mb: 1 }}>Quem te atende</Typography>
              <Typography sx={{ fontWeight: 600 }}>{vendedor.nome}</Typography>
              <Typography variant="body2" color="text.secondary">{formatarTelefone(vendedor.telefone)}</Typography>
              <Button component="a" href={linkWhatsApp(vendedor.telefone, `Olá, ${vendedor.nome.split(' ')[0]}!`)} target="_blank" rel="noopener" fullWidth variant="contained" color="success" sx={{ mt: 2, borderRadius: 99 }}>Chamar no WhatsApp</Button>
            </Paper>
          )}
          <Paper variant="outlined" sx={{ p: 3, borderRadius: 5 }}>
            <Typography sx={{ ...rotulo, mb: 1 }}>Acesso</Typography>
            <Typography variant="body2">E-mail: <strong style={{ wordBreak: 'break-all' }}>{conta.email}</strong></Typography>
            <Typography variant="caption" color="text.secondary">Para trocar o e-mail, fale com a loja.</Typography>
            <Box><Button href="/esqueci-senha" size="small" sx={{ mt: 1.5, px: 0, textDecoration: 'underline' }}>Trocar a senha</Button></Box>
            {aceitouPrivacidadeEm && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>Política de privacidade aceita em {formatarData(aceitouPrivacidadeEm)}.</Typography>}
          </Paper>
        </Stack>
      </Box>
      <Box id="excluir" sx={{ mt: 6, borderRadius: 6, border: 1, borderColor: 'rgba(184,70,47,.2)', bgcolor: 'rgba(184,70,47,.03)', p: { xs: 3, sm: 4 }, scrollMarginTop: 144 }}>
        <Typography component="h2" sx={{ ...estiloTitulo, fontSize: 20, mb: 1 }}>Excluir minha conta</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 672 }}>Apaga seu acesso e seus dados pessoais (nome, WhatsApp, e-mail, endereço). Os pedidos ficam registrados para a loja, sem identificar você. Não dá para desfazer. Veja a <a href="/privacidade">política de privacidade</a>.</Typography>
        {errors.erro && <Alert severity="error" sx={{ mb: 2 }}>{errors.erro}</Alert>}
        <Button variant="contained" color="error" onClick={excluir} loading={excluindo} sx={{ borderRadius: 99 }}>Excluir minha conta</Button>
      </Box>
    </ContaCliente>
  );
}
