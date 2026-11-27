import type { ReactNode } from 'react';
import { Head, router, usePage } from '@inertiajs/react';
import { Box, Button, Card, Stack, Typography } from '@mui/material';
import { WhatsApp } from '@mui/icons-material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina, Etiqueta, Vazio } from '@/Components/ui/Basicos';
import { LinkSimples } from '@/Components/loja/LinkSimples';
import { BotoesContato, BotoesPosVenda } from '@/Components/painel/atendimento/Contato';
import { CANAIS, ETAPAS, type Canal, type Etapa } from '@/lib/atendimento';
import { formatarData, formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { ehOferta, textoPosVenda, TIPOS_POS_VENDA, type TipoPosVenda } from '@/lib/pos-venda';
import { ATENCAO, type Atencao } from '@/lib/sugestoes';
import { linkWhatsApp } from '@/lib/whatsapp';

export type LinhaAtendimento = {
  id: string; codigo: string; canal: Canal; etapa: Etapa; proximoContatoEm: string | null; criadoEm: string; ultimoContatoEm: string | null; primeiroContatoEm: string | null; fechadoEm: string | null;
  motivoPerda: string | null; responsavelId: string | null; pedidoId: string | null; clienteId: string | null; responsavel: string | null; vitrine: { id: string; titulo: string } | null;
  nome: string; telefone: string | null; instagram: string | null;
};
type Props = {
  novos: LinhaAtendimento[]; retornos: LinhaAtendimento[];
  pedidos: { id: string; codigo: string; tipo: string; nomeCliente: string; total: number; criadoEm: string; vendedor: string | null }[];
  interessados: { id: string; nome: string; telefone: string; motivos: string[]; vendedor: { nome: string } | string | null }[];
  sugestoes: { id: string; codigo: string; titulo: string; cliente: string; atencao: Atencao | null }[];
  posVenda: { id: number; tipo: TipoPosVenda; venceEm: string; pedidoId: string; pedido: string | null; cliente: { id: string; nome: string; telefone: string; vendedor: string | null } }[];
};

function Grupo({ titulo, n, children }: { titulo: string; n: number; children: ReactNode }) {
  if (!n) return null;
  return <Stack component="section" spacing={1.5}><Typography variant="h6">{titulo} <Box component="span" sx={{ fontSize: 14, fontWeight: 400, color: 'text.secondary' }}>{n}</Box></Typography>{children}</Stack>;
}

function Linha({ children, acoes }: { children: ReactNode; acoes: ReactNode }) {
  return <Card variant="outlined" sx={{ p: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}><Box sx={{ minWidth: 0 }}>{children}</Box><Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>{acoes}</Stack></Card>;
}

function Item({ a, verResponsavel, detalhe }: { a: LinhaAtendimento; verResponsavel: boolean; detalhe: string }) {
  return (
    <Linha acoes={<><BotoesContato id={a.id} telefone={a.telefone} instagram={a.instagram} /><Button size="small" onClick={() => router.post(`/painel/atendimento/${a.id}/adiar`, { dias: 1 }, { preserveScroll: true })}>Amanhã</Button><Button size="small" variant="outlined" href={`/painel/atendimento/${a.id}`}>Abrir</Button></>}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <LinkSimples href={`/painel/atendimento/${a.id}`} sx={{ fontWeight: 600 }}>{a.nome}</LinkSimples><Etiqueta>{CANAIS[a.canal]}</Etiqueta>{a.etapa !== 'novo' && <Etiqueta cor="caramelo">{ETAPAS[a.etapa]}</Etiqueta>}
      </Stack>
      <Typography variant="body2" color="text.secondary">{a.codigo} · {detalhe}{verResponsavel ? ` · ${a.responsavel ?? 'Sem responsável'}` : ''}</Typography>
      {!a.telefone && <Typography variant="body2" color="secondary.main">Sem WhatsApp: peça o número no Direct.</Typography>}
    </Linha>
  );
}

/** A fila do dia (docs/26): em ordem de urgência, o que precisa de ação agora. */
export default function Hoje({ novos, retornos, pedidos, interessados, sugestoes, posVenda }: Props) {
  const { usuario, identidade } = usePage().props;
  const gestor = usuario?.papel === 'gestor';
  const total = posVenda.length + novos.length + retornos.length + pedidos.length + interessados.length + sugestoes.length;
  const nomeVendedor = (v: Props['interessados'][number]['vendedor']) => (typeof v === 'string' ? v : v?.nome ?? '');
  return (
    <PainelLayout>
      <Head title="Hoje" />
      <CabecalhoPagina sobre="Atendimento" titulo="Hoje" acoes={<><Button variant="outlined" href="/painel/atendimento/lista">Todos</Button><Button variant="contained" href="/painel/atendimento/novo">+ Novo atendimento</Button></>}>
        {gestor ? 'O que está pendente em toda a equipe.' : 'Quem atender agora, em ordem de urgência.'}
      </CabecalhoPagina>
      {!total ? <Vazio>Nada pendente. Quando chegar uma mensagem, registre em <strong>+ Novo atendimento</strong>.</Vazio> : (
        <Stack spacing={4}>
          <Grupo titulo="Novos, sem primeiro contato" n={novos.length}>{novos.map(a => <Item key={a.id} a={a} verResponsavel={gestor} detalhe={`chegou em ${formatarDataHora(a.criadoEm)}`} />)}</Grupo>
          <Grupo titulo="Retornos de hoje e atrasados" n={retornos.length}>{retornos.map(a => <Item key={a.id} a={a} verResponsavel={gestor} detalhe={`retorno em ${formatarData(a.proximoContatoEm!)}`} />)}</Grupo>
          <Grupo titulo="Pedidos em aberto" n={pedidos.length}>
            {pedidos.map(p => <Linha key={p.id} acoes={<Button size="small" variant="outlined" href={`/painel/pedidos/${p.id}`}>Ver o pedido</Button>}><LinkSimples href={`/painel/pedidos/${p.id}`} sx={{ fontWeight: 600 }}>{p.nomeCliente}</LinkSimples><Typography variant="body2" color="text.secondary">{p.codigo} · {brl(p.total)} · desde {formatarData(p.criadoEm)}{gestor ? ` · ${p.vendedor}` : ''}</Typography></Linha>)}
          </Grupo>
          <Grupo titulo="Pós-venda" n={posVenda.length}>
            {posVenda.map(c => (
              <Linha key={c.id} acoes={<BotoesPosVenda id={c.id} clienteId={c.cliente.id} oferta={ehOferta(c.tipo)} url={linkWhatsApp(c.cliente.telefone, textoPosVenda(c.tipo, { nome: c.cliente.nome.split(' ')[0], vendedora: (c.cliente.vendedor ?? '').split(' ')[0], loja: identidade.nome }))} />}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><LinkSimples href={`/painel/clientes/${c.cliente.id}`} sx={{ fontWeight: 600 }}>{c.cliente.nome}</LinkSimples><Etiqueta>{TIPOS_POS_VENDA[c.tipo]}</Etiqueta></Stack>
                <Typography variant="body2" color="text.secondary">{c.pedido} · desde {formatarData(c.venceEm)}{gestor ? ` · ${c.cliente.vendedor}` : ''}</Typography>
              </Linha>
            ))}
          </Grupo>
          <Grupo titulo="Clientes com interesse agora" n={interessados.length}>
            {interessados.map(c => <Linha key={c.id} acoes={<Button component="a" href={linkWhatsApp(c.telefone, `Olá, ${c.nome.split(' ')[0]}!`)} target="_blank" rel="noopener" size="small" variant="contained" color="whatsapp" startIcon={<WhatsApp />}>WhatsApp</Button>}><LinkSimples href={`/painel/clientes/${c.id}`} sx={{ fontWeight: 600 }}>{c.nome}</LinkSimples><Typography variant="body2" color="text.secondary">{c.motivos.join(' · ')}{gestor ? ` · ${nomeVendedor(c.vendedor)}` : ''}</Typography></Linha>)}
          </Grupo>
          <Grupo titulo="Sugestões que precisam de atenção" n={sugestoes.length}>
            {sugestoes.map(s => <Linha key={s.id} acoes={<Button size="small" variant="outlined" href={`/painel/sugestoes/${s.id}`}>Ver a sugestão</Button>}><LinkSimples href={`/painel/sugestoes/${s.id}`} sx={{ fontWeight: 600 }}>{s.cliente}</LinkSimples><Typography variant="body2" color="text.secondary">{s.codigo} · {s.atencao ? ATENCAO[s.atencao] : ''}</Typography></Linha>)}
          </Grupo>
        </Stack>
      )}
    </PainelLayout>
  );
}
