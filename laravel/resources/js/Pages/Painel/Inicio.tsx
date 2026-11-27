import { Head, usePage } from '@inertiajs/react';
import { useState, type ReactNode } from 'react';
import { Avatar, Badge, Box, Button, Card, CardActionArea, CardContent, Chip, LinearProgress, Link, Stack, Typography } from '@mui/material';
import { AutoAwesome, Check, EmojiEvents, Insights, PersonAdd, PointOfSale, ReceiptLong, Timeline } from '@mui/icons-material';
import PainelLayout from '@/Layouts/PainelLayout';
import { BotaoWhatsApp, Foto, Vazio } from '@/Components/ui/Basicos';
import { formatarData, nomeDoMes } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { formatarTelefone } from '@/lib/telefone';
import { valoresDoPedido } from '@/lib/pedido';
import { tempoDesde } from '@/lib/atividade';
import { linkCompartilharWhatsApp, linkWhatsApp, mensagemContato, mensagemConvite } from '@/lib/whatsapp';
import { nomeDaLoja } from '@/lib/loja';
import { corDaMeta } from '@/lib/metas';
import type { ResumoPedido } from '@/types/pedido';

type Linha = { id: string; nome: string; clientes: number; meta: number; valor: number; n: number; numero: { apelido: string; telefone: string } | null };
type Props = {
  mes: string; ranking: Linha[]; totalVendido: number; totalVendas: number; pendentes: number; aResponder: ResumoPedido[];
  recentes: { id: string; valor: number; data: string; observacao: string | null; cliente: { id: string; nome: string } | null; vendedor: string }[];
  interessados: { id: string; nome: string; telefone: string; ultimoAcessoEm: string | null; vendedor: string | null; motivos: string[] }[] | null; linkConvite: string | null;
};

