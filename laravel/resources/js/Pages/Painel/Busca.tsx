import { Head, router, usePage } from '@inertiajs/react';
import { useState, type ReactNode } from 'react';
import { Box, Button, Card, Link, Stack, TextField, Typography } from '@mui/material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina, EtiquetaStatus, EtiquetaTipo, Foto, Vazio } from '@/Components/ui/Basicos';
import { formatarData } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';

type Props = {
  q: string;
  resultados: null | {
    totalClientes: number; clientes: { id: string; nome: string; telefone: string; vendedor: string | null }[];
    totalPedidos: number; pedidos: { id: string; codigo: string; tipo: 'compra' | 'condicional'; status: 'pendente' | 'confirmado' | 'cancelado'; nomeCliente: string; criadoEm: string; total: number }[];
    pecas: { id: number; referencia: string; nome: string; preco: number; imagem: string | null; estoque: number }[];
  };
};

function Bloco({ titulo, mais, vazio, children }: { titulo: string; mais: string | null; vazio: boolean; children: ReactNode }) {
  return (
    <Card>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}><Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{titulo}</Typography>{mais && <Link href={mais} variant="caption">Ver todos</Link>}</Stack>
      {vazio ? <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>Nada encontrado.</Typography> : children}
    </Card>
  );
}
const linha = { display: 'block', px: 2, py: 1.25, '&:hover': { bgcolor: 'marca.bege' }, borderTop: 1, borderColor: 'divider', '&:first-of-type': { borderTop: 0 } };

/** Porta de src/app/(painel)/painel/busca/page.tsx. */
export default function Busca({ q, resultados: r }: Props) {
  const gestor = usePage().props.usuario?.papel === 'gestor';
  const [texto, setTexto] = useState(q);
  return (
    <PainelLayout titulo="Busca">
      <Head title="Busca" />
      <CabecalhoPagina sobre="Busca" titulo={q ? `“${q}”` : 'Buscar'}>Clientes por nome, WhatsApp, CPF ou cidade; pedidos pelo código ou pela cliente; peças por nome, referência ou cor.</CabecalhoPagina>
      <Box component="form" onSubmit={e => { e.preventDefault(); router.get('/painel/busca', { q: texto }); }} sx={{ display: 'flex', gap: 1, maxWidth: 560, mb: 4 }}>
        <TextField autoFocus value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar cliente, pedido ou peça…" aria-label="Buscar" />
        <Button type="submit" variant="contained">Buscar</Button>
      </Box>
      {!r ? <Vazio>Digite pelo menos 2 letras.</Vazio> : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xl: 'repeat(3, 1fr)' }, gap: 3, alignItems: 'start' }}>
          <Bloco titulo={`Clientes (${r.totalClientes})`} mais={r.totalClientes ? `/painel/clientes?q=${encodeURIComponent(q)}` : null} vazio={!r.clientes.length}>
            {r.clientes.map(c => <Link key={c.id} href={`/painel/clientes/${c.id}`} underline="none" color="inherit" sx={linha}><Typography variant="body2" sx={{ fontWeight: 600 }}>{c.nome}</Typography><Typography variant="caption" color="text.secondary">{c.telefone}{gestor && c.vendedor ? ` · ${c.vendedor.split(' ')[0]}` : ''}</Typography></Link>)}
          </Bloco>
          <Bloco titulo={`Pedidos (${r.totalPedidos})`} mais={r.totalPedidos ? `/painel/pedidos?status=todos&q=${encodeURIComponent(q)}` : null} vazio={!r.pedidos.length}>
            {r.pedidos.map(p => (
              <Link key={p.id} href={`/painel/pedidos/${p.id}`} underline="none" color="inherit" sx={{ ...linha, display: 'flex', justifyContent: 'space-between', gap: 1.5, alignItems: 'center' }}>
                <Box sx={{ minWidth: 0 }}><Stack direction="row" sx={{ gap: 0.5, alignItems: 'center' }}><strong>{p.codigo}</strong><EtiquetaTipo tipo={p.tipo} /><EtiquetaStatus status={p.status} /></Stack><Typography variant="caption" color="text.secondary" noWrap>{p.nomeCliente} · {formatarData(p.criadoEm)}</Typography></Box>
                <strong>{brl(p.total)}</strong>
              </Link>
            ))}
          </Bloco>
          <Bloco titulo={`Peças (${r.pecas.length}${r.pecas.length === 12 ? '+' : ''})`} mais={null} vazio={!r.pecas.length}>
            {r.pecas.map(p => (
              <Link key={p.id} href={gestor ? `/painel/produtos/${p.id}` : `/produto/${p.referencia}`} underline="none" color="inherit" sx={{ ...linha, display: 'flex', gap: 1.5, alignItems: 'center' }}>
                <Foto src={p.imagem} largura={36} />
                <Box sx={{ flex: 1, minWidth: 0 }}><Typography variant="body2" noWrap>{p.nome}</Typography><Typography variant="caption" color="text.secondary">Ref. {p.referencia} · {p.estoque} em estoque</Typography></Box>
                <strong>{brl(p.preco)}</strong>
              </Link>
            ))}
          </Bloco>
        </Box>
      )}
    </PainelLayout>
  );
}
