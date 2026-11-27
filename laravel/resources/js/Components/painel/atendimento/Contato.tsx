import { useState } from 'react';
import { router } from '@inertiajs/react';
import { Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Instagram, WhatsApp } from '@mui/icons-material';
import { linkDirect, montarResposta, type VariaveisResposta } from '@/lib/atendimento';
import { postJson } from '@/lib/http';
import { formatarTelefone } from '@/lib/telefone';
import { linkWhatsApp } from '@/lib/whatsapp';

const marcar = (id: string, canal: 'whatsapp' | 'instagram') => { postJson(`/painel/atendimento/${id}/contato-feito`, { canal }).then(() => router.reload()).catch(() => {}); };

/** Botões de contato: o clique conta como contato. O Direct não aceita texto pronto: copia e abre a conversa. */
export function BotoesContato({ id, telefone, instagram, texto = '', grande = false }: { id: string; telefone: string | null; instagram: string | null; texto?: string; grande?: boolean }) {
  const [copiado, setCopiado] = useState(false);
  const abrirDirect = async () => {
    window.open(linkDirect(instagram!), '_blank', 'noopener');
    if (texto) await navigator.clipboard?.writeText(texto).then(() => setCopiado(true), () => setCopiado(false));
    marcar(id, 'instagram');
  };
  return (
    <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
      {telefone && <Button component="a" href={linkWhatsApp(telefone, texto)} target="_blank" rel="noopener" data-acao="nenhuma" onClick={() => marcar(id, 'whatsapp')} size={grande ? 'medium' : 'small'} variant="contained" color="whatsapp" startIcon={<WhatsApp />}>WhatsApp</Button>}
      {instagram && <Button onClick={abrirDirect} size={grande ? 'medium' : 'small'} variant="outlined" startIcon={<Instagram />}>Direct{texto ? ' (copia o texto)' : ''}</Button>}
      {copiado && <Typography role="status" variant="caption" color="success.main">Texto copiado: cole na conversa.</Typography>}
    </Stack>
  );
}

type Resposta = { id: number; titulo: string; texto: string };

/** Escolhe a resposta pronta, confere o texto e envia por onde houver contato. */
export function PainelContato({ id, telefone, instagram, respostas, variaveis, meuNumero }: { id: string; telefone: string | null; instagram: string | null; respostas: Resposta[]; variaveis: VariaveisResposta; meuNumero: { apelido: string; telefone: string } | null }) {
  const [texto, setTexto] = useState('');
  return (
    <Stack spacing={1.5}>
      <TextField select size="small" label="Resposta pronta" value="" onChange={e => { const r = respostas.find(x => x.id === Number(e.target.value)); if (r) setTexto(montarResposta(r.texto, variaveis)); }} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
        <MenuItem value="">Escolha um modelo…</MenuItem>
        {respostas.map(r => <MenuItem key={r.id} value={r.id}>{r.titulo}</MenuItem>)}
      </TextField>
      <TextField label="Mensagem" multiline minRows={4} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Confira o texto antes de enviar." slotProps={{ htmlInput: { maxLength: 2000 } }} />
      {!telefone && !instagram && <Typography variant="body2" color="error.main">Sem WhatsApp nem @: informe um contato abaixo.</Typography>}
      <BotoesContato id={id} telefone={telefone} instagram={instagram} texto={texto} grande />
      {telefone && <Typography variant="caption" color="text.secondary">{meuNumero ? <>Confira se o WhatsApp aberto é o número <strong>{meuNumero.apelido}</strong>, {formatarTelefone(meuNumero.telefone)}.</> : 'Você está sem número da loja ligado: fale com a gestão.'}</Typography>}
    </Stack>
  );
}

/** O contato de pós-venda na fila: chamar e registrar como foi. */
export function BotoesPosVenda({ id, clienteId, url, oferta }: { id: number; clienteId: string; url: string; oferta: boolean }) {
  const concluir = (resultado: string) => router.post(`/painel/pos-venda/${id}/concluir`, { resultado }, { preserveScroll: true });
  return (
    <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
      <Button component="a" href={url} target="_blank" rel="noopener" data-acao="contato" size="small" variant="contained" color="whatsapp" startIcon={<WhatsApp />}>WhatsApp</Button>
      <Button size="small" variant="outlined" onClick={() => concluir('respondeu')}>Respondeu</Button>
      <Button size="small" variant="outlined" onClick={() => concluir('nao_respondeu')}>Não respondeu</Button>
      <Button size="small" variant="outlined" onClick={() => router.post(`/painel/pos-venda/${id}/atendimento`)}>Virou atendimento</Button>
      <Button size="small" onClick={() => concluir('pulado')}>Pular</Button>
      {oferta && <Button size="small" onClick={() => { if (confirm('Esta cliente pediu para não receber ofertas? Ela sai da fila de ofertas.')) router.post(`/painel/clientes/${clienteId}/sem-ofertas`, {}, { preserveScroll: true }); }}>Não quer ofertas</Button>}
    </Stack>
  );
}
