import { Head, router, usePage } from '@inertiajs/react';
import { Box, Button, Card, Stack, TextField, Typography } from '@mui/material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina, Etiqueta, Vazio } from '@/Components/ui/Basicos';
import { LinhaFiltro, PainelFiltros } from '@/Components/ui/Filtros';
import { LinkSimples } from '@/Components/loja/LinkSimples';
import { BotaoEnviarSugestao, BotaoLembrar, FunilSugestoes, type Conversao } from '@/Components/painel/sugestao/Botoes';
import { tempoDesde } from '@/lib/atividade';
import { formatarData } from '@/lib/datas';
import { ATENCAO, mensagemDaSugestao, mensagemLembrete, SITUACOES, type Atencao, type Situacao } from '@/lib/sugestoes';
import { comFiltros } from '@/lib/url';
import { linkWhatsApp } from '@/lib/whatsapp';

export type ResumoSugestao = {
  id: string; codigo: string; titulo: string; situacao: Situacao; atencao: Atencao | null; criadaEm: string; validaAte: string; enviadaEm: string | null; vistaEm: string | null;
  respondidaEm: string | null; lembradoEm: string | null; vezesVista: number; pedidoId: string | null; mensagem: string | null; cupomCodigo: string | null; lembretes: number; link: string;
  cliente: { id: string; nome: string; telefone: string } | null; vendedor: string | null; pecas: number | null; quero: number | null; talvez: number | null;
};
type Props = {
  lista: ResumoSugestao[]; total: number; contagem: Record<string, number>; atencao: ResumoSugestao[]; totalAtencao: number; conversao: Conversao;
  filtros: { vendedor: string | null; cliente: string | null; situacao: string | null; q: string; pagina: number }; vendedores: { id: string; name: string }[]; cliente: { id: string; nome: string } | null;
};

const ORDEM: Situacao[] = ['aEnviar', 'enviada', 'vista', 'respondida', 'convertida', 'vencida', 'cancelada'];
const COR = { bege: 'contorno', caramelo: 'caramelo', oliva: 'oliva', escuro: 'contorno', cinza: 'cinza' } as const;

