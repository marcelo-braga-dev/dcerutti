import { useState } from 'react';
import { router } from '@inertiajs/react';
import { Box, Button, Card, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { WhatsApp } from '@mui/icons-material';
import { LinkSimples } from '@/Components/loja/LinkSimples';
import { brl } from '@/lib/dinheiro';

/** Abre o WhatsApp da cliente com a mensagem e o link e marca como enviada (a primeira vez conta no acompanhamento). */
export function BotaoEnviarSugestao({ id, url, enviada, pequeno = false }: { id: string; url: string; enviada: boolean; pequeno?: boolean }) {
  const [feito, setFeito] = useState(enviada);
  return (
    <Button component="a" href={url} target="_blank" rel="noopener" data-acao={feito ? 'contato' : 'nenhuma'} size={pequeno ? 'small' : 'medium'} variant={feito ? 'outlined' : 'contained'} color={feito ? 'primary' : 'success'} startIcon={<WhatsApp />}
      onClick={() => { if (!feito) { setFeito(true); router.post(`/painel/sugestoes/${id}/enviada`, {}, { preserveScroll: true }); } }}>
      {feito ? 'Enviar de novo' : 'Enviar no WhatsApp'}
    </Button>
  );
}

/** Lembrete no WhatsApp, conforme o ponto em que ela parou; guarda o lembrete. */
export function BotaoLembrar({ id, url, lembretes = 0, pequeno = false }: { id: string; url: string; lembretes?: number; pequeno?: boolean }) {
  return (
    <Button component="a" href={url} target="_blank" rel="noopener" data-acao="nenhuma" size={pequeno ? 'small' : 'medium'} variant="contained" title={lembretes ? `Já lembrada ${lembretes}×` : undefined}
      onClick={() => router.post(`/painel/sugestoes/${id}/lembrar`, {}, { preserveScroll: true })}>
      Lembrar no WhatsApp{lembretes ? ` (${lembretes + 1}º)` : ''}
    </Button>
  );
}

type Linha = { enviados: number; vistos: number; respondidos: number; pedidos: number; vendido: number };
export type Conversao = { total: Linha; porVendedor: (Linha & { id: string; nome: string })[] };
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');

/** Funil das sugestões enviadas: enviados → vistos → respondidos → viraram pedido, e o valor vendido. */
export function FunilSugestoes({ c, periodo, porVendedor }: { c: Conversao; periodo: string; porVendedor?: boolean }) {
  const t = c.total;
  const kpi = (rotulo: string, valor: string, detalhe: string, escuro = false) => (
    <Box sx={{ p: 2, borderRadius: 2, bgcolor: escuro ? 'marca.marrom-950' : 'marca.creme', color: escuro ? 'marca.creme' : undefined }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.75 }}>{rotulo}</Typography>
      <Typography sx={{ fontWeight: 800, fontSize: 24 }}>{valor}</Typography>
      <Typography variant="caption" sx={{ opacity: 0.75 }}>{detalhe}</Typography>
    </Box>
  );
  return (
    <Card variant="outlined" sx={{ p: { xs: 2.5, sm: 3 }, overflowX: 'auto' }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', mb: 2.5, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h6">Sugestões enviadas · {periodo}</Typography>
        <LinkSimples href="/painel/sugestoes" sx={{ fontSize: 13, textDecoration: 'underline', color: 'text.secondary' }}>Ver sugestões</LinkSimples>
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', xl: 'repeat(5, 1fr)' }, gap: 1.5 }}>
        {kpi('Enviados', String(t.enviados), 'Sugestões com o link mandado')}
        {kpi('Vistos', String(t.vistos), `${pct(t.vistos, t.enviados)} dos enviados`)}
        {kpi('Respondidos', String(t.respondidos), `${pct(t.respondidos, t.enviados)} dos enviados`)}
        {kpi('Viraram pedido', String(t.pedidos), `${pct(t.pedidos, t.enviados)} de conversão`)}
        {kpi('Vendido', brl(t.vendido), 'Pedidos confirmados', true)}
      </Box>
      {porVendedor && c.porVendedor.length > 0 && (
        <Table size="small" sx={{ mt: 3, minWidth: 560 }}>
          <TableHead><TableRow><TableCell>Vendedor</TableCell><TableCell>Enviados</TableCell><TableCell>Vistos</TableCell><TableCell>Respondidos</TableCell><TableCell>Pedidos</TableCell><TableCell>Conversão</TableCell><TableCell align="right">Vendido</TableCell></TableRow></TableHead>
          <TableBody>
            {c.porVendedor.map(v => (
              <TableRow key={v.id}>
                <TableCell><LinkSimples href={`/painel/sugestoes?vendedor=${v.id}`} sx={{ fontWeight: 600 }}>{v.nome}</LinkSimples></TableCell>
                <TableCell>{v.enviados}</TableCell><TableCell>{v.vistos}</TableCell><TableCell>{v.respondidos}</TableCell><TableCell>{v.pedidos}</TableCell><TableCell>{pct(v.pedidos, v.enviados)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{brl(v.vendido)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
