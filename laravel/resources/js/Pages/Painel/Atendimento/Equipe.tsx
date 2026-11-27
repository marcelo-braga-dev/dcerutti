import { Head } from '@inertiajs/react';
import { Button, Card, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography, Box } from '@mui/material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina, Vazio } from '@/Components/ui/Basicos';
import { LinkSimples } from '@/Components/loja/LinkSimples';
import type { LinhaAtendimento } from './Index';
import { CANAIS } from '@/lib/atendimento';

type Linha = { id: string; nome: string; numero: string | null; abertos: number; novos: number; hoje: number; vencidos: number; conversao: number | null; minutosPrimeiroContato: number | null };
const tempo = (m: number | null) => (m == null ? '—' : m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} dias`);

/** Só a gestão (D-30): o que está aberto com cada pessoa e o que está sem responsável. */
export default function VisaoDaEquipe({ linhas, semResponsavel }: { linhas: Linha[]; semResponsavel: LinhaAtendimento[] }) {
  return (
    <PainelLayout>
      <Head title="Visão da equipe" />
      <CabecalhoPagina sobre="Atendimento" titulo="Visão da equipe">O que está em andamento com cada pessoa. Lembre que o painel só conta o que foi registrado.</CabecalhoPagina>
      <Stack spacing={3}>
        {semResponsavel.length > 0 && (
          <Card variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="h6" sx={{ mb: 1.5 }}>Sem responsável ({semResponsavel.length})</Typography>
            <Stack spacing={1}>{semResponsavel.map(a => <Stack key={a.id} direction="row" sx={{ flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, fontSize: 14 }}><span>{a.nome} <Box component="span" sx={{ color: 'text.secondary' }}>· {a.codigo} · {CANAIS[a.canal]}</Box></span><Button size="small" variant="outlined" href={`/painel/atendimento/${a.id}`}>Passar para alguém</Button></Stack>)}</Stack>
          </Card>
        )}
        {!linhas.length ? <Vazio>Nenhum vendedor ativo.</Vazio> : (
          <Card variant="outlined" sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead><TableRow>{['Pessoa', 'Número', 'Abertos', 'Novos', 'Para hoje', 'Atrasados', 'Conversão, 30 dias', '1º contato, 30 dias'].map((t, i) => <TableCell key={t} align={i > 1 ? 'right' : 'left'}>{t}</TableCell>)}</TableRow></TableHead>
              <TableBody>
                {linhas.map(l => (
                  <TableRow key={l.id}>
                    <TableCell><LinkSimples href={`/painel/atendimento/lista?vendedor=${l.id}`} sx={{ fontWeight: 600 }}>{l.nome}</LinkSimples></TableCell>
                    <TableCell sx={{ color: l.numero ? undefined : 'error.main' }}>{l.numero ?? 'Sem número'}</TableCell>
                    <TableCell align="right">{l.abertos}</TableCell><TableCell align="right">{l.novos}</TableCell><TableCell align="right">{l.hoje}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, color: l.vencidos ? 'error.main' : undefined }}>{l.vencidos}</TableCell>
                    <TableCell align="right">{l.conversao == null ? '—' : `${l.conversao}%`}</TableCell><TableCell align="right">{tempo(l.minutosPrimeiroContato)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </Stack>
    </PainelLayout>
  );
}
