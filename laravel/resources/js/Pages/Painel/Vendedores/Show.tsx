import { Head, router, useForm, usePage } from '@inertiajs/react';
import type { ReactNode } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Card, CardContent, LinearProgress, Link, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { ArrowBack, ExpandMore } from '@mui/icons-material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina, Etiqueta, EtiquetaTipo } from '@/Components/ui/Basicos';
import { FormVendedor } from '@/Components/painel/vendedor/FormVendedor';
import { formatarData, nomeDoMes } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { tempoDesde } from '@/lib/atividade';
import { plural } from '@/lib/pedido';
import { celularValido } from '@/lib/telefone';
import { ACOES, type Acao } from '@/lib/equipe';
import { corDaMeta } from '@/lib/metas';

type Props = {
  vendedor: { id: string; nome: string; email: string; telefone: string | null; ativo: boolean; clientes: number; pendentes: number; online: boolean; ultimoAcessoEm: string | null; ultimoLoginEm: string | null; metas: { id: string; mes: string; valor: number }[] };
  meta: number | null; mes: string; proximoMes: string; outros: { id: string; nome: string }[];
  perfil: {
    vendidoMes: number; vendasMes: number; clientes: number; comAcesso: number; compraram: number; nuncaCompraram: number; paradas: number; nAbertos: number;
    melhores: { id: string; nome: string; total: number; ultima: string | null }[];
    abertos: { id: string; codigo: string; tipo: 'compra' | 'condicional'; nomeCliente: string; clienteId: string; total: number; criadoEm: string }[];
    recentes: { id: string; valor: number; data: string; observacao: string | null; cliente: { id: string; nome: string } | null; pedido: { id: string; codigo: string } | null }[];
  };
  acoes: { id: string; tipo: Acao; descricao: string | null; clienteId: string | null; criadoEm: string }[];
};

function Kpi({ rotulo, valor, detalhe, escuro }: { rotulo: string; valor: ReactNode; detalhe: ReactNode; escuro?: boolean }) {
  return <Card sx={escuro ? { bgcolor: 'primary.main', color: 'primary.contrastText' } : undefined}><CardContent><Typography variant="overline" sx={{ opacity: 0.8 }}>{rotulo}</Typography><Typography variant="h5" sx={{ fontWeight: 800 }}>{valor}</Typography><Typography variant="caption" sx={{ opacity: 0.8 }}>{detalhe}</Typography></CardContent></Card>;
}
function Bloco({ titulo, link, children }: { titulo: string; link?: ReactNode; children: ReactNode }) {
  return <Card><CardContent><Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', mb: 1.5 }}><Typography variant="h6">{titulo}</Typography>{link}</Stack>{children}</CardContent></Card>;
}
const Lista = ({ children }: { children: ReactNode }) => <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />} sx={{ fontSize: 14 }}>{children}</Stack>;

