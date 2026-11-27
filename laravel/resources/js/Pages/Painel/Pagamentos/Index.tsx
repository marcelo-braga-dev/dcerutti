import { Head } from '@inertiajs/react';
import { Alert, Box, Card, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina, Etiqueta, Vazio } from '@/Components/ui/Basicos';
import { LinhaFiltro, PainelFiltros } from '@/Components/ui/Filtros';
import { SeletorMes } from '@/Components/ui/SeletorMes';
import { LinkSimples } from '@/Components/loja/LinkSimples';
import type { CobrancaTela } from '@/Components/painel/pagamento/PagamentoPedido';
import { formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { COR_STATUS, descreverMeio, ROTULO_METODO, ROTULO_STATUS, type MetodoCobranca } from '@/lib/pagamento';
import { comFiltros } from '@/lib/url';

type Linha = CobrancaTela & { pedido: { id: string; codigo: string; nomeCliente: string; vendedor: string | null } };
type Props = {
  lista: Linha[]; total: number; mes: string; atual: string; status: string | null; pagina: number; configurado: boolean;
  resumo: { pagamentos: number; bruto: number; estornado: number; taxas: number; liquido: number; porMeio: { metodo: MetodoCobranca; valor: number; quantidade: number }[]; abertas: { quantidade: number; valor: number } };
};

const FILTROS: { valor: string | null; rotulo: string }[] = [
  { valor: null, rotulo: 'Todos' }, { valor: 'pagas', rotulo: 'Pagos' }, { valor: 'abertas', rotulo: 'Aguardando' }, { valor: 'estornada', rotulo: 'Estornados' }, { valor: 'problemas', rotulo: 'Precisam de atenção' },
];
const COR = { oliva: 'oliva', cinza: 'cinza', escuro: 'contorno', vermelho: 'vermelho', padrao: 'caramelo' } as const;

function Kpi({ rotulo, valor, detalhe, escuro }: { rotulo: string; valor: string; detalhe?: string; escuro?: boolean }) {
  return (
    <Card variant="outlined" sx={{ p: 2.5, bgcolor: escuro ? 'marca.marrom-950' : undefined, color: escuro ? 'marca.creme' : undefined }}>
      <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.75 }}>{rotulo}</Typography>
      <Typography sx={{ fontWeight: 800, fontSize: 22 }}>{valor}</Typography>
      {detalhe && <Typography variant="caption" sx={{ opacity: 0.75 }}>{detalhe}</Typography>}
    </Card>
  );
}

/** Conferência do pagamento online (porta de painel/pagamentos/page.tsx): recebido, taxas, líquido, abertos e problemas. */
export default function Pagamentos({ lista, total, resumo, mes, atual, status, pagina, configurado }: Props) {
  const url = (m: Record<string, string | null>) => comFiltros('/painel/pagamentos', { mes, status }, m);
  return (
    <PainelLayout>
      <Head title="Pagamentos online" />
      <CabecalhoPagina sobre="Mercado Pago" titulo="Pagamentos online" acoes={<SeletorMes mes={mes} atual={atual} base={status ? `/painel/pagamentos?status=${status}` : '/painel/pagamentos'} />}>
        {resumo.pagamentos} {resumo.pagamentos === 1 ? 'pagamento aprovado' : 'pagamentos aprovados'} no mês
      </CabecalhoPagina>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>Tarifas e líquido como o Mercado Pago informa em cada order. Confira com o relatório de liberações do Mercado Pago, que é o valor que cai na conta.</Typography>
      {!configurado && <Alert severity="error" sx={{ mb: 2 }}>As credenciais do Mercado Pago não estão no servidor: nenhuma cobrança nova pode ser criada.</Alert>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
        <Kpi rotulo="Recebido" valor={brl(resumo.bruto)} detalhe={resumo.porMeio.map(m => `${ROTULO_METODO[m.metodo]}: ${brl(m.valor)}`).join(' · ') || '—'} escuro />
        <Kpi rotulo="Tarifas informadas pelo MP" valor={brl(resumo.taxas)} detalhe={resumo.bruto ? `${((resumo.taxas / resumo.bruto) * 100).toFixed(1).replace('.', ',')}% do recebido` : undefined} />
        <Kpi rotulo="Estornado" valor={brl(resumo.estornado)} />
        <Kpi rotulo="Líquido" valor={brl(resumo.liquido)} detalhe={`${resumo.abertas.quantidade} aguardando (${brl(resumo.abertas.valor)})`} />
      </Box>
      <PainelFiltros>
        <LinhaFiltro rotulo="Situação" opcoes={FILTROS.map(f => ({ rotulo: f.rotulo, href: url({ status: f.valor, pagina: null }), ativo: status === f.valor }))} />
      </PainelFiltros>
      {lista.length === 0 ? <Vazio>Nenhuma cobrança neste mês{status ? ' com esta situação' : ''}.</Vazio> : (
        <Card variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Criada</TableCell><TableCell>Pedido</TableCell><TableCell>Meio</TableCell><TableCell>Situação</TableCell><TableCell align="right">Valor</TableCell><TableCell align="right" title="Como o Mercado Pago informa na order; confira com o extrato.">Tarifa</TableCell></TableRow></TableHead>
            <TableBody>
              {lista.map(c => (
                <TableRow key={c.id}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatarDataHora(c.criadaEm)}</TableCell>
                  <TableCell><LinkSimples href={`/painel/pedidos/${c.pedido.id}`} sx={{ textDecoration: 'underline' }}>{c.pedido.codigo}</LinkSimples><Box sx={{ color: 'text.secondary' }}>{c.pedido.nomeCliente}{c.pedido.vendedor ? ` · ${c.pedido.vendedor.split(' ')[0]}` : ''}</Box></TableCell>
                  <TableCell>{c.paga || c.status === 'estornada' ? descreverMeio(c) : ROTULO_METODO[c.metodo]}</TableCell>
                  <TableCell>
                    <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 0.5 }}><Etiqueta cor={COR[COR_STATUS[c.status]]}>{ROTULO_STATUS[c.status]}</Etiqueta>{c.semEstoque && <Etiqueta cor="vermelho">Peça esgotada</Etiqueta>}</Stack>
                    {c.aprovadaEm && <Typography variant="caption" color="text.secondary">pago {formatarDataHora(c.aprovadaEm)}</Typography>}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{brl(c.valor)}{c.valorEstornado > 0 && <Box sx={{ fontSize: 12, fontWeight: 400, color: 'text.secondary' }}>−{brl(c.valorEstornado)} estornado</Box>}</TableCell>
                  <TableCell align="right" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{c.taxa != null ? brl(c.taxa) : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {lista.length < total && <Box sx={{ p: 2, textAlign: 'center' }}><LinkSimples href={url({ pagina: String(pagina + 1) })} sx={{ textDecoration: 'underline' }}>Carregar mais ({total - lista.length})</LinkSimples></Box>}
        </Card>
      )}
    </PainelLayout>
  );
}
