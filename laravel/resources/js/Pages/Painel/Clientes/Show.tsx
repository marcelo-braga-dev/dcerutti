import { Head, useForm, usePage } from '@inertiajs/react';
import type { ReactNode } from 'react';
import { Alert, Box, Button, Card, CardContent, Link, Stack, TextField, Typography } from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina, Etiqueta, EtiquetaStatus, EtiquetaTipo } from '@/Components/ui/Basicos';
import { FormCliente, type ClienteForm } from '@/Components/painel/cliente/FormCliente';
import { InteresseCliente, type Interesse } from '@/Components/painel/cliente/InteresseCliente';
import { formatarData } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { linkWhatsApp } from '@/lib/whatsapp';
import { nomeDaLoja } from '@/lib/loja';
import { SITUACOES, situacaoDe } from '@/lib/sugestoes';
import { ETAPAS } from '@/lib/atendimento';

type Props = {
  cliente: ClienteForm; vendedor: { id: string; nome: string } | null; totalComprado: number; hoje: string;
  pedidos: { id: string; codigo: string; tipo: 'compra' | 'condicional'; status: 'pendente' | 'confirmado' | 'cancelado'; total: number }[];
  vendas: { id: string; valor: number; data: string; observacao: string | null }[];
  sugestoes: { id: string; codigo: string; titulo: string; status: string; validaAte: string; enviadaEm: string | null; criadaEm: string; pecas: number; quer: number }[];
  atendimentos: { id: string; codigo: string; etapa: keyof typeof ETAPAS; proximoContatoEm: string | null }[];
  cupons: { id: number; codigo: string; regra: string; inicioEm: string; fimEm: string | null; situacao: 'disponivel' | 'agendado' | 'usado' | 'expirado' }[];
  interesse: Interesse | null; vendedores: { id: string; nome: string }[] | null;
};

const CorSugestao: Record<string, 'oliva' | 'caramelo' | 'cinza' | 'contorno'> = { oliva: 'oliva', caramelo: 'caramelo', cinza: 'cinza', bege: 'contorno', escuro: 'contorno' };

function Bloco({ titulo, acao, children }: { titulo: string; acao?: ReactNode; children: ReactNode }) {
  return (
    <Card><CardContent>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', mb: 1.5, gap: 1 }}><Typography variant="h6">{titulo}</Typography>{acao}</Stack>
      {children}
    </CardContent></Card>
  );
}

