import { Head, router } from '@inertiajs/react';
import { useState } from 'react';
import { Box, Button, Card, CardContent, Chip, Link, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { Add } from '@mui/icons-material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina, Etiqueta, Foto, Vazio } from '@/Components/ui/Basicos';
import { brl } from '@/lib/dinheiro';
import { plural } from '@/lib/pedido';

type Produto = {
  id: number; referencia: string; nome: string; marca: string; categoria: string; ativo: boolean; imperdivel: boolean; preco: number; precoCheio: number; custo: number | null; imagem: string | null;
  variantes: { tamanho: string; estoque: number; reservado: number }[];
};
type Props = {
  indicadores: { modelos: number; pecas: number; aCusto: number; aVenda: number; lucro: number; margem: number; semCusto: number; semFoto: number };
  produtos: Produto[]; total: number; pagina: number; filtros: { q: string | null; filtro: string | null };
};

const FILTROS = [['', 'Todos'], ['sem-foto', 'Sem foto'], ['sem-custo', 'Sem custo'], ['esgotados', 'Esgotados'], ['inativos', 'Inativos']] as const;

function Kpi({ rotulo, valor, detalhe, escuro }: { rotulo: string; valor: string; detalhe: string; escuro?: boolean }) {
  return (
    <Card sx={escuro ? { bgcolor: 'primary.main', color: 'primary.contrastText', borderColor: 'primary.main' } : undefined}><CardContent>
      <Typography variant="overline" sx={{ opacity: 0.8 }}>{rotulo}</Typography>
      <Typography variant="h5" sx={{ fontWeight: 800 }}>{valor}</Typography>
      <Typography variant="caption" sx={{ opacity: 0.75 }}>{detalhe}</Typography>
    </CardContent></Card>
  );
}

/** Porta de src/app/(painel)/painel/produtos/page.tsx. */
export default function Produtos({ indicadores: ind, produtos, total, pagina, filtros }: Props) {
  const [busca, setBusca] = useState(filtros.q ?? '');
  const url = (m: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: filtros.q, filtro: filtros.filtro, ...m })) if (v) p.set(k, v);
    return `/painel/produtos${p.toString() ? `?${p}` : ''}`;
  };
  return (
    <PainelLayout>
      <Head title="Produtos" />
      <CabecalhoPagina sobre="Catálogo e estoque" titulo="Produtos e custos" acoes={<Button variant="contained" startIcon={<Add />} href="/painel/produtos/novo">Novo produto</Button>} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { sm: '1fr 1fr', xl: 'repeat(4, 1fr)' }, gap: 1.5, mb: 4 }}>
        <Kpi rotulo="Peças em estoque" valor={ind.pecas.toLocaleString('pt-BR')} detalhe={`${ind.modelos} modelos ativos · ${ind.semFoto} sem foto`} />
        <Kpi rotulo="Estoque a preço de custo" valor={brl(ind.aCusto)} detalhe={ind.semCusto ? `${plural(ind.semCusto, 'produto', 'produtos')} sem custo` : 'Capital parado em mercadoria'} />
        <Kpi rotulo="Estoque a preço de venda" valor={brl(ind.aVenda)} detalhe="Receita potencial" />
        <Kpi rotulo="Lucro potencial" valor={brl(ind.lucro)} detalhe={`${Math.round(ind.margem * 100)}% de margem média`} escuro />
      </Box>
      <Stack direction={{ xs: 'column', md: 'row' }} sx={{ gap: 1.5, justifyContent: 'space-between', mb: 2 }}>
        <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }}>
          {FILTROS.map(([f, rotulo]) => <Chip key={f} component="a" href={url({ filtro: f || null, pagina: null })} clickable label={rotulo} color={(filtros.filtro ?? '') === f ? 'primary' : 'default'} variant={(filtros.filtro ?? '') === f ? 'filled' : 'outlined'} />)}
        </Stack>
        <Box component="form" onSubmit={e => { e.preventDefault(); router.get(url({ q: busca.trim() || null, pagina: null })); }} sx={{ display: 'flex', gap: 1 }}>
          <TextField value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome, referência ou código" aria-label="Buscar produto" />
          <Button type="submit" variant="contained">Buscar</Button>
        </Box>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{plural(total, 'produto', 'produtos')}</Typography>
      {produtos.length === 0 ? <Vazio>Nenhum produto encontrado.</Vazio> : (
        <TableContainer component={Card}>
          <Table size="small" sx={{ minWidth: 860 }}>
            <TableHead><TableRow><TableCell>Produto</TableCell><TableCell>Preço</TableCell><TableCell>Custo</TableCell><TableCell>Margem</TableCell><TableCell>Estoque</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>
              {produtos.map(p => {
                const margem = p.custo != null && p.preco ? Math.round(((p.preco - p.custo) / p.preco) * 100) : null;
                const cor = margem == null ? 'text.secondary' : margem >= 50 ? 'success.main' : margem >= 30 ? 'secondary.main' : 'error.main';
                const estoque = p.variantes.filter(v => v.estoque > 0).map(v => `${v.tamanho} (${v.estoque}${v.reservado ? `, ${v.reservado} res.` : ''})`).join('  ');
                return (
                  <TableRow key={p.id} hover sx={{ opacity: p.ativo ? 1 : 0.5 }}>
                    <TableCell>
                      <Stack direction="row" sx={{ gap: 1.5, alignItems: 'center' }}>
                        <Foto src={p.imagem} largura={40} />
                        <Box sx={{ minWidth: 0 }}>
                          <Link href={`/painel/produtos/${p.id}`}>{p.nome}</Link>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>{p.referencia} · {p.marca} · {p.categoria} {!p.ativo && <Etiqueta cor="cinza">Inativo</Etiqueta>} {p.imperdivel && <Etiqueta cor="vermelho">Imperdível</Etiqueta>}</Typography>
                        </Box>
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{brl(p.preco)}{p.precoCheio > p.preco && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textDecoration: 'line-through' }}>{brl(p.precoCheio)}</Typography>}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{p.custo != null ? brl(p.custo) : <Box component="span" sx={{ color: 'error.main' }}>—</Box>}</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: cor }}>{margem != null ? `${margem}%` : '—'}</TableCell>
                    <TableCell sx={{ fontSize: 12 }}>{estoque || <Box component="span" sx={{ color: 'error.main' }}>Esgotado</Box>}</TableCell>
                    <TableCell align="right"><Button size="small" href={`/painel/produtos/${p.id}`}>Editar</Button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {total > produtos.length && <Box sx={{ mt: 3, textAlign: 'center' }}><Button variant="outlined" onClick={() => router.get(url({ pagina: String(pagina + 1) }), {}, { preserveScroll: true, preserveState: true })}>Carregar mais</Button></Box>}
    </PainelLayout>
  );
}
