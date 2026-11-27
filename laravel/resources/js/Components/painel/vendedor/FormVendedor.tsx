import { useForm } from '@inertiajs/react';
import { Alert, Box, Button, TextField } from '@mui/material';
import { formatarTelefone } from '@/lib/telefone';

/** Cadastro e edição da vendedora (src/components/painel/form-vendedor.tsx). */
export function FormVendedor({ vendedor, meta }: { vendedor?: { id: string; nome: string; email: string; telefone: string | null }; meta?: number | null }) {
  const form = useForm({ nome: vendedor?.nome ?? '', telefone: vendedor?.telefone ?? '', meta: meta ? String(meta).replace('.', ',') : '', email: vendedor?.email ?? '', senha: '' });
  const e = form.errors as Record<string, string>;
  const enviar = () => (vendedor ? form.put(`/painel/vendedores/${vendedor.id}`, { preserveScroll: true, onSuccess: () => form.reset('senha') }) : form.post('/painel/vendedores'));
  return (
    <Box component="form" noValidate onSubmit={ev => { ev.preventDefault(); enviar(); }} sx={{ display: 'grid', gridTemplateColumns: { sm: '1fr 1fr' }, gap: 2.5 }}>
      <TextField label="Nome completo" value={form.data.nome} onChange={ev => form.setData('nome', ev.target.value)} error={!!e.nome} helperText={e.nome} sx={{ gridColumn: { sm: '1 / -1' } }} />
      <TextField label="Telefone de contato (opcional)" type="tel" placeholder="(49) 99999-9999" value={form.data.telefone} onChange={ev => form.setData('telefone', formatarTelefone(ev.target.value))}
        error={!!e.telefone} helperText={e.telefone ?? 'Só para a loja falar com a pessoa. O WhatsApp de atendimento é ligado em Números de WhatsApp.'} />
      <TextField label="Meta deste mês (R$)" placeholder="15000" value={form.data.meta} onChange={ev => form.setData('meta', ev.target.value)} error={!!e.meta} helperText={e.meta} />
      <TextField label="E-mail de acesso" type="email" placeholder="nome@dcerutti.com.br" value={form.data.email} onChange={ev => form.setData('email', ev.target.value)} error={!!e.email} helperText={e.email} />
      <TextField label={vendedor ? 'Nova senha (em branco mantém)' : 'Senha'} type="password" autoComplete="new-password" value={form.data.senha} onChange={ev => form.setData('senha', ev.target.value)} error={!!e.senha} helperText={e.senha ?? 'Mínimo de 8 caracteres.'} />
      {form.recentlySuccessful && <Alert severity="success" sx={{ gridColumn: { sm: '1 / -1' } }}>Vendedor salvo.</Alert>}
      <Box sx={{ gridColumn: { sm: '1 / -1' } }}><Button type="submit" variant="contained" loading={form.processing}>{vendedor ? 'Salvar alterações' : 'Cadastrar vendedor'}</Button></Box>
    </Box>
  );
}