/** Ficha da cliente (src/app/(painel)/painel/clientes/[id]/page.tsx). O "enviar uma peça" vem com a fase 5. */
export default function FichaCliente({ cliente: c, vendedor, totalComprado, hoje, pedidos, vendas, sugestoes, atendimentos, cupons, interesse, vendedores }: Props) {
  const { usuario, flash } = usePage().props;
  const gestor = usuario?.papel === 'gestor';
  const venda = useForm({ valor: '', data: hoje, observacao: '' });
  const erros = venda.errors as Record<string, string>;
  return (
    <PainelLayout titulo={c.nome}>
      <Head title={c.nome} />
      <Link href="/painel/clientes" variant="body2" color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}><ArrowBack fontSize="small" />Clientes</Link>
      <CabecalhoPagina sobre="Ficha do cliente" titulo={c.nome} acoes={<>
        {c.telefone && <Button variant="outlined" href={linkWhatsApp(c.telefone, `Olá, ${c.nome.split(' ')[0]}! Aqui é da ${nomeDaLoja()}.`)} target="_blank" rel="noopener">WhatsApp</Button>}
        <Button variant="outlined" href={`/painel/sugestoes/nova?cliente=${c.id}`}>Sugerir peças</Button>
        <Button variant="contained" color="success" href={`/painel/pedidos/novo?cliente=${c.id}`}>Montar pedido</Button>
      </>}>
        Total comprado: <strong>{brl(totalComprado)}</strong>
        {gestor && vendedor && <> · Atendida por <Link href={`/painel/vendedores/${vendedor.id}`}>{vendedor.nome}</Link> (<Link href={`/painel/clientes?vendedor=${vendedor.id}`}>outras clientes</Link>)</>}
        {pedidos.some(p => p.status === 'pendente') && <> · <Link href={`/painel/pedidos?cliente=${c.id}`} color="secondary">pedidos em aberto</Link></>}
      </CabecalhoPagina>
      {flash.sucesso && <Alert severity="success" sx={{ mb: 2 }}>{flash.sucesso}</Alert>}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1.3fr 1fr' }, gap: 3, alignItems: 'start' }}>
        <Stack sx={{ gap: 3 }}>
          {interesse && <InteresseCliente clienteId={c.id} dados={interesse} temAcesso={c.temAcesso} />}
          <Card><CardContent sx={{ p: { sm: 4 } }}><FormCliente cliente={c} vendedores={vendedores} gestor={gestor} /></CardContent></Card>
        </Stack>
        <Stack sx={{ gap: 3 }}>
          {atendimentos.length > 0 && (
            <Bloco titulo="Atendimentos">
              <Stack sx={{ gap: 1 }}>{atendimentos.map(a => (
                <Stack key={a.id} direction="row" sx={{ justifyContent: 'space-between', gap: 2, fontSize: 14 }}>
                  <Link href={`/painel/atendimento/${a.id}`}>{a.codigo}</Link>
                  <Typography variant="body2" color="text.secondary">{ETAPAS[a.etapa]}{a.proximoContatoEm ? ` · retorno em ${formatarData(a.proximoContatoEm)}` : ''}</Typography>
                </Stack>
              ))}</Stack>
            </Bloco>
          )}
          <Bloco titulo="Sugestões" acao={<Link href={`/painel/sugestoes/nova?cliente=${c.id}`} variant="body2">+ Sugerir peças</Link>}>
            {sugestoes.length === 0 ? <Typography variant="body2" color="text.secondary">Nenhuma sugestão enviada para ela ainda.</Typography> : (
              <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>{sugestoes.map(s => {
                const sit = situacaoDe({ status: s.status as never, validaAte: new Date(s.validaAte), enviadaEm: s.enviadaEm ? new Date(s.enviadaEm) : null });
                return (
                  <Stack key={s.id} direction="row" sx={{ py: 1.25, justifyContent: 'space-between', alignItems: 'center', gap: 1.5 }}>
                    <Link href={`/painel/sugestoes/${s.id}`} underline="hover" color="inherit" sx={{ minWidth: 0 }}>
                      <Typography variant="body2">{s.titulo}</Typography>
                      <Typography variant="caption" color="text.secondary">{s.codigo} · {formatarData(s.criadaEm)} · {s.pecas} {s.pecas === 1 ? 'peça' : 'peças'}{s.quer ? ` · quer ${s.quer}` : ''}</Typography>
                    </Link>
                    <Etiqueta cor={CorSugestao[SITUACOES[sit].cor]}>{SITUACOES[sit].rotulo}</Etiqueta>
                  </Stack>
                );
              })}</Stack>
            )}
          </Bloco>
          {cupons.length > 0 && (
            <Bloco titulo="Cupons da cliente">
              <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>{cupons.map(x => (
                <Box key={x.id} sx={{ py: 1, opacity: x.situacao === 'disponivel' || x.situacao === 'agendado' ? 1 : 0.6, fontSize: 14 }}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>{x.codigo}</strong>
                    <Etiqueta cor={x.situacao === 'disponivel' ? 'oliva' : x.situacao === 'agendado' ? 'caramelo' : 'cinza'}>{{ disponivel: 'Disponível', agendado: 'Em breve', usado: 'Usado', expirado: 'Vencido' }[x.situacao]}</Etiqueta>
                  </Stack>
                  <Typography variant="body2" color="text.secondary">{x.regra}</Typography>
                  <Typography variant="body2" color="text.secondary">{x.situacao === 'agendado' ? `Começa em ${formatarData(x.inicioEm)}` : x.fimEm ? `Até ${formatarData(x.fimEm)}` : 'Sem data para acabar'}</Typography>
                </Box>
              ))}</Stack>
            </Bloco>
          )}
          <Bloco titulo="Registrar venda na loja">
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Com as peças vendidas, o estoque baixa sozinho: <Link href={`/painel/pedidos/novo?cliente=${c.id}&tipo=balcao`}>escolher as peças</Link>. Sem peças, registre só o valor:</Typography>
            <Box component="form" onSubmit={e => { e.preventDefault(); venda.post(`/painel/clientes/${c.id}/vendas`, { preserveScroll: true, onSuccess: () => venda.reset('valor', 'observacao') }); }} sx={{ display: 'grid', gridTemplateColumns: { sm: '1fr 1fr' }, gap: 2 }}>
              <TextField label="Valor (R$)" placeholder="289,90" value={venda.data.valor} onChange={e => venda.setData('valor', e.target.value)} error={!!erros.valor} helperText={erros.valor} />
              <TextField label="Data" type="date" value={venda.data.data} onChange={e => venda.setData('data', e.target.value)} error={!!erros.data} helperText={erros.data} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField label="Observação" placeholder="Loja, WhatsApp…" value={venda.data.observacao} onChange={e => venda.setData('observacao', e.target.value)} sx={{ gridColumn: { sm: '1 / -1' } }} />
              <Box><Button type="submit" variant="contained" color="success" loading={venda.processing}>Registrar venda</Button></Box>
            </Box>
          </Bloco>
          <Bloco titulo="Pedidos">
            {pedidos.length === 0 ? <Typography variant="body2" color="text.secondary">Nenhum pedido.</Typography> : (
              <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>{pedidos.map(p => (
                <Stack key={p.id} direction="row" sx={{ py: 1.25, justifyContent: 'space-between', gap: 1.5, fontSize: 14 }}>
                  <Link href={`/painel/pedidos/${p.id}`} underline="hover" color="inherit" sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}><strong>{p.codigo}</strong><EtiquetaTipo tipo={p.tipo} /><EtiquetaStatus status={p.status} /></Link>
                  <span>{brl(p.total)}</span>
                </Stack>
              ))}</Stack>
            )}
          </Bloco>
          <Bloco titulo="Vendas">
            {vendas.length === 0 ? <Typography variant="body2" color="text.secondary">Nenhuma venda registrada.</Typography> : (
              <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>{vendas.map(v => (
                <Stack key={v.id} direction="row" sx={{ py: 1.25, justifyContent: 'space-between', gap: 1.5, fontSize: 14 }}>
                  <span>{formatarData(v.data)} · <Box component="span" sx={{ color: 'text.secondary' }}>{v.observacao}</Box></span>
                  <strong>{brl(v.valor)}</strong>
                </Stack>
              ))}</Stack>
            )}
          </Bloco>
        </Stack>
      </Box>
    </PainelLayout>
  );
}
