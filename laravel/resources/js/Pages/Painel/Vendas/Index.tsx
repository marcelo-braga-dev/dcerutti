import { Head, router, usePage } from '@inertiajs/react';
import { Button, Card, Link, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina, Vazio } from '@/Components/ui/Basicos';
import { LinhaFiltro, PainelFiltros } from '@/Components/ui/Filtros';
import { SeletorMes } from '@/Components/ui/SeletorMes';
import { comFiltros } from '@/lib/url';
import { formatarData } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';

type Venda = { id: string; data: string; valor: number; observacao: string | null; pedidoId: string | null; cliente: { id: string; nome: string } | null; pedido: { id: string; codigo: string } | null; vendedor: { id: string; nome: string } };
type Props = { mes: string; atual: string; vendas: Venda[]; vendedores: { id: string; nome: string; total: number }[]; vendedor: { id: string; nome: string } | null };

/** Porta de src/app/(painel)/painel/vendas/page.tsx. */
export default function Vendas({ mes, atual, vendas, vendedores, vendedor }: Props) {
  const gestor = usePage().props.usuario?.papel === 'gestor';
  const total = vendas.reduce((a, v) => a + v.valor, 0);
  const url = (mudar: Record<string, string | null>) => comFiltros('/painel/vendas', { mes: mes === atual ? null : mes, vendedor: vendedor?.id ?? null }, mudar);
  const excluir = (id: string) => { if (confirm('Excluir esta venda manual?')) router.delete(`/painel/vendas/${id}`, { preserveScroll: true }); };
  return (
    <PainelLayout>
      <Head title="Vendas" />
      <CabecalhoPagina sobre="Pedidos confirmados e vendas na loja" titulo="Vendas" acoes={<SeletorMes mes={mes} atual={atual} base={vendedor ? `/painel/vendas?vendedor=${vendedor.id}` : '/painel/vendas'} />}>
        {vendas.length} {vendas.length === 1 ? 'venda' : 'vendas'} · <strong>{brl(total)}</strong>
      </CabecalhoPagina>
      {gestor && (
        <PainelFiltros>
          <LinhaFiltro rotulo="Vendedor" opcoes={[
            { rotulo: 'Todos', href: url({ vendedor: null }), ativo: !vendedor },
            ...vendedores.map(v => ({ rotulo: `${v.nome.split(' ')[0]} · ${brl(v.total)}`, href: url({ vendedor: v.id }), ativo: vendedor?.id === v.id })),
          ]} />
          {vendedor && <Typography variant="body2"><Link href={`/painel/vendedores/${vendedor.id}`}>Perfil de {vendedor.nome}</Link> · <Link href={`/painel/clientes?vendedor=${vendedor.id}`}>clientes</Link></Typography>}
        </PainelFiltros>
      )}
      {vendas.length === 0 ? <Vazio>Nenhuma venda neste mês.</Vazio> : (
        <TableContainer component={Card}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Data</TableCell><TableCell>Cliente</TableCell>{gestor && <TableCell>Vendedor</TableCell>}<TableCell>Origem</TableCell><TableCell align="right">Valor</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>
              {vendas.map(v => (
                <TableRow key={v.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatarData(v.data)}</TableCell>
                  <TableCell>{v.cliente ? <Link href={`/painel/clientes/${v.cliente.id}`}>{v.cliente.nome}</Link> : '—'}</TableCell>
                  {gestor && <TableCell><Link href={url({ vendedor: v.vendedor.id })}>{v.vendedor.nome}</Link></TableCell>}
                  <TableCell>{v.pedido ? <Link href={`/painel/pedidos/${v.pedido.id}`}>{v.pedido.codigo}</Link> : <Typography variant="body2" color="text.secondary">{v.observacao}</Typography>}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{brl(v.valor)}</TableCell>
                  <TableCell align="right">{!v.pedidoId && <Button size="small" color="error" onClick={() => excluir(v.id)}>Excluir</Button>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </PainelLayout>
  );
}
