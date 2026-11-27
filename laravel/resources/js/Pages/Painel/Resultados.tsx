import { Head } from '@inertiajs/react';
import { Box, Button, Card, LinearProgress, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina, Foto, Vazio } from '@/Components/ui/Basicos';
import { SeletorMes } from '@/Components/ui/SeletorMes';
import { LinkSimples } from '@/Components/loja/LinkSimples';
import { FunilSugestoes, type Conversao } from '@/Components/painel/sugestao/Botoes';
import { CANAIS, MOTIVOS_PERDA, type Canal } from '@/lib/atendimento';
import { nomeDoMes } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { plural } from '@/lib/pedido';
import { tempoLegivel } from '@/lib/pos-venda';

type Grupo = { chave: string; nome: string; n: number; receita: number; custo: number; lucro: number; margem: number | null; imagem?: string | null; extra?: string };
type Props = {
  mes: string; atual: string; tudo: boolean;
  r: { receita: number; custo: number; lucro: number; margem: number | null; pecas: number; vendas: number; semCusto: number; manuais: number; porVendedor: Grupo[]; porCategoria: Grupo[]; porProduto: Grupo[] };
  cupons: { pedidos: number; totalPedidos: number; desconto: number; receita: number; fretes: number; porCupom: (Grupo & { origem: string; pedidos: number; desconto: number; fretes: number })[]; proxima: { gerados: number; voltaram: number; receita: number } };
  sugestoes: Conversao;
  atendimento: null | { criados: number; ganhos: number; perdidos: number; conversao: number | null; minutosPrimeiroContato: number | null; porCanal: { canal: string; criados: number; conversao: number | null }[]; motivos: { motivo: string; n: number }[]; posVenda: { feitos: number; clientes: number; voltaram: number } };
};