/** Sugestões enviadas: o que precisa de atenção, os filtros e o funil (porta de painel/sugestoes/page.tsx). */
export default function Sugestoes({ lista, total, contagem, atencao, totalAtencao, conversao, filtros, vendedores, cliente }: Props) {
  const { usuario, identidade } = usePage().props;
  const gestor = usuario?.papel === 'gestor';
  const atual = { vendedor: filtros.vendedor, situacao: filtros.situacao, q: filtros.q || null, cliente: filtros.cliente };
  const url = (m: Record<string, string | null>) => comFiltros('/painel/sugestoes', atual, m);
  const algum = !!(filtros.vendedor || filtros.situacao || filtros.q || filtros.cliente);
  // Mensagem de cada ação: enviar (Para enviar) ou lembrar (enviada e parada).
  const acao = (s: ResumoSugestao) => {
    if (!s.cliente) return null;
    if (s.situacao === 'aEnviar')
      return <BotaoEnviarSugestao pequeno id={s.id} enviada={false} url={linkWhatsApp(s.cliente.telefone, mensagemDaSugestao({ nomeCliente: s.cliente.nome, nomeVendedor: s.vendedor ?? '', loja: identidade.nome, titulo: s.titulo, mensagem: s.mensagem, link: s.link, pecas: s.pecas ?? 0, validaAte: new Date(s.validaAte), temOferta: false, cupom: s.cupomCodigo }))} />;
    return <BotaoLembrar pequeno id={s.id} lembretes={s.lembretes} url={linkWhatsApp(s.cliente.telefone, mensagemLembrete({ nomeCliente: s.cliente.nome, nomeVendedor: s.vendedor ?? '', situacao: s.situacao, link: s.link, validaAte: new Date(s.validaAte), temOferta: false }))} />;
  };
  return (
    <PainelLayout>
      <Head title="Sugestões enviadas" />
      <CabecalhoPagina sobre="Vendas · sugestões" titulo="Sugestões enviadas" acoes={<Button href="/painel/sugestoes/nova" variant="contained">+ Montar sugestão</Button>}>
        Monte uma sugestão de peças para a cliente e envie pelo WhatsApp. Ela abre o link, marca o que quer, escolhe cor e tamanho e devolve como pedido.
      </CabecalhoPagina>
      {!algum && atencao.length > 0 && (
        <Card variant="outlined" sx={{ mb: 3, borderColor: 'rgba(109,64,42,.5)' }}>
          <Stack direction="row" sx={{ px: 2.5, py: 1.5, justifyContent: 'space-between', alignItems: 'baseline', borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="h6">Precisa de atenção <Box component="span" sx={{ color: 'secondary.main' }}>{totalAtencao}</Box></Typography>
            {totalAtencao > atencao.length && <LinkSimples href={url({ situacao: 'atencao' })} sx={{ fontSize: 13, textDecoration: 'underline' }}>Ver todos</LinkSimples>}
          </Stack>
          {atencao.map(s => (
            <Box key={s.id} sx={{ display: 'grid', gridTemplateColumns: { sm: 'minmax(0,1fr) auto' }, gap: 1, px: 2.5, py: 1.5, alignItems: 'center', fontSize: 14, borderBottom: 1, borderColor: 'divider' }}>
              <Box sx={{ minWidth: 0 }}>
                <LinkSimples href={`/painel/sugestoes/${s.id}`} sx={{ fontWeight: 600 }}>{s.cliente?.nome}</LinkSimples><Box component="span" sx={{ color: 'text.secondary' }}> · {s.titulo}</Box>
                <Typography variant="caption" component="div" color="secondary.main">{s.atencao && ATENCAO[s.atencao]}{s.lembretes ? ` · já lembrada ${s.lembretes}×` : ''}</Typography>
              </Box>
              <Box>{acao(s)}</Box>
            </Box>
          ))}
        </Card>
      )}
      {conversao.total.enviados > 0 && !algum && <Box sx={{ mb: 3 }}><FunilSugestoes c={conversao} periodo="últimos 30 dias" porVendedor={gestor} /></Box>}
      <Stack component="form" direction="row" sx={{ mb: 1.5, maxWidth: 520 }} onSubmit={(e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); router.visit(url({ q: String(new FormData(e.currentTarget).get('q') || '') || null })); }}>
        <TextField name="q" size="small" fullWidth defaultValue={filtros.q} placeholder="Cliente, título ou código (SUG-…)" slotProps={{ htmlInput: { 'aria-label': 'Buscar sugestão' } }} />
        <Button type="submit" variant="contained" sx={{ ml: 1 }}>Buscar</Button>
      </Stack>
      <PainelFiltros limpar={algum ? '/painel/sugestoes' : null}>
        <LinhaFiltro rotulo="Situação" opcoes={[
          { rotulo: 'Todas', href: url({ situacao: null }), ativo: !filtros.situacao },
          { rotulo: 'Precisa de atenção', href: url({ situacao: 'atencao' }), ativo: filtros.situacao === 'atencao', n: totalAtencao },
          ...ORDEM.map(k => ({ rotulo: SITUACOES[k].rotulo, href: url({ situacao: k }), ativo: filtros.situacao === k, n: contagem[k] ?? 0 })),
        ]} />
        {gestor && <LinhaFiltro rotulo="Vendedor" opcoes={[{ rotulo: 'Todos', href: url({ vendedor: null }), ativo: !filtros.vendedor }, ...vendedores.map(v => ({ rotulo: v.name.split(' ')[0], href: url({ vendedor: v.id }), ativo: filtros.vendedor === v.id }))]} />}
        {cliente && <LinhaFiltro rotulo="Cliente" opcoes={[{ rotulo: cliente.nome, href: url({ cliente: null }), ativo: true }]} />}
      </PainelFiltros>
      {!lista.length ? <Vazio>{algum ? 'Nenhuma sugestão com esses filtros.' : <>Nenhuma sugestão ainda. <LinkSimples href="/painel/sugestoes/nova" sx={{ textDecoration: 'underline' }}>Monte a primeira</LinkSimples>.</>}</Vazio> : (
        <Card variant="outlined">
          {lista.map(s => (
            <LinkSimples key={s.id} href={`/painel/sugestoes/${s.id}`} sx={{ display: 'grid', gridTemplateColumns: { sm: '8rem minmax(0,1fr) auto' }, columnGap: 2, rowGap: 0.5, px: 2.5, py: 1.75, alignItems: 'center', fontSize: 14, borderBottom: 1, borderColor: 'divider', '&:hover': { bgcolor: 'rgba(239,228,214,.4)' } }}>
              <Box><strong>{s.codigo}</strong><Typography variant="caption" component="div" color="text.secondary">{formatarData(s.criadaEm)}</Typography></Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography noWrap sx={{ fontWeight: 600, fontSize: 14 }}>{s.cliente?.nome} <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}>· {s.titulo}</Box></Typography>
                <Typography variant="caption" color="text.secondary">
                  {s.pecas} {s.pecas === 1 ? 'peça' : 'peças'}{s.vistaEm ? ` · vista ${tempoDesde(s.vistaEm)} (${s.vezesVista}×)` : s.enviadaEm ? ' · ainda não abriu' : ' · não enviada'}
                  {(s.quero ?? 0) + (s.talvez ?? 0) > 0 && ` · quer ${s.quero}, talvez ${s.talvez}`}{s.lembretes > 0 && ` · lembrada ${s.lembretes}×`}{gestor && ` · ${s.vendedor?.split(' ')[0]}`}
                </Typography>
                {s.atencao && <Typography variant="caption" component="div" color="secondary.main">{ATENCAO[s.atencao]}</Typography>}
              </Box>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', justifyContent: { sm: 'flex-end' } }}>
                <Etiqueta cor={COR[SITUACOES[s.situacao].cor]}>{SITUACOES[s.situacao].rotulo}</Etiqueta>
                <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>{['vencida', 'convertida', 'cancelada'].includes(s.situacao) ? '' : `até ${formatarData(s.validaAte)}`}</Typography>
              </Stack>
            </LinkSimples>
          ))}
        </Card>
      )}
      {total > lista.length && <Box sx={{ mt: 3, textAlign: 'center' }}><Button variant="outlined" href={url({ pagina: String(filtros.pagina + 1) })} {...{ preserveScroll: true }}>Carregar mais ({total - lista.length})</Button></Box>}
    </PainelLayout>
  );
}