/** Perfil do vendedor para o gestor (src/app/(painel)/painel/vendedores/[id]/page.tsx). */
export default function PerfilVendedor({ vendedor: v, meta, mes, proximoMes, outros, perfil: p, acoes }: Props) {
  const { flash } = usePage().props;
  const pct = meta ? (p.vendidoMes / meta) * 100 : 0;
  const primeiro = v.nome.split(' ')[0];
  const formMeta = useForm({ mes: proximoMes, valor: '' });
  const desativar = useForm({ transferirPara: '' });
  const em = formMeta.errors as Record<string, string>;
  const ed = desativar.errors as Record<string, string>;
  return (
    <PainelLayout titulo={v.nome}>
      <Head title={v.nome} />
      <Link href="/painel/vendedores" variant="body2" color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}><ArrowBack fontSize="small" />Vendedores</Link>
      <CabecalhoPagina sobre="Vendedor" titulo={v.nome} acoes={<>
        <Button variant="outlined" href={`/painel/clientes?vendedor=${v.id}`}>Clientes</Button><Button variant="outlined" href={`/painel/pedidos?vendedor=${v.id}`}>Pedidos</Button><Button variant="outlined" href={`/painel/vendas?vendedor=${v.id}`}>Vendas</Button>
      </>}>
        {!v.ativo && <><Etiqueta cor="cinza">Inativo</Etiqueta> · </>}
        <Box component="span" sx={v.online ? { color: 'success.main', fontWeight: 600 } : undefined}>{v.online ? '● Online agora' : v.ultimoAcessoEm ? `Visto ${tempoDesde(v.ultimoAcessoEm)}` : 'Sem acesso registrado'}</Box> · {v.email} · {celularValido(v.telefone) ? `WhatsApp ${v.telefone}` : <Box component="span" sx={{ color: 'error.main' }}>WhatsApp incompleto</Box>}
      </CabecalhoPagina>
      {flash.sucesso && <Alert severity="success" sx={{ mb: 2 }}>{flash.sucesso}</Alert>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { sm: '1fr 1fr', xl: 'repeat(4, 1fr)' }, gap: 1.5 }}>
        <Kpi escuro rotulo={`Vendido em ${nomeDoMes(mes).split(' ')[0].toLowerCase()}`} valor={brl(p.vendidoMes)} detalhe={<><Link href={`/painel/vendas?vendedor=${v.id}`} color="inherit">{plural(p.vendasMes, 'venda', 'vendas')}</Link>{meta ? ` · ${Math.round(pct)}% da meta` : ' · sem meta'}</>} />
        <Kpi rotulo="Clientes" valor={<Link href={`/painel/clientes?vendedor=${v.id}`} color="inherit" underline="hover">{p.clientes}</Link>} detalhe={`${p.comAcesso} com acesso à loja`} />
        <Kpi rotulo="Pedidos em aberto" valor={<Link href={`/painel/pedidos?vendedor=${v.id}`} color="inherit" underline="hover">{p.nAbertos}</Link>} detalhe="Pendentes de confirmar" />
        <Kpi rotulo="Ticket médio do mês" valor={brl(p.vendasMes ? p.vendidoMes / p.vendasMes : 0)} detalhe={`${p.compraram} clientes já compraram`} />
      </Box>
      {meta ? <LinearProgress variant="determinate" value={Math.min(100, pct)} sx={{ mt: 1.5, height: 8, borderRadius: 1, '& .MuiLinearProgress-bar': { bgcolor: corDaMeta(pct) } }} /> : null}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1.3fr 1fr' }, gap: 3, mt: 4, alignItems: 'start' }}>
        <Bloco titulo="Melhores clientes" link={<Link href={`/painel/clientes?vendedor=${v.id}&ordem=total`} variant="body2">Todos por total</Link>}>
          {p.melhores.length === 0 ? <Typography variant="body2" color="text.secondary">Nenhuma cliente de {primeiro} comprou ainda.</Typography> : (
            <Lista>{p.melhores.map(c => (
              <Stack key={c.id} direction="row" sx={{ py: 1.25, justifyContent: 'space-between', gap: 1.5 }}>
                <Box><Link href={`/painel/clientes/${c.id}`} sx={{ fontWeight: 600 }}>{c.nome}</Link><Typography variant="body2" color="text.secondary">{c.ultima ? `Última compra em ${formatarData(c.ultima)}` : ''}</Typography></Box>
                <strong>{brl(c.total)}</strong>
              </Stack>
            ))}</Lista>
          )}
          <Stack direction="row" sx={{ gap: 2.5, flexWrap: 'wrap', mt: 2, pt: 2, borderTop: 1, borderColor: 'divider', fontSize: 14 }}>
            <Link href={`/painel/clientes?vendedor=${v.id}&compra=nunca`}>{plural(p.nuncaCompraram, 'nunca comprou', 'nunca compraram')}</Link>
            <Link href={`/painel/clientes?vendedor=${v.id}&compra=parada`}>{plural(p.paradas, 'sem comprar há 90 dias', 'sem comprar há 90 dias')}</Link>
            <Link href={`/painel/clientes?vendedor=${v.id}&sacola=1`}>com sacola aberta</Link>
          </Stack>
        </Bloco>
        <Stack sx={{ gap: 3 }}>
          <Bloco titulo="Pedidos em aberto" link={<Link href={`/painel/pedidos?vendedor=${v.id}`} variant="body2">Todos</Link>}>
            {p.abertos.length === 0 ? <Typography variant="body2" color="text.secondary">Nenhum pedido em aberto.</Typography> : (
              <Lista>{p.abertos.map(o => (
                <Stack key={o.id} direction="row" sx={{ py: 1.25, justifyContent: 'space-between', gap: 1.5 }}>
                  <Box><Link href={`/painel/pedidos/${o.id}`} sx={{ fontWeight: 700 }}>{o.codigo}</Link> <EtiquetaTipo tipo={o.tipo} /><Typography variant="body2" color="text.secondary"><Link href={`/painel/clientes/${o.clienteId}`} color="inherit">{o.nomeCliente}</Link> · {formatarData(o.criadoEm)}</Typography></Box>
                  <strong>{brl(o.total)}</strong>
                </Stack>
              ))}</Lista>
            )}
          </Bloco>
          <Bloco titulo="Últimas ações" link={<Link href={`/painel/equipe?pessoa=${v.id}#historico`} variant="body2">Histórico</Link>}>
            {v.ultimoLoginEm && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>Último login em {formatarData(v.ultimoLoginEm)}</Typography>}
            {acoes.length === 0 ? <Typography variant="body2" color="text.secondary">Nenhuma ação registrada ainda.</Typography> : (
              <Lista>{acoes.map(a => (
                <Stack key={a.id} direction="row" sx={{ py: 1, justifyContent: 'space-between', gap: 1.5 }}>
                  <Box sx={{ minWidth: 0 }}><strong>{ACOES[a.tipo]?.rotulo ?? a.tipo}</strong>{a.descricao && <Box component="span" sx={{ color: 'text.secondary' }}> · {a.clienteId ? <Link href={`/painel/clientes/${a.clienteId}`} color="inherit">{a.descricao}</Link> : a.descricao}</Box>}</Box>
                  <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>{tempoDesde(a.criadoEm)}</Typography>
                </Stack>
              ))}</Lista>
            )}
          </Bloco>
          <Bloco titulo="Vendas recentes" link={<Link href={`/painel/vendas?vendedor=${v.id}`} variant="body2">Todas do mês</Link>}>
            {p.recentes.length === 0 ? <Typography variant="body2" color="text.secondary">Nenhuma venda ainda.</Typography> : (
              <Lista>{p.recentes.map(x => (
                <Stack key={x.id} direction="row" sx={{ py: 1.25, justifyContent: 'space-between', gap: 1.5 }}>
                  <Box>{x.cliente ? <Link href={`/painel/clientes/${x.cliente.id}`}>{x.cliente.nome}</Link> : '—'}<Typography variant="body2" color="text.secondary">{formatarData(x.data)} · {x.pedido ? <Link href={`/painel/pedidos/${x.pedido.id}`}>{x.pedido.codigo}</Link> : x.observacao}</Typography></Box>
                  <strong>{brl(x.valor)}</strong>
                </Stack>
              ))}</Lista>
            )}
          </Bloco>
        </Stack>
      </Box>

      <Accordion defaultExpanded={!v.ativo} sx={{ mt: 4 }}>
        <AccordionSummary expandIcon={<ExpandMore />}><Typography variant="h6">Dados, metas e acesso</Typography></AccordionSummary>
        <AccordionDetails sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1.3fr 1fr' }, gap: 3 }}>
          <Box><FormVendedor vendedor={v} meta={meta} /></Box>
          <Stack sx={{ gap: 3 }}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>Metas mensais</Typography>
              <Box component="form" onSubmit={e => { e.preventDefault(); formMeta.post(`/painel/vendedores/${v.id}/metas`, { preserveScroll: true, onSuccess: () => formMeta.reset('valor') }); }} sx={{ display: 'grid', gridTemplateColumns: { sm: '1fr 1fr auto' }, gap: 1.5, alignItems: 'start', mb: 2 }}>
                <TextField label="Mês" type="month" value={formMeta.data.mes} onChange={e => formMeta.setData('mes', e.target.value)} error={!!em.mes} helperText={em.mes} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField label="Meta (R$)" placeholder="15000" value={formMeta.data.valor} onChange={e => formMeta.setData('valor', e.target.value)} error={!!em.valor} helperText={em.valor} />
                <Button type="submit" variant="contained" loading={formMeta.processing}>Salvar</Button>
              </Box>
              {v.metas.length === 0 ? <Typography variant="body2" color="text.secondary">Nenhuma meta cadastrada.</Typography> : <Lista>{v.metas.map(m => <Stack key={m.id} direction="row" sx={{ py: 1, justifyContent: 'space-between' }}><span>{nomeDoMes(m.mes)}</span><strong>{brl(m.valor)}</strong></Stack>)}</Lista>}
              <Typography variant="caption" color="text.secondary">Mês sem meta própria usa a meta mais recente anterior.</Typography>
            </Box>
            <Box>
              {v.ativo ? (
                <>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Desativar acesso</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>O vendedor deixa de entrar no painel. Vendas e pedidos continuam registrados.</Typography>
                  <Box component="form" onSubmit={e => { e.preventDefault(); if (confirm(`Desativar ${v.nome}?`)) desativar.post(`/painel/vendedores/${v.id}/desativar`, { preserveScroll: true }); }} sx={{ display: 'grid', gap: 1.5 }}>
                    {(v.clientes > 0 || v.pendentes > 0) && (
                      <TextField select label={`Transferir ${[v.clientes && plural(v.clientes, 'cliente', 'clientes'), v.pendentes && plural(v.pendentes, 'pedido em aberto', 'pedidos em aberto')].filter(Boolean).join(' e ')} para`}
                        value={desativar.data.transferirPara} onChange={e => desativar.setData('transferirPara', e.target.value)} error={!!ed.transferirPara} helperText={ed.transferirPara}>
                        {outros.map(o => <MenuItem key={o.id} value={o.id}>{o.nome}</MenuItem>)}
                      </TextField>
                    )}
                    {ed.erro && <Alert severity="error">{ed.erro}</Alert>}
                    <Box><Button type="submit" variant="outlined" color="error" loading={desativar.processing}>Desativar vendedor</Button></Box>
                  </Box>
                </>
              ) : (
                <><Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Vendedor inativo</Typography><Button variant="contained" color="success" onClick={() => router.post(`/painel/vendedores/${v.id}/reativar`, {}, { preserveScroll: true })}>Reativar acesso</Button></>
              )}
            </Box>
          </Stack>
        </AccordionDetails>
      </Accordion>
    </PainelLayout>
  );
}
