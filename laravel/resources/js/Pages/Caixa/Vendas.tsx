import type { ReactNode } from 'react';
import { Head, usePage } from '@inertiajs/react';
import { Accordion, AccordionDetails, AccordionSummary, Box, Button, Container, Paper, Stack, Typography } from '@mui/material';
import { ArrowBack, WhatsApp } from '@mui/icons-material';
import { ComTema } from '@/tema/ComTema';
import { FotoCheia } from '@/Components/loja/Vitrine';
import { LinkSimples } from '@/Components/loja/LinkSimples';
import { descreverPagamento, rotuloForma, type FormaRegistrada } from '@/lib/caixa';
import { diaDe, formatarData, TZ } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { linkCompartilharWhatsApp } from '@/lib/whatsapp';

type Pagamento = { forma: FormaRegistrada; valor: number; parcelas: number | null; recebido: number | null };
type Venda = { id: string; codigo: string; status: 'confirmado' | 'cancelado'; criadoEm: string; total: number; nomeCliente: string; codigoCupom: string | null; vendedor: string; itens: { quantidade: number; nome: string; tamanho: string; imagem: string | null }[]; pagamentos: Pagamento[] };
type R = {
  dia: string; total: number; vendas: number; pecas: number; ticketMedio: number; troco: number; desfeitas: number; pedidos: Venda[];
  porForma: { forma: string; valor: number; n: number }[]; porVendedor: { nome: string; valor: number; n: number }[];
};

