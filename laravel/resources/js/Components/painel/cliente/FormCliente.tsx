import { useForm } from '@inertiajs/react';
import { Alert, Box, Button, Checkbox, FormControlLabel, FormHelperText, MenuItem, TextField, Typography } from '@mui/material';
import { formatarTelefone, formatarCep } from '@/lib/telefone';
import { formatarCpf } from '@/lib/cpf';
import { aceitaOfertas } from '@/lib/pos-venda';

export type ClienteForm = {
  id: string; nome: string; telefone: string; cpf: string | null; email: string | null; endereco: string | null; cidade: string | null; cep: string | null;
  preferencias: string | null; instagram: string | null; vendedorId: string; temAcesso: boolean; aceitaOfertasEm: string | null; descadastradaEm: string | null;
};

/** Cadastro e edição da cliente (src/components/painel/form-cliente.tsx). Só o gestor troca e-mail e senha de quem já tem acesso. */
export function FormCliente({ cliente, vendedores, gestor }: { cliente: ClienteForm | null; vendedores: { id: string; nome: string }[] | null; gestor: boolean }) {
  const bloqueado = !!cliente?.temAcesso && !gestor;
  const form = useForm({
    nome: cliente?.nome ?? '', telefone: cliente?.telefone ?? '', cpf: cliente?.cpf ?? '', cidade: cliente?.cidade ?? 'Maravilha', endereco: cliente?.endereco ?? '',
    cep: cliente?.cep ?? '', instagram: cliente?.instagram ?? '', preferencias: cliente?.preferencias ?? '', aceitaOfertas: aceitaOfertas(cliente ? { aceitaOfertasEm: cliente.aceitaOfertasEm ? new Date(cliente.aceitaOfertasEm) : null, descadastradaEm: cliente.descadastradaEm ? new Date(cliente.descadastradaEm) : null } : null),
    vendedorId: cliente?.vendedorId ?? vendedores?.[0]?.id ?? '', email: cliente?.email ?? '', senha: '',
  });
  const erros = form.errors as Record<string, string>;
  const campo = (nome: keyof typeof form.data, rotulo: string, extra: Record<string, unknown> = {}, mascara?: (v: string) => string) => (
    <TextField label={rotulo} name={nome} value={form.data[nome] as string} error={!!erros[nome]} helperText={erros[nome] ?? (extra.ajuda as string | undefined)}
      onChange={e => form.setData(nome, (mascara ? mascara(e.target.value) : e.target.value) as never)} {...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'ajuda'))} />
  );
  const enviar = () => (cliente ? form.put(`/painel/clientes/${cliente.id}`, { preserveScroll: true }) : form.post('/painel/clientes'));

  return (
    <Box component="form" noValidate onSubmit={e => { e.preventDefault(); enviar(); }} sx={{ display: 'grid', gridTemplateColumns: { sm: '1fr 1fr' }, gap: 2.5 }}>
      <Box sx={{ gridColumn: { sm: '1 / -1' } }}>{campo('nome', 'Nome')}</Box>
      {campo('telefone', 'WhatsApp', { type: 'tel', placeholder: '(49) 99999-9999' }, formatarTelefone)}
      {campo('cpf', 'CPF (opcional)', { placeholder: '000.000.000-00' }, formatarCpf)}
      {campo('cidade', 'Cidade')}
      {campo('cep', 'CEP', { placeholder: '89874-000' }, formatarCep)}
      <Box sx={{ gridColumn: { sm: '1 / -1' } }}>{campo('endereco', 'Endereço', { placeholder: 'Rua, número, bairro' })}</Box>
      {campo('instagram', 'Instagram (opcional)', { placeholder: '@usuario' })}
      {campo('preferencias', 'Preferências', { placeholder: 'Tricôs · Tam. M' })}
      <Box sx={{ gridColumn: { sm: '1 / -1' } }}>
        <FormControlLabel control={<Checkbox checked={form.data.aceitaOfertas} onChange={e => form.setData('aceitaOfertas', e.target.checked)} />} label="Aceita receber ofertas" />
        <FormHelperText sx={{ mt: -0.5 }}>Marque só se ela pediu ou concordou. Desmarcado, ela sai da fila de ofertas; contato sobre o próprio pedido continua.</FormHelperText>
      </Box>
      {vendedores && (
        <TextField select label="Vendedor que atende" value={form.data.vendedorId} onChange={e => form.setData('vendedorId', e.target.value)} error={!!erros.vendedorId} helperText={erros.vendedorId} sx={{ gridColumn: { sm: '1 / -1' } }}>
          {vendedores.map(v => <MenuItem key={v.id} value={v.id}>{v.nome}</MenuItem>)}
        </TextField>
      )}
      <Box component="fieldset" sx={{ gridColumn: { sm: '1 / -1' }, border: 0, borderTop: 1, borderColor: 'divider', p: 0, pt: 2.5, m: 0, display: 'grid', gridTemplateColumns: { sm: '1fr 1fr' }, gap: 2.5 }}>
        <Typography component="legend" variant="overline" color="secondary" sx={{ pr: 1.5 }}>Acesso à loja {cliente?.temAcesso ? '· ativo' : '(opcional)'}</Typography>
        {bloqueado ? (
          <Typography variant="body2" color="text.secondary" sx={{ gridColumn: { sm: '1 / -1' } }}>E-mail de acesso: <strong>{cliente?.email}</strong>. Só o gestor troca e-mail e senha de quem já tem acesso.</Typography>
        ) : (
          <>
            {campo('email', 'E-mail', { type: 'email', placeholder: 'cliente@email.com' })}
            {campo('senha', cliente?.temAcesso ? 'Nova senha (em branco mantém)' : 'Senha', { type: 'password', autoComplete: 'new-password', ajuda: cliente?.temAcesso ? 'Trocar a senha encerra as sessões abertas do cliente.' : 'Com e-mail e senha (mínimo 8 caracteres), o cliente já pode entrar no catálogo.' })}
          </>
        )}
      </Box>
      {form.recentlySuccessful && <Alert severity="success" sx={{ gridColumn: { sm: '1 / -1' } }}>Cliente salvo.</Alert>}
      <Box sx={{ gridColumn: { sm: '1 / -1' } }}><Button type="submit" variant="contained" loading={form.processing}>{cliente ? 'Salvar alterações' : 'Cadastrar cliente'}</Button></Box>
    </Box>
  );
}