function Anel({ pct }: { pct: number }) {
  const r = 42, volta = 2 * Math.PI * r, cheio = Math.min(100, Math.max(0, pct));
  return (
    <Box role="img" aria-label={`${Math.round(pct)}% da meta`} sx={{ position: 'relative', width: { xs: 112, sm: 128 }, height: { xs: 112, sm: 128 }, flexShrink: 0 }}>
      <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="9" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={pct >= 100 ? '#86efac' : '#ddcdb3'} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(cheio / 100) * volta} ${volta}`} />
      </svg>
      <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}><Box><Typography sx={{ fontSize: 24, fontWeight: 800 }}>{Math.round(pct)}%</Typography><Typography variant="caption" sx={{ color: 'marca.areia' }}>da meta</Typography></Box></Box>
    </Box>
  );
}

function Numero({ icone, rotulo, valor, detalhe, href, alerta }: { icone: ReactNode; rotulo: string; valor: ReactNode; detalhe?: ReactNode; href?: string; alerta?: boolean }) {
  const corpo = (
    <CardContent>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}><Typography variant="body2" color="text.secondary">{rotulo}</Typography><Avatar variant="rounded" sx={{ width: 36, height: 36, bgcolor: alerta ? 'rgba(227,38,27,.1)' : 'background.default', color: alerta ? 'imperdivel.main' : 'secondary.main' }}>{icone}</Avatar></Stack>
      <Typography sx={{ mt: 1, fontSize: { xs: 20, sm: 27 }, fontWeight: 800 }} noWrap>{valor}</Typography>
      {detalhe && <Typography variant="caption" sx={{ color: alerta ? 'imperdivel.main' : 'text.secondary', fontWeight: alerta ? 500 : 400 }}>{detalhe}</Typography>}
    </CardContent>
  );
  return <Card sx={{ borderColor: alerta ? 'rgba(227,38,27,.3)' : 'divider', borderRadius: 4 }}>{href ? <CardActionArea href={href}>{corpo}</CardActionArea> : corpo}</Card>;
}

function Convite({ link, nome }: { link: string; nome: string }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(link); } catch { prompt('Copie seu link:', link); }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };
  return (
    <Box sx={{ bgcolor: 'marca.bege', p: 2.5, borderRadius: 3, display: 'grid', gap: 1.5 }}>
      <Typography variant="overline" color="secondary">Seu link de convite</Typography>
      <Typography variant="body2" color="text.secondary">Quem se cadastrar por este link fica vinculado a você e os pedidos chegam no seu WhatsApp.</Typography>
      <Box component="code" sx={{ fontSize: 13, bgcolor: 'background.paper', px: 1.5, py: 1, wordBreak: 'break-all', borderRadius: 1 }}>{link}</Box>
      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
        <Button variant="contained" size="small" onClick={copiar}>{copiado ? 'Link copiado ✓' : 'Copiar link'}</Button>
        <Button variant="contained" color="success" size="small" href={linkCompartilharWhatsApp(mensagemConvite(nome, link))} target="_blank" rel="noopener" data-acao="convite">Enviar no WhatsApp</Button>
      </Stack>
    </Box>
  );
}

/** Início do painel (src/app/(painel)/painel/page.tsx). */
export default function Inicio({ mes, ranking, totalVendido, totalVendas, pendentes, aResponder, recentes, interessados, linkConvite }: Props) {
  const u = usePage().props.usuario!;
  const gestor = u.papel === 'gestor';
  const linhas = ranking.map(r => ({ ...r, pct: r.meta ? (r.valor / r.meta) * 100 : 0 }));
  const totalMeta = linhas.reduce((a, r) => a + r.meta, 0);
  const eu = linhas.find(r => r.id === u.id);
  const pctEquipe = totalMeta ? (totalVendido / totalMeta) * 100 : 0;
  const pctMeu = eu?.pct ?? 0;
  const hora = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }).format(new Date()));
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

  return (
    <PainelLayout titulo={gestor ? 'Início' : 'Meu painel'}>
      <Head title={gestor ? 'Resumo da equipe' : 'Meu painel'} />
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 2, mb: 3 }}>
        <Box>
          <Typography variant="body2" color="text.secondary">{saudacao}, <strong>{u.nome.split(' ')[0]}</strong> · {nomeDoMes(mes)}</Typography>
          <Typography variant="h3" component="h1" sx={{ fontSize: { xs: 30, sm: 38 }, mt: 0.5 }}>{gestor ? 'Resumo da equipe' : 'Meu painel'}</Typography>
        </Box>
        <Stack direction="row" sx={{ gap: 1 }}><Button variant="outlined" href="/caixa">Abrir o caixa</Button><Button variant="contained" href="/painel/pedidos/novo">+ Novo pedido</Button></Stack>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: '1.35fr 1fr 1fr' }, gap: 1.5 }}>
        <Box sx={{ gridColumn: { xs: '1 / -1', lg: 'auto' }, gridRow: { lg: 'span 2' }, position: 'relative', overflow: 'hidden', borderRadius: 6, bgcolor: 'primary.main', color: 'primary.contrastText', p: { xs: 3, sm: 3.5 }, display: 'flex', alignItems: 'center', gap: 3 }}>
          <Box aria-hidden sx={{ position: 'absolute', right: -64, top: -64, width: 224, height: 224, borderRadius: '50%', bgcolor: 'secondary.main', opacity: 0.4, filter: 'blur(48px)' }} />
          <Anel pct={gestor ? pctEquipe : pctMeu} />
          <Box sx={{ position: 'relative', minWidth: 0 }}>
            <Typography variant="body2" sx={{ color: 'marca.areia' }}>{gestor ? 'Vendido no mês' : 'Minha meta'}</Typography>
            <Typography sx={{ fontSize: { xs: 26, sm: 30, xl: 34 }, fontWeight: 800, mt: 0.5, whiteSpace: 'nowrap' }}>{brl(gestor ? totalVendido : eu?.valor ?? 0)}</Typography>
            <Typography variant="body2" sx={{ color: 'marca.areia', mt: 0.5 }}>
              {gestor ? (totalMeta ? <>de {brl(totalMeta)} da meta da equipe</> : 'Defina metas por vendedor')
                : eu?.meta ? <>de {brl(eu.meta)} · {pctMeu >= 100 ? 'meta batida!' : `faltam ${brl(Math.max(0, eu.meta - eu.valor))}`}</> : 'Sem meta neste mês'}
            </Typography>
            {!gestor && <Typography variant="caption" sx={{ color: 'marca.areia', opacity: 0.8, display: 'block', mt: 1.5 }}>Vendido no mês · {eu?.n ?? 0} vendas</Typography>}
          </Box>
        </Box>
        <Numero icone={<ReceiptLong fontSize="small" />} rotulo="Pedidos pendentes" valor={pendentes} href="/painel/pedidos" detalhe={pendentes ? 'Responda logo: a cliente está esperando' : 'Tudo em dia'} alerta={pendentes > 0} />
        {gestor ? <>
          <Numero icone={<EmojiEvents fontSize="small" />} rotulo="Bateram a meta" valor={`${linhas.filter(r => r.meta && r.pct >= 100).length}/${linhas.length}`} detalhe="Vendedores ativos" />
          <Numero icone={<Insights fontSize="small" />} rotulo="Meta da equipe" valor={brl(totalMeta)} detalhe={totalMeta ? `${Math.round(pctEquipe)}% atingido` : 'Defina metas por vendedor'} />
          <Numero icone={<Timeline fontSize="small" />} rotulo="Vendas no mês" valor={totalVendas} href="/painel/vendas" detalhe="Ver todas as vendas" />
        </> : <>
          <Numero icone={<Insights fontSize="small" />} rotulo="Falta para a meta" valor={brl(Math.max(0, (eu?.meta ?? 0) - (eu?.valor ?? 0)))} detalhe={pctMeu >= 100 ? 'Meta batida!' : 'Continue assim'} />
          <Numero icone={<PersonAdd fontSize="small" />} rotulo="Meus clientes" valor={eu?.clientes ?? 0} href="/painel/clientes" detalhe="Ver a carteira" />
          <Numero icone={<Timeline fontSize="small" />} rotulo="Vendas no mês" valor={eu?.n ?? 0} href="/painel/vendas" detalhe="Ver minhas vendas" />
        </>}
      </Box>

      <Box sx={{ mt: 1.5, display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 1.5 }}>
        {([['/painel/pedidos/novo', 'Novo pedido', 'Monte para a cliente', <ReceiptLong key="p" />], ['/painel/sugestoes/nova', 'Nova sugestão', 'Separe peças por link', <AutoAwesome key="s" />],
          ['/painel/clientes/novo', 'Nova cliente', 'Cadastre na carteira', <PersonAdd key="c" />], ['/caixa', 'Venda no caixa', 'Balcão da loja', <PointOfSale key="x" />]] as const).map(([href, t, d, i]) => (
          <Card key={href} sx={{ borderRadius: 4 }}><CardActionArea href={href} sx={{ p: 2, display: 'flex', gap: 1.5, justifyContent: 'flex-start' }}>
            <Avatar variant="rounded" sx={{ bgcolor: 'background.default', color: 'secondary.main', width: 44, height: 44 }}>{i}</Avatar>
            <Box sx={{ minWidth: 0 }}><Typography variant="body2" sx={{ fontWeight: 600 }}>{t}</Typography><Typography variant="caption" color="text.secondary" noWrap>{d}</Typography></Box>
          </CardActionArea></Card>
        ))}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0,1.4fr) minmax(0,1fr)' }, gap: 3, mt: 4 }}>
        {!gestor ? (
          <Card sx={{ alignSelf: 'start' }}><CardContent sx={{ p: { sm: 3.5 } }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
              <Typography variant="h5" sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>Para responder agora{pendentes > 0 && <Chip size="small" color="imperdivel" variant="outlined" label={pendentes} />}</Typography>
              <Link href="/painel/pedidos" variant="body2" sx={{ fontWeight: 600 }}>Todos</Link>
            </Stack>
            {aResponder.length === 0 ? (
              <Box sx={{ bgcolor: 'background.default', borderRadius: 3, p: 3, textAlign: 'center', display: 'grid', gap: 1, justifyItems: 'center' }}>
                <Avatar sx={{ bgcolor: 'success.main' }}><Check /></Avatar>
                <Typography sx={{ fontWeight: 600 }}>Tudo respondido!</Typography>
                <Typography variant="body2" color="text.secondary">Que tal montar uma sugestão para uma cliente da sua carteira?</Typography>
                <Link href="/painel/sugestoes/nova" variant="body2">Nova sugestão</Link>
              </Box>
            ) : (
              <Stack sx={{ gap: 1 }}>{aResponder.map(p => {
                const espera = tempoDesde(p.criadoEm);
                return (
                  <Card key={p.id} sx={{ position: 'relative', p: 1.25, pr: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, borderRadius: 4, '&:hover': { borderColor: 'primary.main' } }}>
                    <Stack direction="row">{p.itens.slice(0, 2).map((i, n) => <Foto key={i.id} src={i.imagem} largura={40} sx={{ ml: n ? -2 : 0, outline: '2px solid', outlineColor: 'background.paper' }} />)}</Stack>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Link href={`/painel/pedidos/${p.id}`} underline="none" sx={{ fontWeight: 600, display: 'block', '&::after': { content: '""', position: 'absolute', inset: 0 } }} noWrap>{p.nomeCliente}</Link>
                      <Typography variant="caption" color="text.secondary" noWrap>{p.codigo} · {p.tipo === 'condicional' ? 'Condicional' : 'Pedido'} · <Box component="span" sx={espera.includes('dia') ? { color: 'secondary.main', fontWeight: 600 } : undefined}>esperando {espera}</Box></Typography>
                    </Box>
                    <Typography sx={{ fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap' }}>{brl(valoresDoPedido(p).total)}</Typography>
                    {p.telefoneCliente && <BotaoWhatsApp href={linkWhatsApp(p.telefoneCliente, mensagemContato(p.nomeCliente, p.tipo, p.codigo))} rotulo={`WhatsApp de ${p.nomeCliente}`} tamanho={36} />}
                  </Card>
                );
              })}</Stack>
            )}
          </CardContent></Card>
        ) : (
          <Card sx={{ alignSelf: 'start' }}><CardContent sx={{ p: { sm: 3.5 } }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 3 }}><Typography variant="h5">Metas por vendedor</Typography><Link href="/painel/resultados" variant="body2" sx={{ fontWeight: 600 }}>Resultados</Link></Stack>
            {linhas.length === 0 ? <Vazio>Nenhum vendedor ativo. <Link href="/painel/vendedores/novo">Cadastrar</Link></Vazio> : (
              <Stack sx={{ gap: 2.5 }}>{linhas.map((r, i) => (
                <Stack key={r.id} direction="row" sx={{ gap: 1.5, alignItems: 'flex-start' }}>
                  <Badge overlap="circular" anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} invisible={!(r.valor > 0 && i < 3)} badgeContent={`${i + 1}º`} sx={{ '& .MuiBadge-badge': { bgcolor: 'background.paper', border: 1, borderColor: 'divider', fontSize: 10 } }}>
                    <Avatar sx={{ width: 44, height: 44, bgcolor: i === 0 && r.valor > 0 ? 'secondary.main' : 'background.default', color: i === 0 && r.valor > 0 ? 'secondary.contrastText' : 'text.primary', fontWeight: 700 }}>{r.nome[0]}</Avatar>
                  </Badge>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Link href={`/painel/vendedores/${r.id}`} sx={{ fontWeight: 600 }}>{r.nome}</Link>
                        <Typography variant="caption" sx={{ display: 'block', color: r.numero ? 'success.main' : 'error.main' }}>{r.numero ? `${r.numero.apelido} · ${formatarTelefone(r.numero.telefone)}` : 'Sem número — as clientes falam com o número padrão'} · <Link href={`/painel/clientes?vendedor=${r.id}`} color="inherit">{r.clientes} clientes</Link></Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography sx={{ fontWeight: 800 }}>{brl(r.valor)} <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400, fontSize: 14 }}>/ {r.meta ? brl(r.meta) : 'sem meta'}</Box></Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: corDaMeta(r.pct) }}>{Math.round(r.pct)}%</Typography>
                      </Box>
                    </Stack>
                    <LinearProgress variant="determinate" value={Math.min(100, r.pct)} sx={{ mt: 1, height: 8, borderRadius: 1, '& .MuiLinearProgress-bar': { bgcolor: corDaMeta(r.pct) } }} />
                  </Box>
                </Stack>
              ))}</Stack>
            )}
          </CardContent></Card>
        )}

        <Stack sx={{ gap: 3 }}>
          {linkConvite && <Convite link={linkConvite} nome={u.nome} />}
          {interessados && (
            <Card><CardContent>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                <Typography variant="h6" sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>Clientes interessados agora{interessados.length > 0 && <Chip size="small" color="imperdivel" variant="outlined" label={interessados.length} />}</Typography>
                <Link href="/painel/interesse" variant="body2" sx={{ fontWeight: 600 }}>Interesse</Link>
              </Stack>
              {interessados.length === 0 ? <Typography variant="body2" color="text.secondary">Nenhuma cliente com sacola aberta ou de olho em uma peça nos últimos 7 dias.</Typography> : (
                <Stack>{interessados.map(c => (
                  <Stack key={c.id} direction="row" sx={{ py: 1.25, gap: 1.5, alignItems: 'center' }}>
                    <Avatar sx={{ width: 36, height: 36, bgcolor: 'background.default', color: 'secondary.main', fontWeight: 700 }}>{c.nome[0]}</Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Link href={`/painel/clientes/${c.id}`} variant="body2" sx={{ fontWeight: 500 }}>{c.nome}</Link>
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{c.motivos.join(' · ')}</Typography>
                      <Typography variant="caption" color="text.secondary">{tempoDesde(c.ultimoAcessoEm)}{gestor && c.vendedor ? ` · ${c.vendedor}` : ''}</Typography>
                    </Box>
                    {c.telefone && <Button size="small" variant="contained" color="whatsapp" href={linkWhatsApp(c.telefone, `Olá, ${c.nome.split(' ')[0]}! Aqui é da ${nomeDaLoja()}.`)} target="_blank" rel="noopener" sx={{ borderRadius: 99 }}>WhatsApp</Button>}
                  </Stack>
                ))}</Stack>
              )}
            </CardContent></Card>
          )}
          <Card><CardContent>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}><Typography variant="h6">Vendas recentes</Typography><Link href="/painel/vendas" variant="body2" sx={{ fontWeight: 600 }}>Todas</Link></Stack>
            {recentes.length === 0 ? <Typography variant="body2" color="text.secondary">Nenhuma venda registrada neste mês.</Typography> : (
              <Stack>{recentes.map(v => (
                <Stack key={v.id} direction="row" sx={{ py: 1.25, gap: 1.5, alignItems: 'center' }}>
                  <Avatar sx={{ width: 36, height: 36, bgcolor: 'rgba(94,107,67,.12)', color: 'success.main' }}><Check fontSize="small" /></Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {v.cliente ? <Link href={`/painel/clientes/${v.cliente.id}`} variant="body2" sx={{ fontWeight: 500 }}>{v.cliente.nome}</Link> : <Typography variant="body2">—</Typography>}
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{formatarData(v.data)} · {v.observacao}{gestor ? ` · ${v.vendedor.split(' ')[0]}` : ''}</Typography>
                  </Box>
                  <Typography sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{brl(v.valor)}</Typography>
                </Stack>
              ))}</Stack>
            )}
          </CardContent></Card>
        </Stack>
      </Box>
    </PainelLayout>
  );
}
