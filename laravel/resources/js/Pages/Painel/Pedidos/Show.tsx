import { Head, useForm, usePage } from '@inertiajs/react';
import type { ReactNode } from 'react';
import { Alert, Avatar, Box, Button, Card, CardContent, CardHeader, Link, MenuItem, Stack, TextField, Typography } from '@mui/material';
import {
  ArrowBack, CalendarMonth, Check, Close, CreditCard, History, Inventory2, LocalOffer, LocalShipping, Person, Phone, Place, PointOfSaleOutlined,
  PersonOutlined, Schedule, ShoppingBag, StorefrontOutlined, Undo, WarningAmber, WhatsApp,
} from '@mui/icons-material';
import PainelLayout from '@/Layouts/PainelLayout';
import { Etiqueta, EtiquetaStatus, EtiquetaTipo, Foto } from '@/Components/ui/Basicos';
import { HistoricoPedido, type RegistroHistorico } from '@/Components/painel/pedido/HistoricoPedido';
import { CancelarVenda, FecharPedido } from '@/Components/painel/pedido/FecharPedido';
import { PecasDoPedido, type CorDoModelo, type CupomDoPedido } from '@/Components/painel/pedido/PecasDoPedido';
import { formatarData, formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { diasAte, expiraEm, prazoVencido, textoCancelamento, valoresDoPedido } from '@/lib/pedido';
import { linkWhatsApp, mensagemContato, mensagemCupomProximaCompra, mensagemPedidoAlterado } from '@/lib/whatsapp';
import { SITUACOES_ENTREGA, SITUACOES_PAGAMENTO } from '@/lib/pos-venda';
import { descreverPagamento } from '@/lib/caixa';
import type { ResumoPedido } from '@/types/pedido';

type ItemDetalhe = {
  id: number; varianteId: number; produtoId: number; referencia: string; nome: string; marca: string; cor: string | null; imagem: string | null; tamanho: string;
  codigoInterno: string | null; quantidade: number; precoUnitario: number; precoTabela: number | null; descontoCupom: number; situacao: 'pendente' | 'vendido' | 'devolvido'; linkProduto: string | null;
};
type Pedido = Omit<ResumoPedido, 'itens'> & {
  cep: string | null; entregaSituacao: string; confirmadoEm: string | null; canceladoEm: string | null;
  cliente: { id: string; nome: string; endereco: string | null; cidade: string | null };
  venda: { valor: number; data: string } | null; cupom: { beneficio: string; descricao: string | null } | null;
  itens: ItemDetalhe[]; historico: RegistroHistorico[];
  pagamentos: { id: number; forma: 'pix' | 'debito' | 'credito' | 'dinheiro' | 'mercado_pago'; valor: number; parcelas: number | null; recebido: number | null }[];
};
type Props = {
  pedido: Pedido; cupomGerado: { codigo: string; regra: string; inicioEm: string; fimEm: string | null; quemAplica: string } | null;
  cores: Record<number, CorDoModelo[]>; cupomEdicao: CupomDoPedido | null; diasExpiracao: number; site: string;
};

function Secao({ icone, titulo, extra, tom, children }: { icone: ReactNode; titulo: string; extra?: ReactNode; tom?: 'destaque' | 'perigo'; children: ReactNode }) {
  return (
    <Card sx={{ borderColor: tom === 'destaque' ? 'primary.main' : tom === 'perigo' ? 'error.light' : 'divider', borderWidth: tom === 'destaque' ? 2 : 1 }}>
      <CardHeader avatar={icone} title={titulo} action={extra} slotProps={{ title: { variant: 'subtitle1', sx: { fontWeight: 700 } } }} sx={{ pb: 0, '& .MuiCardHeader-avatar': { color: tom === 'perigo' ? 'error.main' : 'secondary.main' }, '& .MuiCardHeader-action': { alignSelf: 'center', m: 0 } }} />
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const Linha = ({ rotulo, valor, cor }: { rotulo: ReactNode; valor: ReactNode; cor?: string }) => (
  <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2, fontSize: 14, color: cor }}><span>{rotulo}</span><Box component="span" sx={{ whiteSpace: 'nowrap' }}>{valor}</Box></Stack>
);

/** Porta de src/app/(painel)/painel/pedidos/[id]/page.tsx (o quadro do pagamento online vem com a fase 6). */
export default function DetalhePedido({ pedido: p, cupomGerado, cores, cupomEdicao, diasExpiracao }: Props) {
  const { usuario, flash } = usePage().props;
  const gestor = usuario?.papel === 'gestor';
  const cond = p.tipo === 'condicional';
  const criado = new Date(p.criadoEm);
  const v = valoresDoPedido(p);
  const motivoCancelamento = p.historico.find(h => h.acao === 'cancelado')?.observacao;
  const fim = expiraEm(criado, diasExpiracao);
  const vencido = prazoVencido({ status: p.status, criadoEm: criado }, diasExpiracao);
  const cancelado = p.status === 'cancelado';
  const unidades = p.itens.filter(i => i.situacao !== 'devolvido').reduce((a, i) => a + i.quantidade, 0);
  const contam = p.itens.filter(i => (cond && p.status === 'confirmado' ? i.situacao === 'vendido' : i.situacao !== 'devolvido'));
  const desconto = Math.round(contam.reduce((a, i) => a + Math.max(0, (i.precoTabela ?? i.precoUnitario) - i.precoUnitario) * i.quantidade, 0) * 100) / 100;
  const OrigemIcone = p.origem === 'balcao' ? PointOfSaleOutlined : p.origem === 'vendedor' ? PersonOutlined : StorefrontOutlined;
  const nomeVendedor = usuario?.papel === 'vendedor' ? usuario.nome : p.vendedor.nome;
  const situacao = useForm({ pagamento: p.pagamentoSituacao === 'estornado' ? 'a_combinar' : p.pagamentoSituacao, entrega: p.entregaSituacao });

  // Linha do tempo: recebido → pagamento → venda → entrega (no balcão a venda já nasce paga e entregue).
  const passos = [
    { titulo: p.origem === 'balcao' ? 'Venda na loja' : 'Recebido', detalhe: formatarDataHora(criado), feito: true, icone: <ShoppingBag fontSize="small" /> },
    ...(p.origem === 'balcao' ? [] : [{ titulo: 'Pagamento', detalhe: SITUACOES_PAGAMENTO[p.pagamentoSituacao] ?? (p.pagamentoSituacao === 'estornado' ? 'Estornado' : '—'), feito: p.pagamentoSituacao === 'pago', icone: <CreditCard fontSize="small" /> }]),
    { titulo: cond ? 'Condicional fechado' : 'Venda confirmada', detalhe: p.status === 'confirmado' ? (p.venda ? formatarData(p.venda.data) : 'feito') : cancelado ? '—' : vencido ? 'prazo vencido' : 'aguardando', feito: p.status === 'confirmado', icone: <Check fontSize="small" /> },
    ...(p.origem === 'balcao' ? [] : [{ titulo: 'Entrega', detalhe: SITUACOES_ENTREGA[p.entregaSituacao] ?? '—', feito: p.entregaSituacao === 'entregue', icone: <LocalShipping fontSize="small" /> }]),
  ];
  const atual = passos.findIndex(x => !x.feito);
  const avisar = flash.avisarCliente && p.telefoneCliente ? linkWhatsApp(p.telefoneCliente, mensagemPedidoAlterado({
    codigo: p.codigo, nomeCliente: p.nomeCliente, nomeVendedor, condicional: cond, frete: p.frete,
    cupom: p.codigoCupom ? { codigo: p.codigoCupom, desconto: p.descontoCupom, freteGratis: p.freteCupom } : null,
    itens: p.itens.map(i => ({ nome: i.nome, marca: i.marca, referencia: i.referencia, tamanho: i.tamanho, cor: i.cor, codigoInterno: i.codigoInterno, quantidade: i.quantidade, preco: i.precoUnitario, precoTabela: i.precoTabela })),
  })) : null;

  return (
    <PainelLayout titulo={p.codigo}>
      <Head title={p.codigo} />
      <Link href="/painel/pedidos" variant="body2" color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}><ArrowBack fontSize="small" />Pedidos</Link>

      <Stack direction="row" sx={{ mt: 1.5, mb: 2, justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 1.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="overline" color="secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><OrigemIcone fontSize="small" />{p.origem === 'vendedor' ? 'Seleção do vendedor' : p.origem === 'balcao' ? 'Venda na loja' : 'Loja online'}</Typography>
          <Typography variant="h4" component="h1">{p.codigo}</Typography>
          <Stack direction="row" sx={{ mt: 1, gap: 0.75, alignItems: 'center', flexWrap: 'wrap', color: 'text.secondary', fontSize: 14 }}>
            <EtiquetaTipo tipo={p.tipo} /> <EtiquetaStatus status={p.status} />
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}><CalendarMonth sx={{ fontSize: 16 }} />{formatarDataHora(criado)}</Box>
            <span>· {unidades} {unidades === 1 ? 'peça' : 'peças'} · <Box component="strong" sx={{ color: 'text.primary' }}>{brl(v.total)}</Box></span>
            {p.status === 'pendente' && fim && !vencido && <Etiqueta cor={diasAte(fim) <= 2 ? 'vermelho' : 'cinza'}><Schedule sx={{ fontSize: 13, verticalAlign: '-2px' }} /> Responder até {formatarDataHora(fim)}</Etiqueta>}
          </Stack>
          {cancelado && textoCancelamento(p.motivoCancelamento, false) && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{textoCancelamento(p.motivoCancelamento, false)}{p.canceladoEm ? ` em ${formatarDataHora(p.canceladoEm)}` : ''}{motivoCancelamento ? `: “${motivoCancelamento}”` : ''}</Typography>
          )}
        </Box>
        {p.telefoneCliente && <Button variant="contained" color="whatsapp" startIcon={<WhatsApp />} href={linkWhatsApp(p.telefoneCliente, mensagemContato(p.nomeCliente, p.tipo, p.codigo))} target="_blank" rel="noopener">WhatsApp do cliente</Button>}
      </Stack>

      {flash.sucesso && (
        <Alert severity="success" sx={{ mb: 2 }} action={avisar ? <Button color="inherit" size="small" href={avisar} target="_blank" rel="noopener" startIcon={<WhatsApp />}>Avisar a cliente</Button> : undefined}>{flash.sucesso}</Alert>
      )}

      <Card component="ol" aria-label="Situação do pedido" sx={{ m: 0, mb: 2, px: 2, py: 1.5, listStyle: 'none', display: 'grid', gap: 1.5, overflowX: 'auto', gridTemplateColumns: `repeat(${passos.length + (cancelado ? 1 : 0)}, minmax(8.5rem, 1fr))`, opacity: cancelado ? 0.85 : 1 }}>
        {passos.map((x, i) => {
          const agora = !cancelado && i === atual;
          return (
            <Stack component="li" key={x.titulo} direction="row" sx={{ gap: 1, alignItems: 'center', minWidth: 0 }}>
              <Avatar sx={{ width: 32, height: 32, bgcolor: x.feito ? 'success.main' : agora ? (vencido ? 'error.main' : 'primary.main') : 'background.default', color: x.feito || agora ? '#fff' : 'text.secondary', border: x.feito || agora ? 0 : 1, borderColor: 'marca.borda-forte' }}>{x.feito ? <Check fontSize="small" /> : x.icone}</Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 600, color: x.feito || agora ? 'text.primary' : 'text.secondary' }}>{x.titulo}</Typography>
                <Typography variant="caption" noWrap sx={{ display: 'block', color: agora && vencido ? 'error.main' : 'text.secondary' }}>{x.detalhe}</Typography>
              </Box>
            </Stack>
          );
        })}
        {cancelado && (
          <Stack component="li" direction="row" sx={{ gap: 1, alignItems: 'center' }}>
            <Avatar sx={{ width: 32, height: 32, bgcolor: 'error.main' }}><Close fontSize="small" /></Avatar>
            <Box><Typography variant="body2" sx={{ fontWeight: 600, color: 'error.main' }}>Cancelamento</Typography><Typography variant="caption" color="text.secondary">{p.canceladoEm ? formatarDataHora(p.canceladoEm) : '—'}</Typography></Box>
          </Stack>
        )}
      </Card>

      {vencido && (
        <Alert severity="error" variant="outlined" icon={<WarningAmber />} sx={{ mb: 2 }} role="status">
          O prazo de resposta venceu{fim ? ` em ${formatarDataHora(fim)}` : ''}. Não cancela sozinho: confirme ou use <strong>Cancelar pedido</strong>{cond ? ' (a reserva volta ao estoque)' : ''}.
        </Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1fr) 360px' }, gap: 2, alignItems: 'start' }}>
        <Stack sx={{ gap: 2, minWidth: 0 }}>
          <Secao icone={<Inventory2 />} titulo="Peças" extra={<Typography variant="caption">{unidades} {unidades === 1 ? 'peça' : 'peças'}</Typography>}>
            {p.status === 'pendente' ? (
              <PecasDoPedido pedidoId={p.id} cores={cores} cupom={cupomEdicao} itens={p.itens.map(i => ({
                id: i.id, varianteId: i.varianteId, produtoId: i.produtoId, referencia: i.referencia, nome: i.nome, marca: i.marca, cor: i.cor, imagem: i.imagem,
                tamanho: i.tamanho, codigoInterno: i.codigoInterno, quantidade: i.quantidade, preco: i.precoUnitario, precoTabela: i.precoTabela, linkProduto: i.linkProduto,
              }))} />
            ) : (
              <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
                {p.itens.map(i => (
                  <Stack key={i.id} direction="row" sx={{ py: 1.5, gap: 1.5, opacity: i.situacao === 'devolvido' ? 0.5 : 1 }}>
                    <Foto src={i.imagem} alt={i.nome} largura={48} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      {i.linkProduto ? <Link href={i.linkProduto} sx={{ fontWeight: 600 }}>{i.nome}</Link> : <Typography sx={{ fontWeight: 600 }}>{i.nome}</Typography>}
                      <Typography variant="body2" color="text.secondary">{i.marca} · Ref. {i.referencia}{i.cor ? ` · ${i.cor}` : ''}</Typography>
                      <Stack direction="row" sx={{ mt: 0.5, gap: 0.75, flexWrap: 'wrap' }}>
                        <Etiqueta>Tam. {i.tamanho}</Etiqueta>
                        {i.codigoInterno && <Etiqueta cor="cinza">Cód. {i.codigoInterno}</Etiqueta>}
                        {i.situacao === 'vendido' && cond && <Etiqueta cor="oliva">Ficou</Etiqueta>}
                        {i.situacao === 'devolvido' && <Etiqueta cor="cinza">Voltou</Etiqueta>}
                      </Stack>
                    </Box>
                    <Box sx={{ textAlign: 'right', fontSize: 14 }}>
                      <div>{i.quantidade} x {i.precoTabela && i.precoTabela > i.precoUnitario && <Box component="s" sx={{ color: 'text.secondary', mr: 0.5 }}>{brl(i.precoTabela)}</Box>}{brl(i.precoUnitario)}</div>
                      <Typography sx={{ fontWeight: 800 }}>{brl(i.precoUnitario * i.quantidade)}</Typography>
                    </Box>
                  </Stack>
                ))}
              </Stack>
            )}
            <Stack sx={{ borderTop: 1, borderColor: 'divider', mt: 1, pt: 1.5, gap: 0.5 }}>
              {(desconto > 0 || v.codigoCupom || v.frete != null || v.freteACombinar) && <Linha rotulo={`Peças${desconto > 0 ? ' (preço do catálogo)' : ''}`} valor={brl(v.pecas + desconto)} />}
              {desconto > 0 && <Linha rotulo={v.codigoCupom ? 'Desconto do vendedor' : 'Desconto'} valor={`−${brl(desconto)}`} cor="success.main" />}
              {v.codigoCupom && <Linha cor="success.main" rotulo={<>Cupom <strong>{v.codigoCupom}</strong>{p.cupom && <Box component="span" sx={{ color: 'text.secondary' }}> · {p.cupom.beneficio}{p.cupom.descricao ? ` · ${p.cupom.descricao}` : ''}</Box>}</>} valor={v.freteCupom ? 'frete grátis' : `−${brl(v.cupom)}`} />}
              {(v.frete != null || v.freteACombinar) && <Linha rotulo="Frete" valor={v.freteACombinar ? 'a combinar' : v.frete ? brl(v.frete) : v.freteCupom ? 'grátis (cupom)' : 'grátis'} />}
              <Stack direction="row" sx={{ justifyContent: 'space-between', fontWeight: 800, fontSize: 18, pt: 0.5 }}><span>{v.ficaram != null ? 'Ficou com a cliente' : 'Total do pedido'}</span><span>{brl(v.total)}</span></Stack>
            </Stack>
            {p.venda && <Typography variant="body2" color="success.main" sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}><Check fontSize="small" />Venda registrada: {brl(p.venda.valor)} em {formatarDataHora(p.venda.data)}.</Typography>}
            {cupomGerado && (
              <Alert severity="success" variant="outlined" icon={<LocalOffer />} sx={{ mt: 1.5, borderStyle: 'dashed' }}
                action={p.telefoneCliente ? <Button size="small" color="success" startIcon={<WhatsApp />} target="_blank" rel="noopener" href={linkWhatsApp(p.telefoneCliente, mensagemCupomProximaCompra({
                  nomeCliente: p.nomeCliente, nomeVendedor, codigo: cupomGerado.codigo, regra: cupomGerado.regra, inicio: formatarData(cupomGerado.inicioEm),
                  fim: cupomGerado.fimEm ? formatarData(cupomGerado.fimEm) : 'sem data', link: cupomGerado.quemAplica === 'equipe' ? null : `${window.location.origin}/sacola?cupom=${cupomGerado.codigo}`,
                }))}>Enviar pelo WhatsApp</Button> : undefined}>
                <Typography variant="overline" sx={{ lineHeight: 1.4 }}>Cupom de próxima compra gerado</Typography>
                <div><strong>{cupomGerado.codigo}</strong> · {cupomGerado.regra} · vale de {formatarData(cupomGerado.inicioEm)}{cupomGerado.fimEm ? ` a ${formatarData(cupomGerado.fimEm)}` : ''}</div>
              </Alert>
            )}
          </Secao>
          <Secao icone={<History />} titulo="Histórico"><HistoricoPedido historico={p.historico} nomeCliente={p.nomeCliente} /></Secao>
        </Stack>

        <Stack sx={{ gap: 2, minWidth: 0, position: { lg: 'sticky' }, top: { lg: 136 } }}>
          {p.status === 'pendente' && (
            <Secao tom="destaque" icone={<Check />} titulo={cond ? 'Fechar o condicional' : 'Próximo passo'}>
              <FecharPedido key={p.itens.map(i => `${i.id}:${i.varianteId}:${i.quantidade}:${i.precoUnitario}`).join() + p.codigoCupom} pedidoId={p.id} codigo={p.codigo} condicional={cond} vencido={vencido}
                cupom={p.codigoCupom ? { codigo: p.codigoCupom, desconto: p.descontoCupom } : null}
                itens={p.itens.map(i => ({ id: i.id, nome: i.nome, tamanho: i.tamanho, quantidade: i.quantidade, preco: i.precoUnitario, imagem: i.imagem }))} />
            </Secao>
          )}
          <Secao icone={<Person />} titulo="Cliente">
            <Stack direction="row" sx={{ gap: 1.5, alignItems: 'flex-start' }}>
              <Avatar sx={{ bgcolor: 'primary.main' }}>{p.nomeCliente.trim()[0]?.toUpperCase()}</Avatar>
              <Stack sx={{ gap: 0.5, minWidth: 0, fontSize: 14 }}>
                <Link href={`/painel/clientes/${p.cliente.id}`} sx={{ fontWeight: 600 }}>{p.nomeCliente}</Link>
                {p.telefoneCliente && <Box sx={{ display: 'inline-flex', gap: 0.75, alignItems: 'center', color: 'text.secondary' }}><Phone sx={{ fontSize: 15 }} /><Box component="span" sx={{ color: 'text.primary' }}>{p.telefoneCliente}</Box></Box>}
                {(p.cliente.endereco || p.cliente.cidade) && <Box sx={{ display: 'inline-flex', gap: 0.75, color: 'text.secondary' }}><Place sx={{ fontSize: 15, mt: '2px' }} />{[p.cliente.endereco, p.cliente.cidade].filter(Boolean).join(' · ')}</Box>}
                {p.cep && <Box sx={{ color: 'text.secondary' }}>CEP de entrega: <Box component="strong" sx={{ color: 'text.primary' }}>{p.cep}</Box></Box>}
                <Typography variant="caption" color="text.secondary">Vendedor: {p.vendedor.nome}</Typography>
              </Stack>
            </Stack>
          </Secao>
          {p.origem !== 'balcao' && !cancelado && (
            <Secao icone={<LocalShipping />} titulo="Pagamento e entrega">
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>Para o que foi combinado fora do site. O pagamento online atualiza sozinho.</Typography>
              <Box component="form" onSubmit={e => { e.preventDefault(); situacao.post(`/painel/pedidos/${p.id}/situacao`, { preserveScroll: true }); }} sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                <TextField select label="Pagamento" value={situacao.data.pagamento} onChange={e => situacao.setData('pagamento', e.target.value)}>
                  {Object.entries(SITUACOES_PAGAMENTO).map(([valor, rotulo]) => <MenuItem key={valor} value={valor}>{rotulo}</MenuItem>)}
                </TextField>
                <TextField select label="Entrega" value={situacao.data.entrega} onChange={e => situacao.setData('entrega', e.target.value)}>
                  {Object.entries(SITUACOES_ENTREGA).map(([valor, rotulo]) => <MenuItem key={valor} value={valor}>{rotulo}</MenuItem>)}
                </TextField>
                {(situacao.errors as Record<string, string>).erro && <Alert severity="error" sx={{ gridColumn: '1 / -1' }}>{(situacao.errors as Record<string, string>).erro}</Alert>}
                <Box sx={{ gridColumn: '1 / -1' }}><Button type="submit" variant="outlined" size="small" loading={situacao.processing}>Salvar</Button></Box>
              </Box>
            </Secao>
          )}
          {p.pagamentos.length > 0 && (
            <Secao icone={<CreditCard />} titulo={p.origem === 'balcao' ? 'Pagamento no caixa' : 'Pagamentos recebidos'}>
              <Stack sx={{ gap: 0.75 }}>{p.pagamentos.map(g => <Linha key={g.id} rotulo={descreverPagamento(g, brl)} valor={<strong>{brl(g.valor)}</strong>} />)}</Stack>
            </Secao>
          )}
          {p.status === 'confirmado' && (
            <Secao tom="perigo" icone={<Undo />} titulo="Desfazer a venda">
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>Devolução ou venda por engano: as peças voltam ao estoque e a venda sai das metas e relatórios.</Typography>
              <CancelarVenda pedidoId={p.id} codigo={p.codigo} condicional={cond} />
            </Secao>
          )}
          {gestor && <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>Pedido de {p.vendedor.nome}</Typography>}
        </Stack>
      </Box>
    </PainelLayout>
  );
}
