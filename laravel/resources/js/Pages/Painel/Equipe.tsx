import type { ReactNode } from 'react';
import { Head, usePage } from '@inertiajs/react';
import { Box, Button, Card, Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina, Vazio } from '@/Components/ui/Basicos';
import { LinhaFiltro, PainelFiltros } from '@/Components/ui/Filtros';
import { LinkSimples } from '@/Components/loja/LinkSimples';
import { tempoDesde } from '@/lib/atividade';
import { formatarData, formatarDataHora, TZ } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { ACOES, duracao, type Acao, type Grupo } from '@/lib/equipe';
import { comFiltros } from '@/lib/url';

type Resumo = { segundos: number; porDia: Record<string, number>; logins: number; clientes: number; pedidos: number; contatos: number; vendasConfirmadas: number; cancelamentos: number; diasAtivos: number };
type Linha = { id: string; name: string; ultimoAcessoEm: string | null; ultimoLoginEm: string | null; online: boolean; resumo: Resumo; vendido: number; vendas: number; carteira: number };
type AcaoLinha = { id: string; tipo: Acao; criadoEm: string; descricao: string | null; clienteId: string | null; pedidoId: string | null; valor: number | null; aparelho: string | null; usuario: { id: string; name: string; papel: string | null } };
type Props = {
  periodo: string; periodos: Record<string, string>; ordem: string; dias: string[]; acao: Acao | null; pessoa: string | null; pagina: number; linhas: Linha[];
  pessoas: { id: string; name: string; ativo: boolean }[]; acoes: AcaoLinha[]; total: number;
};

const ORDENS = { vendido: 'Mais vendido', tempo: 'Mais tempo de uso', acoes: 'Mais ações', acesso: 'Acesso mais recente', nome: 'Nome' } as const;
type Ordem = keyof typeof ORDENS;
const COR_GRUPO: Record<Grupo, { bgcolor: string; color: string }> = {
  acesso: { bgcolor: 'marca.bege', color: 'marca.marrom-900' }, clientes: { bgcolor: 'rgba(109,64,42,.15)', color: 'secondary.main' }, pedidos: { bgcolor: 'rgba(46,37,32,.1)', color: 'marca.marrom-950' },
  contatos: { bgcolor: 'rgba(24,122,72,.15)', color: 'whatsapp.main' }, vendas: { bgcolor: 'rgba(94,107,67,.15)', color: 'marca.oliva' },
};