const hora = (d: string) => new Date(d).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const rotulo = { fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' } as const;

/** Vendas do caixa no dia e o fechamento (porta de src/app/(caixa)/caixa/vendas/page.tsx). */
export default function Vendas({ r }: { r: R }) {
  const { usuario, identidade } = usePage().props;
  const hoje = diaDe();
  const meioDia = (d: string) => new Date(`${d}T12:00:00-03:00`);
  const ontem = diaDe(new Date(meioDia(r.dia).getTime() - 86_400_000));
  const amanha = diaDe(new Date(meioDia(r.dia).getTime() + 86_400_000));
  const fechamento = [
    `*Fechamento do caixa · ${formatarData(meioDia(r.dia))}*${usuario?.papel === 'gestor' ? '' : ` · ${usuario?.nome.split(' ')[0]}`}`,
    `${r.vendas} ${r.vendas === 1 ? 'venda' : 'vendas'} · ${r.pecas} peças · *${brl(r.total)}*`,
    '',
    ...r.porForma.map(f => `${rotuloForma(f.forma)}: ${brl(f.valor)} (${f.n})`),
    ...(r.troco > 0 ? [`Troco dado em dinheiro: ${brl(r.troco)}`] : []),
    ...(r.porVendedor.length > 1 ? ['', ...r.porVendedor.map(v => `${v.nome}: ${brl(v.valor)} (${v.n})`)] : []),
    ...(r.desfeitas ? ['', `${r.desfeitas} ${r.desfeitas === 1 ? 'venda desfeita' : 'vendas desfeitas'}`] : []),
  ].join('\n');
  return (
    <ComTema area="painel">
      <Head title="Vendas do dia" />
      <Box sx={{ minHeight: '100dvh', bgcolor: 'marca.creme' }}>
        <Stack component="header" direction="row" spacing={2} sx={{ height: 56, bgcolor: 'marca.marrom-950', color: 'marca.creme', alignItems: 'center', px: { xs: 2, lg: 3 } }}>
          <Box component="img" src={identidade.logoClara.url} alt={identidade.nome} sx={{ height: 36, width: 'auto' }} />
          <Typography sx={{ ...rotulo, color: 'marca.areia', borderLeft: '1px solid rgba(246,242,236,.2)', pl: 2 }}>Vendas do dia</Typography>
          <Button href="/caixa" startIcon={<ArrowBack />} variant="contained" size="small" sx={{ ml: 'auto !important', bgcolor: 'marca.creme', color: 'marca.marrom-950' }}>Voltar ao caixa</Button>
        </Stack>
        <Container maxWidth="lg" sx={{ py: 3, display: 'grid', gap: 3 }}>
          <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
            <Box><Typography sx={{ ...rotulo, color: 'secondary.main' }}>{r.dia === hoje ? 'Hoje' : 'Dia'}</Typography><Typography component="h1" variant="h4">{formatarData(meioDia(r.dia))}</Typography></Box>
            <Stack direction="row" spacing={1} component="nav" aria-label="Escolher o dia">
              <Button href={`/caixa/vendas?dia=${ontem}`} variant="outlined" size="small">← Dia anterior</Button>
              {r.dia !== hoje && <Button href="/caixa/vendas" variant="outlined" size="small">Hoje</Button>}
              {r.dia < hoje && <Button href={`/caixa/vendas?dia=${amanha}`} variant="outlined" size="small">Próximo →</Button>}
            </Stack>
          </Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 1.5 }}>
            <Numero rotulo="Total vendido" valor={brl(r.total)} escuro />
            <Numero rotulo="Vendas" valor={String(r.vendas)} />
            <Numero rotulo="Peças" valor={String(r.pecas)} />
            <Numero rotulo="Ticket médio" valor={brl(r.ticketMedio)} />
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { lg: '1fr 1fr 1.2fr' }, gap: 2, alignItems: 'start' }}>
            <Cartao titulo="Por forma de pagamento">
              {r.porForma.length === 0 ? <Typography variant="body2" color="text.secondary">Nenhuma venda.</Typography> : (
                <Stack spacing={1.5}>
                  {r.porForma.map(f => <Linha key={f.forma} rotulo={<>{rotuloForma(f.forma)} <Box component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>· {f.n}</Box></>} valor={brl(f.valor)} />)}
                  {r.troco > 0 && <Stack direction="row" sx={{ justifyContent: 'space-between', fontSize: 14, color: 'text.secondary', borderTop: 1, borderColor: 'divider', pt: 1 }}><span>Troco dado no dinheiro</span><span>{brl(r.troco)}</span></Stack>}
                </Stack>
              )}
            </Cartao>
            <Cartao titulo="Por vendedora">
              {r.porVendedor.length === 0 ? <Typography variant="body2" color="text.secondary">Nenhuma venda.</Typography> : (
                <Stack spacing={1.5}>{r.porVendedor.map(v => <Linha key={v.nome} rotulo={<>{v.nome} <Box component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>· {v.n}</Box></>} valor={brl(v.valor)} />)}</Stack>
              )}
            </Cartao>
            <Cartao titulo="Fechamento">
              <Box component="pre" sx={{ whiteSpace: 'pre-wrap', fontSize: 14, bgcolor: 'marca.creme', border: 1, borderColor: 'divider', p: 1.5, fontFamily: 'inherit', m: 0, mb: 1.5 }}>{fechamento.replace(/\*/g, '')}</Box>
              <Button data-acao="fechamento" component="a" href={linkCompartilharWhatsApp(fechamento)} target="_blank" rel="noopener" fullWidth variant="contained" color="whatsapp" startIcon={<WhatsApp />} sx={{ height: 48 }}>Enviar o fechamento no WhatsApp</Button>
            </Cartao>
          </Box>
          <Paper variant="outlined">
            <Typography variant="h6" sx={{ px: 2.5, py: 2, borderBottom: 1, borderColor: 'divider' }}>Vendas ({r.pedidos.length})</Typography>
            {r.pedidos.length === 0 ? <Typography sx={{ px: 2.5, py: 5, textAlign: 'center', color: 'text.secondary' }}>Nenhuma venda no caixa neste dia.</Typography> : r.pedidos.map(p => {
              const desfeita = p.status === 'cancelado';
              const pecas = p.itens.reduce((a, i) => a + i.quantidade, 0);
              return (
                <Accordion key={p.id} disableGutters elevation={0} square sx={{ opacity: desfeita ? 0.55 : 1, borderBottom: 1, borderColor: 'divider', '&:before': { display: 'none' } }}>
                  <AccordionSummary sx={{ '& .MuiAccordionSummary-content': { display: 'grid', gridTemplateColumns: { xs: '3.5rem 1fr auto', sm: '3.5rem 1fr 1fr auto' }, gap: 1.5, alignItems: 'center' } }}>
                    <Typography sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{hora(p.criadoEm)}</Typography>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600 }}>{p.codigo}{desfeita && <Box component="span" sx={{ ...rotulo, ml: 1, color: 'error.main' }}>Desfeita</Box>}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap component="div">{p.nomeCliente || 'Consumidor final'} · {pecas} {pecas === 1 ? 'peça' : 'peças'}</Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary" noWrap sx={{ display: { xs: 'none', sm: 'block' } }}>{p.pagamentos.map(g => rotuloForma(g.forma)).join(' + ') || '—'} · {p.vendedor.split(' ')[0]}</Typography>
                    <Typography sx={{ fontWeight: 800 }}>{brl(p.total)}</Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ display: 'grid', gridTemplateColumns: { sm: '1fr auto' }, gap: 2 }}>
                    <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
                      {p.itens.map((i, k) => (
                        <Stack key={k} direction="row" spacing={1} sx={{ alignItems: 'center', fontSize: 14, bgcolor: 'marca.creme', border: 1, borderColor: 'divider', pr: 1.5 }}>
                          <Box sx={{ position: 'relative', width: 36, aspectRatio: '3 / 4', bgcolor: 'marca.bege' }}><FotoCheia src={i.imagem} /></Box>
                          <span>{i.quantidade}× {i.nome.slice(0, 40)} · {i.tamanho}</span>
                        </Stack>
                      ))}
                    </Stack>
                    <Stack spacing={0.5} sx={{ fontSize: 14, textAlign: { sm: 'right' } }}>
                      {p.pagamentos.map((g, k) => <span key={k}>{descreverPagamento(g, brl)}: {brl(g.valor)}</span>)}
                      {p.codigoCupom && <Box component="span" sx={{ color: 'success.main' }}>Cupom {p.codigoCupom}</Box>}
                      <LinkSimples href={`/painel/pedidos/${p.id}`} sx={{ color: 'secondary.main', textDecoration: 'underline' }}>{desfeita ? 'Ver no painel' : 'Ver ou desfazer no painel'}</LinkSimples>
                    </Stack>
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </Paper>
        </Container>
      </Box>
    </ComTema>
  );
}

function Numero({ rotulo: r, valor, escuro = false }: { rotulo: string; valor: string; escuro?: boolean }) {
  return (
    <Paper variant={escuro ? 'elevation' : 'outlined'} elevation={0} sx={{ p: 2.5, bgcolor: escuro ? 'marca.marrom-950' : 'background.paper', color: escuro ? 'marca.creme' : undefined }}>
      <Typography sx={{ ...rotulo, color: escuro ? 'marca.areia' : 'text.secondary' }}>{r}</Typography>
      <Typography sx={{ fontWeight: 800, fontSize: 24, mt: 0.5 }}>{valor}</Typography>
    </Paper>
  );
}

function Cartao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return <Paper variant="outlined" sx={{ p: 2.5 }}><Typography variant="h6" sx={{ mb: 2 }}>{titulo}</Typography>{children}</Paper>;
}

function Linha({ rotulo: r, valor }: { rotulo: ReactNode; valor: string }) {
  return <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 1.5 }}><span>{r}</span><Typography sx={{ fontWeight: 800 }}>{valor}</Typography></Stack>;
}
