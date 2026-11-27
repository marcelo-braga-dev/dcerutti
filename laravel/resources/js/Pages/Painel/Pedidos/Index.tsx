import { Head, router, usePage } from '@inertiajs/react';
import { useState } from 'react';
import { Alert, Box, Button, Card, Chip, InputAdornment, Link, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { Add, ChevronRight, PersonOutlined, Schedule, Search, StorefrontOutlined, PointOfSaleOutlined } from '@mui/icons-material';
import PainelLayout from '@/Layouts/PainelLayout';
import { BotaoWhatsApp, CabecalhoPagina, Etiqueta, EtiquetaStatus, EtiquetaTipo, Foto, Vazio } from '@/Components/ui/Basicos';
import { LinhaFiltro, PainelFiltros } from '@/Components/ui/Filtros';
import { comFiltros } from '@/lib/url';
import { formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { diasAte, expiraEm, prazoVencido, textoCancelamento, valoresDoPedido } from '@/lib/pedido';
import { tempoDesde } from '@/lib/atividade';
import { linkWhatsApp, mensagemContato } from '@/lib/whatsapp';
import type { ResumoPedido, StatusPedido } from '@/types/pedido';

type Filtros = { status: StatusPedido | 'todos'; q: string | null; vendedor: string | null; cliente: string | null; pagina: number };
type Props = {
  pedidos: ResumoPedido[]; contagens: Record<StatusPedido, number>; total: number; filtros: Filtros;
  cliente: { id: string; nome: string } | null; vendedores: { id: string; nome: string }[]; diasExpiracao: number;
};

const ABAS: [StatusPedido | 'todos', string][] = [['pendente', 'Pendentes'], ['confirmado', 'Confirmados'], ['cancelado', 'Cancelados'], ['todos', 'Todos']];
const maisDeUmDia = (d: Date) => Date.now() - d.getTime() > 86_400_000;

/** Porta de src/app/(painel)/painel/pedidos/page.tsx. */
export default function Pedidos({ pedidos, contagens, total, filtros, cliente, vendedores, diasExpiracao }: Props) {
  const gestor = usePage().props.usuario?.papel === 'gestor';
  const [busca, setBusca] = useState(filtros.q ?? '');
  const atual = { status: filtros.status, q: filtros.q, vendedor: filtros.vendedor, cliente: filtros.cliente };
  const url = (mudar: Record<string, string | null>) => comFiltros('/painel/pedidos', atual, mudar);
  const n = (s: StatusPedido | 'todos') => (s === 'todos' ? contagens.pendente + contagens.confirmado + contagens.cancelado : contagens[s]);
  const comData = pedidos.map(p => ({ ...p, criado: new Date(p.criadoEm) }));
  const vencidos = comData.filter(p => p.status === 'pendente' && prazoVencido({ status: p.status, criadoEm: p.criado }, diasExpiracao)).length;
  const esperandoMuito = comData.filter(p => p.status === 'pendente' && maisDeUmDia(p.criado)).length;

  return (
    <PainelLayout>
      <Head title="Pedidos" />
      <CabecalhoPagina sobre="Loja online e seleções" titulo="Pedidos" acoes={<Button variant="contained" startIcon={<Add />} href="/painel/pedidos/novo">Novo pedido</Button>} />
      <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1.5, mb: 2, justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
        <Tabs value={filtros.status} variant="scrollable" allowScrollButtonsMobile aria-label="Situação dos pedidos">
          {ABAS.map(([s, rotulo]) => (
            <Tab key={s} value={s} href={url({ status: s })} label={<Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>{rotulo}<Chip size="small" label={n(s)} sx={{ height: 20 }} /></Stack>} />
          ))}
        </Tabs>
        <Box component="form" onSubmit={e => { e.preventDefault(); router.get(url({ q: busca.trim() || null })); }} sx={{ display: 'flex', gap: 1, width: { xs: '100%', sm: 'auto' } }}>
          <TextField value={busca} onChange={e => setBusca(e.target.value)} placeholder="Código ou cliente" aria-label="Buscar pedido" fullWidth={false}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> } }} sx={{ flex: 1, minWidth: { sm: 240 } }} />
          <Button type="submit" variant="contained">Buscar</Button>
        </Box>
      </Stack>

      {(gestor || cliente) && (
        <PainelFiltros limpar={filtros.vendedor || cliente ? url({ vendedor: null, cliente: null }) : null}>
          {gestor && (
            <LinhaFiltro rotulo="Vendedor" opcoes={[
              { rotulo: 'Todos', href: url({ vendedor: null }), ativo: !filtros.vendedor },
              ...vendedores.map(v => ({ rotulo: v.nome.split(' ')[0], href: url({ vendedor: v.id }), ativo: filtros.vendedor === v.id })),
            ]} />
          )}
          {cliente && <Typography variant="body2">Só os pedidos de <Link href={`/painel/clientes/${cliente.id}`} sx={{ fontWeight: 600 }}>{cliente.nome}</Link></Typography>}
        </PainelFiltros>
      )}

      {(vencidos > 0 || esperandoMuito > 0) && (
        <Alert severity="warning" sx={{ mb: 1.5 }} role="status">
          {vencidos > 0 && <><strong>{vencidos}</strong> com prazo vencido{esperandoMuito > 0 ? ' · ' : ''}</>}
          {esperandoMuito > 0 && <><strong>{esperandoMuito}</strong> esperando há mais de 1 dia</>}
          {' '}— responda primeiro: a cliente está esperando.
        </Alert>
      )}

      {pedidos.length === 0 ? (
        <Vazio>Nenhum pedido {filtros.status !== 'todos' ? ABAS.find(a => a[0] === filtros.status)![1].toLowerCase() : ''}.</Vazio>
      ) : (
        <Stack component="ul" sx={{ gap: 1, p: 0, m: 0, listStyle: 'none' }}>
          {comData.map(p => {
            const ativos = p.itens.filter(i => i.situacao !== 'devolvido');
            const pecas = ativos.reduce((t, i) => t + i.quantidade, 0);
            const fim = p.status === 'pendente' ? expiraEm(p.criado, diasExpiracao) : null;
            const vencido = p.status === 'pendente' && prazoVencido({ status: p.status, criadoEm: p.criado }, diasExpiracao);
            const dias = fim ? diasAte(fim) : null;
            const esperando = p.status === 'pendente' && maisDeUmDia(p.criado);
            const faixa = vencido ? 'error.main' : p.status === 'pendente' ? (esperando ? 'secondary.main' : 'marca.areia') : p.status === 'confirmado' ? 'success.main' : 'marca.borda-forte';
            const Origem = p.origem === 'balcao' ? PointOfSaleOutlined : p.origem === 'vendedor' ? PersonOutlined : StorefrontOutlined;
            const cancelamento = p.status === 'cancelado' ? textoCancelamento(p.motivoCancelamento, false) : null;
            return (
              <Card component="li" key={p.id} sx={{
                position: 'relative', pl: 2, pr: 1.5, py: 1.25, display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto', alignItems: 'center', gap: 2,
                borderColor: vencido ? 'error.light' : 'divider', opacity: p.status === 'cancelado' ? 0.7 : 1, '&:hover': { borderColor: 'primary.main' },
              }}>
                <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, bgcolor: faixa }} aria-hidden />
                <Stack direction="row" sx={{ width: { xs: 72, sm: 84 } }} aria-hidden>
                  {ativos.slice(0, 3).map((i, k) => <Foto key={i.id} src={i.imagem} largura={38} sx={{ ml: k ? -2 : 0, outline: '2px solid', outlineColor: 'background.paper', zIndex: 3 - k }} />)}
                </Stack>
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" sx={{ gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Link href={`/painel/pedidos/${p.id}`} underline="none" sx={{ fontWeight: 800, color: 'primary.main', '&::after': { content: '""', position: 'absolute', inset: 0 } }}>{p.codigo}</Link>
                    <EtiquetaTipo tipo={p.tipo} />
                    {filtros.status === 'todos' && <EtiquetaStatus status={p.status} />}
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                      <Origem sx={{ fontSize: 14 }} />{p.origem === 'vendedor' ? 'Seleção' : p.origem === 'balcao' ? 'Na loja' : 'Online'}
                    </Typography>
                    {p.pagamentoSituacao === 'pago' && <Etiqueta cor="oliva">Pago</Etiqueta>}
                    {vencido && <Etiqueta cor="vermelho">Prazo vencido</Etiqueta>}
                    {!vencido && dias != null && dias <= 2 && <Etiqueta cor="vermelho" sx={{ bgcolor: 'transparent', color: 'error.main', border: 1 }}>{dias ? `Vence em ${dias} dia${dias === 1 ? '' : 's'}` : 'Vence hoje'}</Etiqueta>}
                    {cancelamento && <Typography variant="caption" color="text.secondary">{cancelamento}</Typography>}
                  </Stack>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    <Box component="strong" sx={{ color: 'text.primary', fontWeight: 600 }}>{p.nomeCliente}</Box>
                    {` · ${pecas} ${pecas === 1 ? 'peça' : 'peças'} · `}
                    <Box component="span" sx={esperando ? { color: 'secondary.main', fontWeight: 600 } : undefined}>
                      {p.status === 'pendente' ? <><Schedule sx={{ fontSize: 14, verticalAlign: '-2px' }} /> {tempoDesde(p.criado)}</> : formatarDataHora(p.criado)}
                    </Box>
                    {gestor && ` · ${p.vendedor.nome?.split(' ')[0] ?? ''}`}
                  </Typography>
                </Box>
                <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
                  <Typography sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{brl(valoresDoPedido(p).total)}</Typography>
                  {p.telefoneCliente && p.status === 'pendente' && <BotaoWhatsApp href={linkWhatsApp(p.telefoneCliente, mensagemContato(p.nomeCliente, p.tipo, p.codigo))} rotulo={`WhatsApp de ${p.nomeCliente}`} />}
                  <ChevronRight sx={{ display: { xs: 'none', sm: 'block' }, color: 'text.secondary' }} />
                </Stack>
              </Card>
            );
          })}
        </Stack>
      )}
      {total > pedidos.length && (
        <Box sx={{ mt: 3, textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>Mostrando {pedidos.length} de {total}</Typography>
          <Button variant="outlined" onClick={() => router.get(url({ pagina: String(filtros.pagina + 1) }), {}, { preserveScroll: true, preserveState: true })}>Carregar mais</Button>
        </Box>
      )}
    </PainelLayout>
  );
}