/** Acompanhamento da equipe (porta de painel/equipe/page.tsx): presença e trabalho de cada vendedor e o histórico de ações. */
export default function Equipe({ periodo, periodos, ordem, dias, acao, pessoa, pagina, linhas, pessoas, acoes, total }: Props) {
  const { usuario } = usePage().props;
  const ord: Ordem = ordem in ORDENS ? (ordem as Ordem) : 'vendido';
  const atual = { periodo: periodo === '7d' ? null : periodo, ordem: ord === 'vendido' ? null : ord, pessoa, acao };
  const url = (m: Record<string, string | null>) => comFiltros('/painel/equipe', atual, m);
  const nAcoes = (l: Linha) => l.resumo.clientes + l.resumo.pedidos + l.resumo.contatos + l.resumo.vendasConfirmadas + l.resumo.cancelamentos;
  const ordenadas = [...linhas].sort((a, b) => ord === 'nome' ? a.name.localeCompare(b.name, 'pt-BR') : ord === 'tempo' ? b.resumo.segundos - a.resumo.segundos : ord === 'acoes' ? nAcoes(b) - nAcoes(a)
    : ord === 'acesso' ? new Date(b.ultimoAcessoEm ?? 0).getTime() - new Date(a.ultimoAcessoEm ?? 0).getTime() : b.vendido - a.vendido);
  const max = {
    segundos: Math.max(1, ...linhas.map(l => l.resumo.segundos)), clientes: Math.max(1, ...linhas.map(l => l.resumo.clientes)), pedidos: Math.max(1, ...linhas.map(l => l.resumo.pedidos)),
    contatos: Math.max(1, ...linhas.map(l => l.resumo.contatos)), vendido: Math.max(1, ...linhas.map(l => l.vendido)), dia: Math.max(1, ...linhas.flatMap(l => Object.values(l.resumo.porDia))),
  };
  const online = linhas.filter(l => l.online).length;
  const porDia = new Map<string, AcaoLinha[]>();
  for (const a of acoes) { const d = new Date(a.criadoEm).toLocaleDateString('sv-SE', { timeZone: TZ }); porDia.set(d, [...(porDia.get(d) ?? []), a]); }
  const kpi = (rotulo: string, valor: ReactNode, detalhe: string, bg?: string) => (
    <Card variant="outlined" sx={{ p: 2.5, bgcolor: bg, color: bg ? 'marca.creme' : undefined }}>
      <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.75 }}>{rotulo}</Typography>
      <Typography sx={{ fontWeight: 800, fontSize: 22 }}>{valor}</Typography><Typography variant="caption" sx={{ opacity: 0.8 }}>{detalhe}</Typography>
    </Card>
  );
  const hist = '#historico';

  return (
    <PainelLayout>
      <Head title="Equipe" />
      <CabecalhoPagina sobre="Acompanhamento" titulo="Equipe">Quem está usando o painel, por quanto tempo e o que cada um fez. Clique no nome para ver o perfil.</CabecalhoPagina>
      <PainelFiltros>
        <LinhaFiltro rotulo="Período" opcoes={Object.keys(periodos).map(k => ({ rotulo: periodos[k], href: url({ periodo: k === '7d' ? null : k }), ativo: periodo === k }))} />
        <LinhaFiltro rotulo="Ordenar por" opcoes={(Object.keys(ORDENS) as Ordem[]).map(k => ({ rotulo: ORDENS[k], href: url({ ordem: k === 'vendido' ? null : k }), ativo: ord === k }))} />
      </PainelFiltros>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', xl: 'repeat(4, 1fr)' }, gap: 1.5 }}>
        {kpi('Online agora', `${online} de ${linhas.length}`, 'Com o painel ou o caixa aberto', online ? 'marca.oliva' : undefined)}
        {kpi('Tempo de uso', duracao(linhas.reduce((a, l) => a + l.resumo.segundos, 0)), `${periodos[periodo].toLowerCase()}, somando a equipe`)}
        {kpi('Ações registradas', linhas.reduce((a, l) => a + nAcoes(l), 0), 'Clientes, pedidos, envios e vendas')}
        {kpi('Vendido', brl(linhas.reduce((a, l) => a + l.vendido, 0)), periodos[periodo], 'marca.marrom-950')}
      </Box>
      <Card variant="outlined" sx={{ mt: 3, overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 980 }}>
          <TableHead><TableRow>{['Vendedor', 'Uso no período', dias.length > 1 ? 'Por dia' : '', 'Clientes novas', 'Pedidos montados', 'Envios e contatos', 'Vendas', 'Cancelados'].map((t, i) => <TableCell key={i} align={i > 2 ? 'right' : 'left'}>{t}</TableCell>)}</TableRow></TableHead>
          <TableBody>
            {ordenadas.map(l => {
              const r = l.resumo;
              return (
                <TableRow key={l.id}>
                  <TableCell>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <Box title={l.online ? 'Online agora' : 'Offline'} sx={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, bgcolor: l.online ? 'marca.oliva' : 'marca.borda-forte' }} />
                      <LinkSimples href={`/painel/vendedores/${l.id}`} sx={{ fontWeight: 600 }}>{l.name}</LinkSimples>
                    </Stack>
                    <Typography variant="caption" color="text.secondary" title={l.ultimoAcessoEm ? formatarDataHora(l.ultimoAcessoEm) : undefined}>
                      {l.online ? 'Online agora' : l.ultimoAcessoEm ? `Visto ${tempoDesde(l.ultimoAcessoEm)}` : 'Sem acesso registrado'}{l.ultimoLoginEm && ` · login ${formatarData(l.ultimoLoginEm)}`}
                    </Typography>
                  </TableCell>
                  <TableCell><Medida valor={r.segundos} max={max.segundos}><strong>{duracao(r.segundos)}</strong></Medida><Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{r.diasAtivos} de {dias.length} {dias.length === 1 ? 'dia' : 'dias'} · {r.logins} {r.logins === 1 ? 'login' : 'logins'}</Typography></TableCell>
                  <TableCell>
                    {dias.length > 1 && <Stack direction="row" sx={{ alignItems: 'flex-end', gap: '1px', height: 32 }} aria-label="Tempo de uso por dia">
                      {dias.map(d => { const s = r.porDia[d]; return <Box key={d} title={`${formatarData(`${d}T12:00:00-03:00`)}: ${s == null ? 'sem uso' : duracao(s)}`} sx={{ flex: 1, minWidth: 3, maxWidth: 12, bgcolor: s == null ? 'marca.borda' : 'secondary.main', height: s == null ? '2px' : `${Math.max(12, (s / max.dia) * 100)}%` }} />; })}
                    </Stack>}
                  </TableCell>
                  <TableCell align="right"><Medida valor={r.clientes} max={max.clientes} direita><Numero n={r.clientes} href={url({ pessoa: l.id, acao: 'cliente_cadastrado' }) + hist} /></Medida><Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{l.carteira} na carteira</Typography></TableCell>
                  <TableCell align="right"><Medida valor={r.pedidos} max={max.pedidos} direita><Numero n={r.pedidos} href={url({ pessoa: l.id, acao: 'pedido_criado' }) + hist} /></Medida></TableCell>
                  <TableCell align="right"><Medida valor={r.contatos} max={max.contatos} direita><Numero n={r.contatos} href={url({ pessoa: l.id, acao: null }) + hist} /></Medida></TableCell>
                  <TableCell align="right"><Medida valor={l.vendido} max={max.vendido} direita><strong>{brl(l.vendido)}</strong></Medida><Typography variant="caption" sx={{ display: 'block' }}><LinkSimples href={`/painel/vendas?vendedor=${l.id}`} sx={{ color: 'text.secondary' }}>{l.vendas} {l.vendas === 1 ? 'venda' : 'vendas'}</LinkSimples></Typography></TableCell>
                  <TableCell align="right" sx={{ color: r.cancelamentos ? 'error.main' : 'text.secondary' }}>{r.cancelamentos || '—'}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {linhas.length === 0 && <Box sx={{ p: 3 }}><Vazio>Nenhum vendedor ativo.</Vazio></Box>}
      </Card>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>Uso: tempo com o painel ou o caixa aberto e visível na tela (aba escondida não conta). Vendas: o que foi creditado ao vendedor no período, como nas metas. Envios e contatos: seleções enviadas, cupons, convites e conversas abertas no WhatsApp pelo painel.</Typography>

      <Box component="section" id="historico" sx={{ mt: 5, scrollMarginTop: 16 }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
          <Typography component="h2" variant="h5">Histórico de ações</Typography>
          <Typography variant="body2" color="text.secondary">{total} {total === 1 ? 'ação' : 'ações'} · {periodos[periodo].toLowerCase()}</Typography>
        </Stack>
        <PainelFiltros limpar={pessoa || acao ? url({ pessoa: null, acao: null }) + hist : null}>
          <LinhaFiltro rotulo="Pessoa" opcoes={[
            { rotulo: 'Toda a equipe', href: url({ pessoa: null }) + hist, ativo: !pessoa },
            ...(usuario ? [{ rotulo: `${usuario.nome.split(' ')[0]} (você)`, href: url({ pessoa: usuario.id }) + hist, ativo: pessoa === usuario.id }] : []),
            ...pessoas.map(p => ({ rotulo: p.name.split(' ')[0] + (p.ativo ? '' : ' (inativo)'), href: url({ pessoa: p.id }) + hist, ativo: pessoa === p.id })),
          ]} />
          <LinhaFiltro rotulo="Ação" opcoes={[{ rotulo: 'Todas as ações', href: url({ acao: null }) + hist, ativo: !acao }, ...(Object.keys(ACOES) as Acao[]).map(k => ({ rotulo: ACOES[k].rotulo, href: url({ acao: k }) + hist, ativo: acao === k }))]} />
        </PainelFiltros>
        {acoes.length === 0 ? <Vazio>Nenhuma ação com esses filtros no período.</Vazio> : (
          <Stack spacing={2.5}>
            {[...porDia.entries()].map(([d, lista]) => (
              <Box key={d}>
                <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'text.secondary', mb: 1 }}>{formatarData(`${d}T12:00:00-03:00`)}</Typography>
                <Card variant="outlined">
                  {lista.map((a, i) => {
                    const info = ACOES[a.tipo] ?? { rotulo: a.tipo, grupo: 'acesso' as Grupo };
                    return (
                      <Box key={a.id} sx={{ display: 'grid', gridTemplateColumns: { xs: '3.5rem minmax(0,1fr)', sm: '3.5rem 9rem 10.5rem minmax(0,1fr) auto' }, columnGap: 1.5, rowGap: 0.5, px: 2, py: 1.25, alignItems: 'center', fontSize: 14, borderTop: i ? 1 : 0, borderColor: 'divider' }}>
                        <Box sx={{ color: 'text.secondary' }}>{new Date(a.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ })}</Box>
                        <LinkSimples href={url({ pessoa: a.usuario.id }) + hist} sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.usuario.name.split(' ')[0]}{a.usuario.papel === 'gestor' ? ' · gestor' : ''}</LinkSimples>
                        <Chip size="small" label={info.rotulo} sx={{ justifySelf: 'start', gridColumn: { xs: 2, sm: 'auto' }, fontWeight: 600, borderRadius: 1, ...COR_GRUPO[info.grupo] }} />
                        <Box sx={{ minWidth: 0, gridColumn: { xs: 2, sm: 'auto' }, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.clienteId ? <LinkSimples href={`/painel/clientes/${a.clienteId}`}>{a.descricao ?? 'Ver cliente'}</LinkSimples> : a.descricao}
                          {a.pedidoId && <> · <LinkSimples href={`/painel/pedidos/${a.pedidoId}`} sx={{ color: 'text.secondary', textDecoration: 'underline' }}>pedido</LinkSimples></>}
                          {a.aparelho && a.tipo === 'login' && <Box component="span" sx={{ color: 'text.secondary' }}> no {a.aparelho}</Box>}
                        </Box>
                        <Box sx={{ gridColumn: { xs: 2, sm: 'auto' }, textAlign: { sm: 'right' }, fontWeight: 700, whiteSpace: 'nowrap' }}>{a.valor != null ? brl(a.valor) : ''}</Box>
                      </Box>
                    );
                  })}
                </Card>
              </Box>
            ))}
          </Stack>
        )}
        {total > acoes.length && <Box sx={{ mt: 3, textAlign: 'center' }}><Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Mostrando {acoes.length} de {total}</Typography><Button variant="outlined" href={url({ pagina: String(pagina + 1) }) + hist}>Carregar mais</Button></Box>}
      </Box>
    </PainelLayout>
  );
}

function Medida({ valor, max, direita, children }: { valor: number; max: number; direita?: boolean; children: ReactNode }) {
  const pct = valor > 0 ? Math.max(6, (valor / max) * 100) : 0;
  return (
    <Box sx={{ position: 'relative', display: 'inline-flex', minWidth: 96, justifyContent: direita ? 'flex-end' : 'flex-start' }}>
      <Box aria-hidden sx={{ position: 'absolute', top: 0, bottom: 0, [direita ? 'right' : 'left']: 0, width: `${pct}%`, bgcolor: 'rgba(109,64,42,.12)' }} />
      <Box component="span" sx={{ position: 'relative', px: 1, py: 0.5 }}>{children}</Box>
    </Box>
  );
}

function Numero({ n, href }: { n: number; href: string }) {
  return n ? <LinkSimples href={href} sx={{ fontWeight: 700 }}>{n}</LinkSimples> : <Box component="span" sx={{ color: 'text.secondary' }}>—</Box>;
}