const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`);

function Kpi({ rotulo, valor, detalhe, tom }: { rotulo: string; valor: string | number; detalhe?: string; tom?: 'escuro' | 'oliva' }) {
  const bg = tom === 'escuro' ? 'marca.marrom-950' : tom === 'oliva' ? 'marca.oliva' : undefined;
  return (
    <Card variant="outlined" sx={{ p: 2.5, bgcolor: bg, color: bg ? 'marca.creme' : undefined }}>
      <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.75 }}>{rotulo}</Typography>
      <Typography sx={{ fontWeight: 800, fontSize: 22 }}>{valor}</Typography>
      {detalhe && <Typography variant="caption" sx={{ opacity: 0.8 }}>{detalhe}</Typography>}
    </Card>
  );
}

/** Resultados e lucro (porta de painel/resultados/page.tsx). */
export default function Resultados({ mes, atual, tudo, r, cupons, sugestoes, atendimento: at }: Props) {
  const maxCat = Math.max(1, ...r.porCategoria.map(c => c.lucro));
  const grade = { display: 'grid', gridTemplateColumns: { sm: '1fr 1fr', xl: 'repeat(4, 1fr)' }, gap: 1.5 } as const;
  return (
    <PainelLayout>
      <Head title="Resultados" />
      <CabecalhoPagina sobre={tudo ? 'Todo o período' : nomeDoMes(mes)} titulo="Resultados e lucro"
        acoes={<Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>{!tudo && <SeletorMes mes={mes} atual={atual} base="/painel/resultados" />}<Button variant="outlined" href={tudo ? '/painel/resultados' : '/painel/resultados?periodo=tudo'}>{tudo ? 'Ver por mês' : 'Todo o período'}</Button></Stack>} />
      <Box sx={grade}>
        <Kpi rotulo="Faturamento" valor={brl(r.receita)} detalhe={`${plural(r.vendas, 'venda', 'vendas')} · ${plural(r.pecas, 'peça', 'peças')} de pedidos`} />
        <Kpi rotulo="Custo das peças" valor={brl(r.custo)} detalhe={r.semCusto ? `${plural(r.semCusto, 'venda', 'vendas')} sem custo (${plural(r.manuais, 'manual', 'manuais')})` : 'Todas as vendas com custo'} />
        <Kpi rotulo="Lucro bruto" valor={brl(r.lucro)} detalhe="Receita menos custo das peças" tom="escuro" />
        <Kpi rotulo="Margem" valor={pct(r.margem)} detalhe="Sobre as vendas com custo" tom="oliva" />
      </Box>

      {at && (
        <Card variant="outlined" sx={{ p: { xs: 2.5, sm: 3 }, mt: 3 }}>
          <Typography component="h2" variant="h6">Atendimento</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>Conta só o que foi registrado no painel. O tempo mede o clique no WhatsApp ou no Direct, não a resposta da cliente.</Typography>
          <Box sx={{ ...grade, mb: 2.5 }}>
            <Kpi rotulo="Atendimentos" valor={at.criados} detalhe={`${plural(at.ganhos, 'vendido', 'vendidos')} · ${plural(at.perdidos, 'perdido', 'perdidos')}`} />
            <Kpi rotulo="Conversão" valor={at.conversao == null ? '—' : `${at.conversao}%`} detalhe="Vendidos sobre encerrados" />
            <Kpi rotulo="1º contato" valor={tempoLegivel(at.minutosPrimeiroContato)} detalhe="Tempo médio" />
            <Kpi rotulo="Pós-venda" valor={at.posVenda.feitos} detalhe={`${plural(at.posVenda.voltaram, 'cliente comprou', 'clientes compraram')} de novo em até 90 dias, de ${at.posVenda.clientes}`} />
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { md: '1fr 1fr' }, gap: 3, fontSize: 14 }}>
            <Box><Typography sx={{ fontWeight: 600, mb: 1 }}>Por canal</Typography>
              {at.porCanal.length === 0 ? <Typography variant="body2" color="text.secondary">Sem atendimentos no período.</Typography> : at.porCanal.map(c => <Stack key={c.canal} direction="row" sx={{ justifyContent: 'space-between' }}><span>{CANAIS[c.canal as Canal] ?? c.canal}</span><Box component="span" sx={{ color: 'text.secondary' }}>{c.criados} · {c.conversao == null ? '—' : `${c.conversao}%`}</Box></Stack>)}
            </Box>
            <Box><Typography sx={{ fontWeight: 600, mb: 1 }}>Por que se perdeu</Typography>
              {at.motivos.length === 0 ? <Typography variant="body2" color="text.secondary">Nenhuma perda registrada.</Typography> : at.motivos.map(m => <Stack key={m.motivo} direction="row" sx={{ justifyContent: 'space-between' }}><span>{MOTIVOS_PERDA[m.motivo] ?? m.motivo}</span><Box component="span" sx={{ color: 'text.secondary' }}>{m.n}</Box></Stack>)}
            </Box>
          </Box>
        </Card>
      )}

      {r.vendas === 0 ? <Box sx={{ mt: 4 }}><Vazio>Nenhuma venda no período.</Vazio></Box> : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xl: '1fr 1fr' }, gap: 3, mt: 4 }}>
          <Card variant="outlined" sx={{ p: { xs: 2.5, sm: 3 } }}>
            <Typography component="h2" variant="h6" sx={{ mb: 2.5 }}>Por vendedor</Typography>
            <Stack spacing={2.5}>
              {r.porVendedor.map(v => (
                <Box key={v.chave}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1.5, fontSize: 14 }}>
                    <LinkSimples href={`/painel/vendedores/${v.chave}`} sx={{ fontWeight: 600 }}>{v.nome}</LinkSimples>
                    <span>{brl(v.receita)} · lucro <strong>{brl(v.lucro)}</strong> · {pct(v.margem)}</span>
                  </Stack>
                  <Stack direction="row" sx={{ mt: 1, height: 8, bgcolor: 'marca.bege' }}>
                    <Box sx={{ bgcolor: 'secondary.main', width: `${v.receita ? (v.custo / v.receita) * 100 : 0}%` }} title="Custo" />
                    <Box sx={{ bgcolor: 'marca.oliva', width: `${v.receita ? (Math.max(0, v.lucro) / v.receita) * 100 : 0}%` }} title="Lucro" />
                  </Stack>
                </Box>
              ))}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>Caramelo = custo · oliva = lucro · parte clara = vendas sem custo (manuais)</Typography>
          </Card>
          <Card variant="outlined" sx={{ p: { xs: 2.5, sm: 3 } }}>
            <Typography component="h2" variant="h6" sx={{ mb: 2.5 }}>Lucro por categoria</Typography>
            {r.porCategoria.length === 0 ? <Typography variant="body2" color="text.secondary">Sem pedidos confirmados no período.</Typography> : (
              <Stack spacing={2}>{r.porCategoria.map(c => (
                <Box key={c.chave}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', fontSize: 14 }}><span>{c.nome} <Box component="span" sx={{ color: 'text.secondary' }}>· {plural(c.n, 'peça', 'peças')}</Box></span><strong>{brl(c.lucro)}</strong></Stack>
                  <LinearProgress variant="determinate" color="success" value={(Math.max(0, c.lucro) / maxCat) * 100} sx={{ mt: 0.5, height: 8, bgcolor: 'marca.bege' }} />
                </Box>
              ))}</Stack>
            )}
          </Card>
          <Card variant="outlined" sx={{ p: { xs: 2.5, sm: 3 }, gridColumn: { xl: 'span 2' }, overflowX: 'auto' }}>
            <Typography component="h2" variant="h6" sx={{ mb: 2 }}>Produtos que mais deram lucro</Typography>
            {r.porProduto.length === 0 ? <Typography variant="body2" color="text.secondary">Sem pedidos confirmados no período.</Typography> : (
              <Table size="small" sx={{ minWidth: 640 }}>
                <TableHead><TableRow>{['Produto', 'Peças', 'Receita', 'Custo', 'Lucro', 'Margem'].map(t => <TableCell key={t}>{t}</TableCell>)}</TableRow></TableHead>
                <TableBody>{r.porProduto.map(p => (
                  <TableRow key={p.chave}>
                    <TableCell><Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}><Foto src={p.imagem} largura={36} /><Box><Box>{p.nome}</Box><Typography variant="caption" color="text.secondary">{p.extra}</Typography></Box></Stack></TableCell>
                    <TableCell>{p.n}</TableCell><TableCell>{brl(p.receita)}</TableCell><TableCell>{brl(p.custo)}</TableCell><TableCell sx={{ fontWeight: 700 }}>{brl(p.lucro)}</TableCell><TableCell>{pct(p.margem)}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            )}
          </Card>
        </Box>
      )}

      {(cupons.pedidos > 0 || cupons.proxima.gerados > 0) && (
        <Card variant="outlined" sx={{ p: { xs: 2.5, sm: 3 }, mt: 3, overflowX: 'auto' }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', mb: 2.5 }}><Typography component="h2" variant="h6">Cupons</Typography><LinkSimples href="/painel/cupons" sx={{ textDecoration: 'underline', fontSize: 14 }}>Ver cupons</LinkSimples></Stack>
          <Box sx={{ ...grade, mb: 3 }}>
            <Kpi rotulo="Pedidos com cupom" valor={String(cupons.pedidos)} detalhe={cupons.totalPedidos ? `${pct(cupons.pedidos / cupons.totalPedidos)} dos pedidos confirmados` : 'Nenhum pedido confirmado'} />
            <Kpi rotulo="Desconto dado" valor={brl(cupons.desconto)} detalhe={cupons.fretes ? `e ${plural(cupons.fretes, 'frete grátis', 'fretes grátis')}` : 'Nas peças'} />
            <Kpi rotulo="Faturamento com cupom" valor={brl(cupons.receita)} detalhe="Vendas já com o desconto" tom="escuro" />
            <Kpi rotulo="Próxima compra" valor={`${cupons.proxima.voltaram} de ${cupons.proxima.gerados}`} detalhe={cupons.proxima.gerados ? `cupons gerados no período voltaram como venda (${pct(cupons.proxima.voltaram / cupons.proxima.gerados)}) · ${brl(cupons.proxima.receita)}` : 'Nenhum cupom gerado no período'} tom="oliva" />
          </Box>
          {cupons.porCupom.length === 0 ? <Typography variant="body2" color="text.secondary">Nenhum pedido confirmado com cupom no período.</Typography> : (
            <Table size="small" sx={{ minWidth: 640 }}>
              <TableHead><TableRow>{['Cupom', 'Pedidos', 'Desconto', 'Fretes grátis', 'Faturamento', 'Lucro', 'Margem'].map(t => <TableCell key={t}>{t}</TableCell>)}</TableRow></TableHead>
              <TableBody>{cupons.porCupom.map(c => (
                <TableRow key={c.chave}>
                  <TableCell><Box component="span" sx={{ fontWeight: 700, letterSpacing: '0.04em' }}>{c.nome}</Box>{c.origem === 'primeiraCompra' && <Typography variant="caption" color="text.secondary"> · primeira compra</Typography>}</TableCell>
                  <TableCell>{c.pedidos}</TableCell><TableCell>{brl(c.desconto)}</TableCell><TableCell>{c.fretes || '—'}</TableCell><TableCell>{brl(c.receita)}</TableCell><TableCell sx={{ fontWeight: 700 }}>{brl(c.lucro)}</TableCell><TableCell>{pct(c.margem)}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>Pedidos confirmados no período. Lucro e margem sobre as vendas com custo; o desconto do vendedor já está no preço das peças.</Typography>
        </Card>
      )}
      {sugestoes.total.enviados > 0 && <Box sx={{ mt: 3 }}><FunilSugestoes c={sugestoes} periodo={tudo ? 'todo o período' : nomeDoMes(mes).toLowerCase()} porVendedor /></Box>}
    </PainelLayout>
  );
}
