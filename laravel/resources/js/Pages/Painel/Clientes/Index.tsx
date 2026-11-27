import { Head, router, usePage } from '@inertiajs/react';
import { useState } from 'react';
import { Box, Button, Card, Link, Stack, TextField, Typography } from '@mui/material';
import { Add } from '@mui/icons-material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina, Vazio } from '@/Components/ui/Basicos';
import { LinhaFiltro, PainelFiltros } from '@/Components/ui/Filtros';
import { comFiltros } from '@/lib/url';
import { formatarData, formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { tempoDesde } from '@/lib/atividade';
import { linkWhatsApp } from '@/lib/whatsapp';
import { nomeDaLoja } from '@/lib/loja';

type Cliente = {
  id: string; nome: string; telefone: string; cidade: string | null; temConta: boolean; sacola: boolean; ultimoAcessoEm: string | null; pendentes: number;
  vendedor: { id: string; nome: string }; comprado: number | null; ultimaCompra: string | null;
};
type Filtros = Record<'q' | 'vendedor' | 'compra' | 'acesso' | 'recentes' | 'sacola' | 'ordem' | 'ver', string | null>;
type Props = { clientes: Cliente[]; total: number; pagina: number; agrupar: boolean; filtros: Filtros; vendedores: { id: string; nome: string; ativo: boolean; n: number }[] };

const COMPRAS = [['nunca', 'Nunca compraram'], ['recente', 'Compraram em 30 dias'], ['parada', 'Sem comprar há 90 dias']] as const;
const ORDENS = [['nome', 'Nome'], ['total', 'Total comprado'], ['compra', 'Última compra'], ['acesso', 'Último acesso']] as const;
const COLUNAS = { lg: 'minmax(0,2fr) minmax(0,1fr) 7rem 7rem 7rem 16rem' };

/** Porta de src/app/(painel)/painel/clientes/page.tsx. */
export default function Clientes({ clientes, total, pagina, agrupar, filtros, vendedores }: Props) {
  const gestor = usePage().props.usuario?.papel === 'gestor';
  const [busca, setBusca] = useState(filtros.q ?? '');
  const url = (mudar: Record<string, string | null>) => comFiltros('/painel/clientes', filtros, mudar);
  const algumFiltro = Object.entries(filtros).some(([k, v]) => v && k !== 'ordem' && k !== 'ver');
  const vendedorAtual = vendedores.find(v => v.id === filtros.vendedor);
  const grupos = agrupar ? vendedores.map(v => ({ v, lista: clientes.filter(c => c.vendedor.id === v.id) })).filter(g => g.lista.length) : [{ v: null, lista: clientes }];

  return (
    <PainelLayout>
      <Head title="Clientes" />
      <CabecalhoPagina sobre={`${total} ${total === 1 ? 'cliente' : 'clientes'}${vendedorAtual ? ` de ${vendedorAtual.nome}` : ''}`}
        titulo={gestor ? (vendedorAtual ? `Clientes de ${vendedorAtual.nome.split(' ')[0]}` : 'Todos os clientes') : 'Meus clientes'}
        acoes={<>
          {vendedorAtual && <Button variant="outlined" href={`/painel/vendedores/${vendedorAtual.id}`}>Perfil de {vendedorAtual.nome.split(' ')[0]}</Button>}
          <Button variant="contained" startIcon={<Add />} href="/painel/clientes/novo">Novo cliente</Button>
        </>} />
      <Box component="form" onSubmit={e => { e.preventDefault(); router.get(url({ q: busca.trim() || null })); }} sx={{ display: 'flex', gap: 1, mb: 2, maxWidth: 560 }}>
        <TextField value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome, WhatsApp, CPF, cidade ou endereço" aria-label="Buscar cliente" />
        <Button type="submit" variant="contained">Buscar</Button>
      </Box>
      <PainelFiltros limpar={algumFiltro ? '/painel/clientes' : null}>
        {gestor && <LinhaFiltro rotulo="Vendedor" opcoes={[
          { rotulo: 'Todos', href: url({ vendedor: null }), ativo: !filtros.vendedor, n: vendedores.reduce((a, v) => a + v.n, 0) },
          ...vendedores.map(v => ({ rotulo: v.nome.split(' ')[0] + (v.ativo ? '' : ' (inativo)'), href: url({ vendedor: v.id, ver: null }), ativo: filtros.vendedor === v.id, n: v.n })),
        ]} />}
        <LinhaFiltro rotulo="Compras" opcoes={[{ rotulo: 'Todas as clientes', href: url({ compra: null }), ativo: !filtros.compra }, ...COMPRAS.map(([k, r]) => ({ rotulo: r, href: url({ compra: k }), ativo: filtros.compra === k }))]} />
        <LinhaFiltro rotulo="Na loja" opcoes={[
          { rotulo: 'Com e sem acesso', href: url({ acesso: null, recentes: null, sacola: null }), ativo: !filtros.acesso && !filtros.recentes && !filtros.sacola },
          { rotulo: 'Com acesso à loja', href: url({ acesso: 'com', recentes: null, sacola: null }), ativo: filtros.acesso === 'com' && !filtros.recentes && !filtros.sacola },
          { rotulo: 'Sem acesso à loja', href: url({ acesso: 'sem', recentes: null, sacola: null }), ativo: filtros.acesso === 'sem' },
          { rotulo: 'Acessaram em 7 dias', href: url({ acesso: null, recentes: '1', sacola: null }), ativo: !!filtros.recentes && !filtros.sacola },
          { rotulo: 'Com sacola aberta', href: url({ acesso: null, recentes: null, sacola: '1' }), ativo: !!filtros.sacola },
        ]} />
        <LinhaFiltro rotulo="Ordenar por" opcoes={ORDENS.map(([k, r]) => ({ rotulo: r, href: url({ ordem: k === 'nome' ? null : k }), ativo: (filtros.ordem ?? 'nome') === k }))} />
        {gestor && !filtros.vendedor && <LinhaFiltro rotulo="Mostrar" opcoes={[{ rotulo: 'Lista única', href: url({ ver: null }), ativo: !agrupar }, { rotulo: 'Agrupada por vendedor', href: url({ ver: 'vendedor' }), ativo: agrupar }]} />}
      </PainelFiltros>

      {clientes.length === 0 ? <Vazio>{algumFiltro ? 'Nenhum cliente com esses filtros.' : 'Nenhum cliente cadastrado ainda.'}</Vazio> : (
        <Stack sx={{ gap: 3 }}>
          {grupos.map(({ v, lista }) => (
            <Box component="section" key={v?.id ?? 'todos'}>
              {v && (
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                  <Typography variant="h6"><Link href={`/painel/vendedores/${v.id}`} color="inherit">{v.nome}</Link></Typography>
                  <Typography variant="body2" color="text.secondary">{v.n || lista.length} clientes · <Link href={url({ vendedor: v.id, ver: null })}>ver só os de {v.nome.split(' ')[0]}</Link></Typography>
                </Stack>
              )}
              <Card>
                <Box sx={{ display: { xs: 'none', lg: 'grid' }, gridTemplateColumns: COLUNAS.lg, gap: 2, px: 2.5, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                  {['Cliente', gestor ? 'Vendedor' : 'Na loja', 'Comprado', 'Última compra', 'Último acesso', ''].map((t, i) => <Typography key={i} variant="overline" color="text.secondary" sx={{ fontSize: 10, textAlign: i === 2 ? 'right' : 'left' }}>{t}</Typography>)}
                </Box>
                {lista.map(c => (
                  <Box key={c.id} sx={{ display: 'grid', gridTemplateColumns: { lg: COLUNAS.lg }, gap: 2, rowGap: 0.5, px: 2.5, py: 1.5, alignItems: 'center', fontSize: 14, '& + &': { borderTop: 1, borderColor: 'divider' } }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Link href={`/painel/clientes/${c.id}`} sx={{ fontWeight: 600 }}>{c.nome}</Link>
                      <Typography variant="body2" color="text.secondary" noWrap>{c.telefone}{c.cidade ? ` · ${c.cidade}` : ''}</Typography>
                      {c.pendentes > 0 && <Link href={`/painel/pedidos?cliente=${c.id}`} variant="caption" color="secondary">{c.pendentes} {c.pendentes === 1 ? 'pedido em aberto' : 'pedidos em aberto'}</Link>}
                    </Box>
                    <Box sx={{ minWidth: 0, color: 'text.secondary' }}>
                      {gestor && <Link href={`/painel/vendedores/${c.vendedor.id}`}>{c.vendedor.nome}</Link>}
                      <Typography variant="caption" sx={{ display: 'block' }}>{c.temConta ? <Box component="span" sx={{ color: 'success.main' }}>Acesso à loja</Box> : 'Sem acesso à loja'}{c.sacola && <Box component="span" sx={{ color: 'secondary.main' }}> · sacola aberta</Box>}</Typography>
                    </Box>
                    <Box sx={{ textAlign: { lg: 'right' }, fontWeight: 700 }}>{c.comprado ? brl(c.comprado) : '—'}</Box>
                    <Box sx={{ color: 'text.secondary' }}>{c.ultimaCompra ? formatarData(c.ultimaCompra) : 'Sem compras'}</Box>
                    <Box sx={{ color: 'text.secondary' }} title={c.ultimoAcessoEm ? formatarDataHora(c.ultimoAcessoEm) : undefined}>{c.temConta ? tempoDesde(c.ultimoAcessoEm) : '—'}</Box>
                    <Stack direction="row" sx={{ gap: 1, justifyContent: { lg: 'flex-end' } }}>
                      {c.telefone && <Button size="small" variant="outlined" href={linkWhatsApp(c.telefone, `Olá, ${c.nome.split(' ')[0]}! Aqui é da ${nomeDaLoja()}.`)} target="_blank" rel="noopener">WhatsApp</Button>}
                      <Button size="small" variant="contained" color="success" href={`/painel/pedidos/novo?cliente=${c.id}`}>Montar pedido</Button>
                    </Stack>
                  </Box>
                ))}
              </Card>
            </Box>
          ))}
        </Stack>
      )}
      {total > clientes.length && (
        <Box sx={{ mt: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Mostrando {clientes.length} de {total}</Typography>
          <Button variant="outlined" onClick={() => router.get(url({ pagina: String(pagina + 1) }), {}, { preserveScroll: true, preserveState: true })}>Carregar mais</Button>
        </Box>
      )}
    </PainelLayout>
  );
}
