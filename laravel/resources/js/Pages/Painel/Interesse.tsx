import type { ReactNode } from 'react';
import { Head, usePage } from '@inertiajs/react';
import { Alert, Box, Button, Card, LinearProgress, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina, Foto, Vazio } from '@/Components/ui/Basicos';
import { LinkSimples } from '@/Components/loja/LinkSimples';
import { tempoDesde } from '@/lib/atividade';
import { formatarData } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';

type Rank = { valor: string; n: number; parte: number };
type Props = {
  dias: number; historicoLigado: boolean;
  kpis: { clientesAtivas: number; visitas: number; vistas: number; sacolasAbertas: number };
  produtos: { produto: { id: number; referencia: string; nome: string; preco: number; imagem: string | null; disponivel: number }; vistas: number; clientes: number; sacola: number; pedidas: number }[];
  semResultado: Rank[]; maisBuscadas: Rank[]; porDia: Rank[]; aparelhos: Rank[]; porVendedor: Rank[];
  maisAtivas: { id: string; nome: string; vendedor: string | null; ultimoAcessoEm: string | null; paginas: number }[];
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const Bloco = ({ titulo, sub, children }: { titulo: string; sub?: string; children: ReactNode }) => (
  <Card variant="outlined" sx={{ p: { xs: 2.5, sm: 3 } }}><Typography component="h2" variant="h6">{titulo}</Typography>{sub && <Typography variant="body2" color="text.secondary">{sub}</Typography>}<Box sx={{ mt: 2 }}>{children}</Box></Card>
);
const Termos = ({ itens }: { itens: Rank[] }) => <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1, fontSize: 14 }}>{itens.map(t => <Box key={t.valor} sx={{ px: 1, py: 0.5, border: 1, borderColor: 'divider' }}>“{t.valor}” <Box component="span" sx={{ color: 'text.secondary' }}>· {t.n}</Box></Box>)}</Stack>;

/** Interesse na loja (porta de painel/interesse): peças vistas, buscas e sacolas das clientes no período. */
export default function Interesse({ dias, historicoLigado, kpis, produtos, semResultado, maisBuscadas, porDia, aparelhos, porVendedor, maisAtivas }: Props) {
  const gestor = usePage().props.usuario?.papel === 'gestor';
  const maxDia = Math.max(1, ...porDia.map(d => d.n));
  const kpi = (rotulo: string, valor: number, detalhe?: ReactNode, escuro = false) => (
    <Card variant="outlined" sx={{ p: 2.5, bgcolor: escuro ? 'marca.marrom-950' : undefined, color: escuro ? 'marca.creme' : undefined }}>
      <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.75 }}>{rotulo}</Typography>
      <Typography sx={{ fontWeight: 800, fontSize: 22 }}>{valor}</Typography>
      {detalhe && <Typography variant="caption" sx={{ opacity: 0.8 }}>{detalhe}</Typography>}
    </Card>
  );
  return (
    <PainelLayout>
      <Head title="Interesse" />
      <CabecalhoPagina sobre={gestor ? 'Todas as clientes' : 'Minhas clientes'} titulo="Interesse na loja"
        acoes={<Stack direction="row" spacing={1} aria-label="Período">{[7, 30, 90].map(p => <Button key={p} href={`/painel/interesse?dias=${p}`} variant={p === dias ? 'contained' : 'outlined'} size="small">{p} dias</Button>)}</Stack>}>
        Peças vistas, buscas e sacolas das clientes nos últimos {dias} dias.
      </CabecalhoPagina>
      {!historicoLigado && <Alert severity="warning" sx={{ mb: 3 }}>O registro da navegação está desligado em Configurações. Os dados abaixo são de antes.</Alert>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { sm: '1fr 1fr', xl: 'repeat(4, 1fr)' }, gap: 1.5 }}>
        {kpi('Clientes que acessaram', kpis.clientesAtivas)}
        {kpi('Visitas', kpis.visitas, aparelhos.map(a => `${a.valor} ${pct(a.parte)}`).join(' · ') || undefined)}
        {kpi('Peças vistas', kpis.vistas)}
        {kpi('Sacolas abertas agora', kpis.sacolasAbertas, <LinkSimples href="/painel/clientes?sacola=1" sx={{ color: 'inherit', textDecoration: 'underline' }}>Ver clientes</LinkSimples>, kpis.sacolasAbertas > 0)}
      </Box>
      {kpis.clientesAtivas === 0 ? <Box sx={{ mt: 4 }}><Vazio>Nenhuma navegação registrada no período.</Vazio></Box> : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xl: '1.4fr 1fr' }, gap: 3, mt: 4, alignItems: 'start' }}>
          <Card variant="outlined" sx={{ p: { xs: 2.5, sm: 3 }, overflowX: 'auto' }}>
            <Typography component="h2" variant="h6">Peças mais vistas</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Vistas → clientes diferentes → postas na sacola → pedidas no período.</Typography>
            <Table size="small">
              <TableHead><TableRow><TableCell>Peça</TableCell>{['Vistas', 'Clientes', 'Sacola', 'Pedidas'].map(t => <TableCell key={t} align="right">{t}</TableCell>)}</TableRow></TableHead>
              <TableBody>{produtos.map(x => (
                <TableRow key={x.produto.id}>
                  <TableCell><Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}><Foto src={x.produto.imagem} largura={36} /><Box>
                    <Box component="a" href={`/produto/${x.produto.referencia}`} target="_blank" sx={{ color: 'inherit' }}>{x.produto.nome}</Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{brl(x.produto.preco)} · {x.produto.disponivel ? `${x.produto.disponivel} em estoque` : 'esgotado'}</Typography>
                  </Box></Stack></TableCell>
                  <TableCell align="right">{x.vistas}</TableCell><TableCell align="right">{x.clientes}</TableCell><TableCell align="right">{x.sacola}</TableCell>
                  <TableCell align="right" sx={{ color: x.pedidas ? 'success.main' : 'text.secondary', fontWeight: x.pedidas ? 600 : 400 }}>{x.pedidas}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </Card>
          <Stack spacing={3}>
            <Bloco titulo="Clientes mais ativas">
              <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>{maisAtivas.map(c => (
                <Stack key={c.id} direction="row" sx={{ py: 1, justifyContent: 'space-between', gap: 1.5, fontSize: 14 }}>
                  <Box sx={{ minWidth: 0 }}><LinkSimples href={`/painel/clientes/${c.id}/historico`}>{c.nome}</LinkSimples><Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{c.ultimoAcessoEm ? tempoDesde(c.ultimoAcessoEm) : '—'}{gestor && c.vendedor ? ` · ${c.vendedor}` : ''}</Typography></Box>
                  <Box sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{c.paginas} páginas</Box>
                </Stack>
              ))}</Stack>
            </Bloco>
            {semResultado.length > 0 && <Bloco titulo="Buscas sem resultado" sub="O que procuraram e a loja não tem (ou está com outro nome)."><Termos itens={semResultado} /></Bloco>}
            <Bloco titulo="Mais buscadas">{maisBuscadas.length ? <Termos itens={maisBuscadas} /> : <Typography variant="body2" color="text.secondary">Nenhuma busca no período.</Typography>}</Bloco>
            {gestor && porVendedor.length > 0 && (
              <Bloco titulo="Clientes ativas por vendedor">
                <Stack spacing={1.5} sx={{ fontSize: 14 }}>{porVendedor.map(v => <Box key={v.valor}><Stack direction="row" sx={{ justifyContent: 'space-between' }}><span>{v.valor}</span><Box component="span" sx={{ color: 'text.secondary' }}>{v.n}</Box></Stack><LinearProgress variant="determinate" value={v.parte * 100} sx={{ mt: 0.5, height: 6 }} /></Box>)}</Stack>
              </Bloco>
            )}
            <Bloco titulo="Visitas por dia">
              <Stack spacing={0.75} sx={{ fontSize: 14 }}>{porDia.map(d => (
                <Box key={d.valor} sx={{ display: 'grid', gridTemplateColumns: '5.5rem 1fr 2rem', gap: 1, alignItems: 'center' }}>
                  <Box sx={{ color: 'text.secondary' }}>{formatarData(`${d.valor}T12:00:00-03:00`)}</Box>
                  <LinearProgress variant="determinate" value={(d.n / maxDia) * 100} sx={{ height: 6 }} /><Box sx={{ textAlign: 'right' }}>{d.n}</Box>
                </Box>
              ))}</Stack>
            </Bloco>
          </Stack>
        </Box>
      )}
    </PainelLayout>
  );
}
