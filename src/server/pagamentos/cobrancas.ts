import 'server-only';
import { randomUUID } from 'node:crypto';
import { Prisma, type MetodoCobranca, type StatusCobranca } from '@prisma/client';
import { db } from '../db';
import { invalidarCatalogo } from '../catalogo';
import { lerConfig } from '../config';
import { liberarReserva, reservar } from '../estoque';
import { notificar, gestoresAtivos, responsaveis } from '../notificacoes';
import { confirmarPedido } from '../pedidos';
import { brl } from '@/lib/dinheiro';
import { ATIVAS, PAGAS, descreverMeio, ehAtiva, ehPaga, formaDoMeio, podeMudar, ROTULO_STATUS, traduzirStatusMp, valorACobrar } from '@/lib/pagamento';
import { ErroGateway, gateway, gatewayConfigurado, type SituacaoOrder } from './gateway';
import { cancelarOrdersNoMercadoPago, ErroPagamento } from './travas';
import { chaveDoPagamento } from '../link-pedido';

/**
 * Cobranças do pagamento online (docs/27). ÚNICA porta de mudança de estado de uma cobrança, como server/estoque.ts
 * para o estoque. Regras:
 *  - o valor vem sempre do banco (RP-01) e só se cobra com frete definido (RP-02);
 *  - compra pendente: a cobrança reserva as peças enquanto está aberta (RP-03);
 *  - uma cobrança aberta por pedido; abrir de novo reaproveita a que ainda vale (RP-04);
 *  - toda mudança vem de uma consulta à API (aviso, página do Pix, retorno do checkout ou conciliação) e passa por
 *    `aplicarSituacao`, que trava a linha da cobrança: o mesmo efeito acontece uma vez só, em qualquer ordem;
 *  - divergência de valor, moeda ou referência não muda nada e avisa o gestor (RP-10).
 */

type Tx = Prisma.TransactionClient;

export { ErroPagamento };

const PEDIDO_COBRANCA = {
  id: true, codigo: true, tipo: true, status: true, origem: true, total: true, frete: true, pagamentoSituacao: true, nomeCliente: true, vendedorId: true,
  venda: { select: { valor: true } },
  cliente: { select: { email: true, user: { select: { email: true } } } },
  itens: { select: { varianteId: true, quantidade: true, nome: true, tamanho: true, situacao: true }, orderBy: { id: 'asc' as const } },
} satisfies Prisma.PedidoSelect;

type PedidoCobranca = Prisma.PedidoGetPayload<{ select: typeof PEDIDO_COBRANCA }>;

export function valorDoPedido(p: Pick<PedidoCobranca, 'tipo' | 'status' | 'origem' | 'total' | 'frete' | 'pagamentoSituacao' | 'venda'>) {
  return valorACobrar({
    tipo: p.tipo, status: p.status, origem: p.origem, total: Number(p.total), frete: p.frete == null ? null : Number(p.frete),
    pagamentoSituacao: p.pagamentoSituacao, venda: p.venda ? Number(p.venda.valor) : null,
  });
}

/** Peças de compra pendente: as que a cobrança reserva. */
const pecasParaReservar = (p: PedidoCobranca) => (p.tipo === 'compra' && p.status === 'pendente' ? p.itens : []);

async function evento(tx: Tx | typeof db, d: { cobrancaId?: string | null; origem: string; tipo: string; mpOrderId?: string | null; statusMp?: string | null; dados?: Prisma.InputJsonValue; erro?: string | null; requestId?: string | null; processado?: boolean }) {
  await tx.eventoPagamento.create({
    data: {
      cobrancaId: d.cobrancaId ?? null, origem: d.origem, tipo: d.tipo.slice(0, 60), mpOrderId: d.mpOrderId ?? null, statusMp: d.statusMp?.slice(0, 60) ?? null,
      dados: d.dados, erro: d.erro ?? null, requestId: d.requestId ?? null, processadoEm: d.processado === false ? null : new Date(),
    },
  });
}

/** Resumo da order para o registro: sem o código do Pix (longo) e sem nada do pagador. */
const resumo = (s: SituacaoOrder): Prisma.InputJsonValue => ({
  status: s.status, detalhe: s.statusDetalhe, referencia: s.referencia, total: s.valorTotal, pago: s.valorPago, moeda: s.moeda,
  meio: s.meio, tipo: s.tipoMeio, parcelas: s.parcelas, taxa: s.taxa, estornado: s.valorEstornado,
});

/** Reserva as peças; se uma faltar, devolve as já reservadas e responde false (nada fica pela metade). */
async function reservarTudo(tx: Tx, itens: { varianteId: number; quantidade: number }[]) {
  const feitas: { varianteId: number; quantidade: number }[] = [];
  try {
    for (const i of itens) {
      await reservar(tx, i.varianteId, i.quantidade);
      feitas.push(i);
    }
    return true;
  } catch {
    for (const i of feitas) await liberarReserva(tx, i.varianteId, i.quantidade);
    return false;
  }
}

async function liberarTudo(tx: Tx, itens: { varianteId: number; quantidade: number }[]) {
  for (const i of itens) await liberarReserva(tx, i.varianteId, i.quantidade);
}

// ---------- Criar ----------

export type CobrancaCriada = {
  id: string; metodo: MetodoCobranca; status: StatusCobranca; valor: number; pixCopiaECola: string | null; checkoutUrl: string | null; expiraEm: Date | null; reaproveitada: boolean;
};

const MARGEM_REAPROVEITAR_MS = 3 * 60_000;

/**
 * Cria (ou reaproveita) a cobrança do pedido. `email`: e-mail informado na página, quando a ficha não tem. Lança
 * ErroPagamento com a mensagem para a tela.
 */
export async function criarCobranca(p: { pedidoId: string; metodo: MetodoCobranca; criadaPorId: string | null; email?: string | null; site: string }): Promise<CobrancaCriada> {
  const cfg = (await lerConfig()).pagamentoOnline;
  if (!cfg.ligado) throw new ErroPagamento('O pagamento online está desligado.');
  if (p.metodo === 'pix' ? !cfg.pix : !cfg.cartao) throw new ErroPagamento(p.metodo === 'pix' ? 'O Pix online está desligado.' : 'O pagamento com cartão está desligado.');
  if (!gatewayConfigurado()) throw new ErroPagamento('O pagamento online ainda não foi configurado no servidor (credenciais do Mercado Pago).');
  const minutos = p.metodo === 'pix' ? cfg.minutosPix : cfg.minutosCheckout;

  type Preparo = { reaproveitada: CobrancaCriada } | { nova: { id: string; chave: string; valor: number; pedido: PedidoCobranca; email: string | null }; cancelar: string[] };
  const preparo: Preparo = await db.$transaction(async tx => {
    const [trava] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM pedido WHERE id = ${p.pedidoId} FOR UPDATE`;
    if (!trava) throw new ErroPagamento('Pedido não encontrado.');
    const pedido = await tx.pedido.findUniqueOrThrow({ where: { id: p.pedidoId }, select: PEDIDO_COBRANCA });
    const valor = valorDoPedido(pedido);
    if (!valor.ok) throw new ErroPagamento(valor.motivo);
    if (await tx.cobranca.findFirst({ where: { pedidoId: pedido.id, status: { in: PAGAS } }, select: { id: true } }))
      throw new ErroPagamento('Este pedido já foi pago online.');

    // RP-04: a aberta do mesmo meio, com o mesmo valor e tempo de sobra, é reaproveitada; as outras abertas saem.
    const abertas = await tx.cobranca.findMany({ where: { pedidoId: pedido.id, status: { in: ATIVAS } }, orderBy: { criadaEm: 'desc' } });
    const serve = abertas.find(c => c.metodo === p.metodo && c.status === 'pendente' && c.mpOrderId && Number(c.valor) === valor.valor
      && (!c.expiraEm || c.expiraEm.getTime() - Date.now() > MARGEM_REAPROVEITAR_MS) && (p.metodo === 'pix' ? !!c.pixCopiaECola : !!c.checkoutUrl));
    if (serve)
      return { reaproveitada: { id: serve.id, metodo: serve.metodo, status: serve.status, valor: Number(serve.valor), pixCopiaECola: serve.pixCopiaECola, checkoutUrl: serve.checkoutUrl, expiraEm: serve.expiraEm, reaproveitada: true } };
    const cancelar: string[] = [];
    let reservaHerdada = false;
    for (const c of abertas) {
      // A reserva passa para a cobrança nova, sem soltar e prender de novo (outra pessoa poderia pegar a peça no meio).
      if (c.reservou) reservaHerdada = true;
      await tx.cobranca.update({ where: { id: c.id }, data: { status: 'cancelada', reservou: false } });
      await evento(tx, { cobrancaId: c.id, origem: 'acao', tipo: 'substituida', mpOrderId: c.mpOrderId });
      if (c.mpOrderId) cancelar.push(c.mpOrderId);
    }

    const email = (p.email?.trim().toLowerCase() || pedido.cliente.email || pedido.cliente.user?.email || '').trim() || null;
    if (p.metodo === 'pix' && !email) throw new ErroPagamento('Informe um e-mail para gerar o Pix (o Mercado Pago exige).');

    const pecas = pecasParaReservar(pedido);
    let reservou = reservaHerdada && pecas.length > 0;
    if (!reservou && pecas.length) {
      if (!(await reservarTudo(tx, pecas))) throw new ErroPagamento('Uma das peças do pedido acabou no estoque. Fale com a loja para trocar a peça antes de pagar.');
      reservou = true;
    }
    if (reservaHerdada && !pecas.length) await liberarTudo(tx, pedido.itens);

    const chave = randomUUID();
    const nova = await tx.cobranca.create({
      data: {
        pedidoId: pedido.id, metodo: p.metodo, valor: new Prisma.Decimal(valor.valor.toFixed(2)), chave, reservou,
        expiraEm: new Date(Date.now() + minutos * 60_000), criadaPorId: p.criadaPorId,
      },
    });
    if (pedido.pagamentoSituacao === 'a_combinar' || pedido.pagamentoSituacao === 'estornado')
      await tx.pedido.update({ where: { id: pedido.id }, data: { pagamentoSituacao: 'aguardando' } });
    await evento(tx, { cobrancaId: nova.id, origem: 'acao', tipo: 'criada', dados: { metodo: p.metodo, valor: valor.valor, reservou, por: p.criadaPorId } });
    return { nova: { id: nova.id, chave, valor: valor.valor, pedido, email }, cancelar };
  });

  if ('reaproveitada' in preparo) return preparo.reaproveitada;
  invalidarCatalogo();
  if (preparo.cancelar.length) await cancelarOrdersNoMercadoPago(preparo.cancelar);

  const { id, chave, valor, pedido, email } = preparo.nova;
  const urlAviso = urlDoAviso(p.site);
  const descricao = `${pedido.tipo === 'condicional' ? 'Condicional' : 'Pedido'} ${pedido.codigo}`;
  let s: SituacaoOrder;
  try {
    s = p.metodo === 'pix'
      ? await gateway().criarPix({ chave, referencia: id, valor, descricao, pagador: { email: email!, nome: pedido.nomeCliente }, minutos, urlAviso })
      : await gateway().criarCheckout({
          chave, referencia: id, valor, descricao, pagador: { email, nome: pedido.nomeCliente }, minutos, urlAviso,
          itens: [{ titulo: `${descricao} · ${pedido.itens.length} ${pedido.itens.length === 1 ? 'peça' : 'peças'}`, quantidade: 1, preco: valor, codigo: pedido.codigo }],
          urls: urlsDeRetorno(p.site, pedido.codigo), parcelasMax: cfg.parcelasMax, semJurosAte: cfg.parcelasSemJuros,
        });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.$transaction(async tx => {
      const c = await tx.cobranca.findUniqueOrThrow({ where: { id } });
      if (c.reservou) await liberarTudo(tx, pedido.itens);
      await tx.cobranca.update({ where: { id }, data: { status: 'cancelada', reservou: false } });
      await evento(tx, { cobrancaId: id, origem: 'acao', tipo: 'falha_criar', erro: msg });
    });
    invalidarCatalogo();
    console.error('Pagamento: falha ao criar a cobrança no Mercado Pago', pedido.codigo, msg);
    throw new ErroPagamento(e instanceof ErroGateway && e.codigo === 'sem_credenciais' ? e.message : 'Não foi possível gerar a cobrança agora. Tente de novo em instantes.');
  }

  await db.cobranca.update({
    where: { id },
    data: { mpOrderId: s.orderId, pixCopiaECola: s.pixCopiaECola, checkoutUrl: s.checkoutUrl, statusMp: `${s.status}/${s.statusDetalhe}`, ...(s.expiraEm ? { expiraEm: s.expiraEm } : {}) },
  });
  await aplicarSituacao(id, s, 'acao');
  const c = await db.cobranca.findUniqueOrThrow({ where: { id } });
  return { id, metodo: c.metodo, status: c.status, valor, pixCopiaECola: c.pixCopiaECola, checkoutUrl: c.checkoutUrl, expiraEm: c.expiraEm, reaproveitada: false };
}

/** Aviso por cobrança, além do configurado no painel do Mercado Pago. Só em https (o MP não chama http). */
function urlDoAviso(site: string) {
  return site.startsWith('https://') ? `${site.replace(/\/$/, '')}/api/pagamentos/mercadopago` : null;
}

export function urlsDeRetorno(site: string, codigo: string) {
  const base = `${site.replace(/\/$/, '')}/pagar/${encodeURIComponent(chaveDoPagamento(codigo))}/retorno`;
  return { sucesso: `${base}?r=sucesso`, falha: `${base}?r=falha`, pendente: `${base}?r=pendente` };
}

// ---------- Aplicar a situação lida no Mercado Pago ----------

type Efeitos = {
  mudou: boolean;
  de: StatusCobranca;
  para: StatusCobranca;
  confirmar: boolean;
  catalogo: boolean;
  avisos: { tipo: 'aprovado' | 'problema'; titulo: string; texto: string }[];
};

/**
 * Aplica a situação da order à cobrança. Idempotente: a mesma situação de novo só atualiza detalhes. Devolve o que
 * mudou; os avisos e a confirmação da venda rodam depois do commit.
 */
export async function aplicarSituacao(cobrancaId: string, s: SituacaoOrder, origem: string, requestId?: string | null): Promise<Efeitos | null> {
  const cfg = (await lerConfig()).pagamentoOnline;
  const ef = await db.$transaction(async tx => {
    const [trava] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM cobranca WHERE id = ${cobrancaId} FOR UPDATE`;
    if (!trava) return null;
    const c = await tx.cobranca.findUniqueOrThrow({ where: { id: cobrancaId }, include: { pedido: { select: PEDIDO_COBRANCA }, pagamento: true } });
    const de = c.status;
    const para = traduzirStatusMp(s.status, s.statusDetalhe);
    const base = { cobrancaId, origem, mpOrderId: s.orderId, statusMp: `${s.status}/${s.statusDetalhe}`, dados: resumo(s), requestId };
    const efeitos: Efeitos = { mudou: false, de, para, confirmar: false, catalogo: false, avisos: [] };
    const pedido = c.pedido;
    const quem = `${pedido.codigo} · ${pedido.nomeCliente}`;

    // RP-10: a order precisa ser desta cobrança.
    const referenciaErrada = s.referencia != null && s.referencia !== c.id;
    const orderErrada = c.mpOrderId != null && c.mpOrderId !== s.orderId;
    if (referenciaErrada || orderErrada) {
      await evento(tx, { ...base, tipo: 'divergencia_referencia', erro: `referência ${s.referencia} / order ${s.orderId}` });
      efeitos.avisos.push({ tipo: 'problema', titulo: `Pagamento com referência divergente em ${pedido.codigo}`, texto: 'Um aviso do Mercado Pago não confere com a cobrança. Nada foi alterado; confira no painel do Mercado Pago.' });
      return efeitos;
    }
    if (!podeMudar(de, para)) {
      await evento(tx, { ...base, tipo: `ignorado_${de}_para_${para}` });
      return efeitos;
    }
    const entraPaga = ehPaga(para) && !ehPaga(de) && para !== 'contestada';
    if (entraPaga) {
      const pago = s.valorPago ?? s.valorTotal;
      const valorOk = pago != null && Math.abs(pago - Number(c.valor)) < 0.01;
      const moedaOk = !s.moeda || s.moeda === 'BRL';
      if (!valorOk || !moedaOk) {
        await evento(tx, { ...base, tipo: 'divergencia_valor', erro: `esperado ${Number(c.valor)} BRL, veio ${pago} ${s.moeda ?? ''}` });
        efeitos.avisos.push({ tipo: 'problema', titulo: `Valor pago diferente em ${pedido.codigo}`, texto: `Esperado ${brl(Number(c.valor))}, o Mercado Pago informa ${pago == null ? 'sem valor' : brl(pago)}. Nada foi alterado: confira e, se for o caso, estorne no Mercado Pago.` });
        return efeitos;
      }
    }

    const dados: Prisma.CobrancaUpdateInput = {
      status: para, mpOrderId: s.orderId, statusMp: `${s.status}/${s.statusDetalhe}`.slice(0, 60), consultadaEm: new Date(),
      ...(s.pagamentoId ? { mpPaymentId: s.pagamentoId } : {}),
      ...(s.meio ? { meio: s.meio.slice(0, 30) } : {}), ...(s.tipoMeio ? { tipoMeio: s.tipoMeio.slice(0, 30) } : {}),
      ...(s.parcelas ? { parcelas: s.parcelas } : {}), ...(s.taxa != null ? { taxa: new Prisma.Decimal(s.taxa.toFixed(2)) } : {}),
      valorEstornado: new Prisma.Decimal((s.valorEstornado ?? 0).toFixed(2)),
      ...(s.pixCopiaECola && !c.pixCopiaECola ? { pixCopiaECola: s.pixCopiaECola } : {}),
      ...(s.checkoutUrl && !c.checkoutUrl ? { checkoutUrl: s.checkoutUrl } : {}),
    };
    efeitos.mudou = de !== para;

    if (entraPaga) {
      dados.aprovadaEm = c.aprovadaEm ?? new Date();
      const forma = formaDoMeio(s.meio, s.tipoMeio);
      const valorLinha = new Prisma.Decimal((Number(c.valor) - (s.valorEstornado ?? 0)).toFixed(2));
      if (!c.pagamento)
        await tx.pagamento.create({ data: { pedidoId: pedido.id, cobrancaId: c.id, forma, valor: valorLinha, parcelas: forma === 'credito' ? s.parcelas ?? 1 : null } });
      await tx.pedido.update({ where: { id: pedido.id }, data: { pagamentoSituacao: 'pago' } });
      const outras = await tx.cobranca.count({ where: { pedidoId: pedido.id, id: { not: c.id }, status: { in: PAGAS } } });
      if (outras) efeitos.avisos.push({ tipo: 'problema', titulo: `${pedido.codigo} foi pago duas vezes`, texto: `A cliente pagou mais de uma cobrança deste pedido. Estorne uma delas no quadro Pagamento online.` });

      if (pedido.status === 'cancelado') {
        efeitos.avisos.push({ tipo: 'problema', titulo: `Pagamento em pedido cancelado: ${pedido.codigo}`, texto: `${brl(Number(c.valor))} entrou depois do cancelamento. Estorne no quadro Pagamento online ou refaça o pedido.` });
      } else if (pedido.tipo === 'compra' && pedido.status === 'pendente') {
        // RP-07: a reserva venceu antes de o pagamento chegar? Tenta reservar de novo.
        if (!c.reservou) {
          if (await reservarTudo(tx, pedido.itens)) { dados.reservou = true; efeitos.catalogo = true; }
          else {
            dados.semEstoque = true;
            efeitos.avisos.push({ tipo: 'problema', titulo: `Pago, mas uma peça acabou: ${pedido.codigo}`, texto: `${quem} pagou ${brl(Number(c.valor))}, e uma das peças já não está no estoque. Troque a peça com a cliente ou estorne.` });
          }
        }
        efeitos.confirmar = cfg.confirmarAoPagar && !dados.semEstoque && !outras;
      }
      efeitos.avisos.push({ tipo: 'aprovado', titulo: `Pagamento aprovado: ${pedido.codigo}`, texto: `${quem} pagou ${brl(Number(c.valor))} (${descreverMeio({ meio: s.meio, parcelas: s.parcelas })}).` });
    }

    if (ehAtiva(de) && !ehAtiva(para) && !ehPaga(para) && c.reservou) {
      // Vencida, recusada ou cancelada: a reserva volta.
      await liberarTudo(tx, pedido.itens);
      dados.reservou = false;
      efeitos.catalogo = true;
    }

    if (para === 'estornada' && de !== 'estornada') {
      if (c.pagamento) await tx.pagamento.delete({ where: { id: c.pagamento.id } });
      const outras = await tx.cobranca.count({ where: { pedidoId: pedido.id, id: { not: c.id }, status: { in: PAGAS } } });
      if (!outras) await tx.pedido.update({ where: { id: pedido.id }, data: { pagamentoSituacao: 'estornado' } });
      if (c.reservou && pedido.status === 'pendente') { await liberarTudo(tx, pedido.itens); dados.reservou = false; efeitos.catalogo = true; }
    }
    if (para === 'estornada_parcial' && c.pagamento)
      await tx.pagamento.update({ where: { id: c.pagamento.id }, data: { valor: new Prisma.Decimal((Number(c.valor) - (s.valorEstornado ?? 0)).toFixed(2)) } });
    if (para === 'contestada' && de !== 'contestada')
      efeitos.avisos.push({ tipo: 'problema', titulo: `Contestação de pagamento: ${pedido.codigo}`, texto: `A cliente contestou ${brl(Number(c.valor))} no cartão. Responda no painel do Mercado Pago com o comprovante da entrega.` });

    await tx.cobranca.update({ where: { id: c.id }, data: dados });
    await evento(tx, { ...base, tipo: efeitos.mudou ? `${de}_para_${para}` : `sem_mudanca_${para}` });
    return efeitos;
  });
  if (!ef) return null;
  if (ef.catalogo) invalidarCatalogo();
  if (ef.confirmar || ef.avisos.length) await depoisDeAplicar(cobrancaId, ef);
  return ef;
}

/** Confirma a venda (se a loja quiser) e avisa a equipe. Nunca lança: o pagamento já está gravado. */
async function depoisDeAplicar(cobrancaId: string, ef: Efeitos) {
  const c = await db.cobranca.findUnique({ where: { id: cobrancaId }, select: { pedido: { select: { id: true, codigo: true, vendedorId: true, status: true } } } });
  if (!c) return;
  const { pedido } = c;
  if (ef.confirmar && pedido.status === 'pendente') {
    try {
      await confirmarPedido(pedido.id, {}, null);
      await db.pedidoHistorico.updateMany({ where: { pedidoId: pedido.id, acao: 'confirmado', observacao: null }, data: { observacao: 'Confirmado sozinho: pagamento online aprovado.' } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Pagamento: aprovado, mas a confirmação automática falhou', pedido.codigo, msg);
      ef.avisos.push({ tipo: 'problema', titulo: `Pago, mas não confirmou sozinho: ${pedido.codigo}`, texto: `${msg} Confirme o pedido pelo painel.` });
    }
  }
  const link = `/painel/pedidos/${pedido.id}`;
  const dono = await responsaveis(pedido.vendedorId);
  for (const a of ef.avisos) {
    if (a.tipo === 'aprovado')
      await notificar(dono, { tipo: 'pagamento_aprovado', titulo: a.titulo, texto: a.texto, link, chave: `pago:${cobrancaId}`, email: { assunto: a.titulo, texto: `${a.texto}\n\nAbra o pedido no painel: ${link}` } });
    else
      await notificar([...new Set([...dono, ...(await gestoresAtivos())])], { tipo: 'pagamento_problema', titulo: a.titulo.slice(0, 140), texto: a.texto, link, chave: `pgto:${cobrancaId}:${a.titulo}`.slice(0, 100), email: { assunto: a.titulo, texto: `${a.texto}\n\nPedido no painel: ${link}` } });
  }
}

// ---------- Consultar, cancelar, estornar ----------

/** Lê a order no Mercado Pago e aplica. `minimoSegundos`: não consulta de novo antes disso (página do Pix). */
export async function sincronizarCobranca(cobrancaId: string, origem: string, minimoSegundos = 0) {
  const c = await db.cobranca.findUnique({ where: { id: cobrancaId }, select: { mpOrderId: true, consultadaEm: true } });
  if (!c?.mpOrderId) return null;
  if (minimoSegundos && c.consultadaEm && Date.now() - c.consultadaEm.getTime() < minimoSegundos * 1000) return null;
  await db.cobranca.update({ where: { id: cobrancaId }, data: { consultadaEm: new Date() } });
  try {
    return await aplicarSituacao(cobrancaId, await gateway().consultar(c.mpOrderId), origem);
  } catch (e) {
    await evento(db, { cobrancaId, origem, tipo: 'falha_consulta', mpOrderId: c.mpOrderId, erro: e instanceof Error ? e.message : String(e) }).catch(() => {});
    throw e;
  }
}

/** Aviso do Mercado Pago: acha a cobrança pela order (ou pela referência) e sincroniza. */
export async function processarAviso(orderId: string, requestId: string | null) {
  let c = await db.cobranca.findUnique({ where: { mpOrderId: orderId }, select: { id: true } });
  if (!c) {
    // A order pode ter sido criada e o aviso chegar antes de gravarmos o id: a referência é o id da cobrança.
    const s = await gateway().consultar(orderId);
    c = s.referencia ? await db.cobranca.findUnique({ where: { id: s.referencia }, select: { id: true } }) : null;
    if (!c) {
      await evento(db, { origem: 'webhook', tipo: 'order_desconhecida', mpOrderId: orderId, requestId: requestId ? `${requestId}:desconhecida` : null, dados: resumo(s) });
      return null;
    }
    await db.cobranca.updateMany({ where: { id: c.id, mpOrderId: null }, data: { mpOrderId: orderId } });
    return aplicarSituacao(c.id, s, 'webhook');
  }
  return sincronizarCobranca(c.id, 'webhook');
}

/** A equipe cancela um link aberto. Se a cliente já pagou, a situação é atualizada e o cancelamento recusado. */
export async function cancelarCobranca(cobrancaId: string, usuarioId: string) {
  const c = await db.cobranca.findUnique({ where: { id: cobrancaId } });
  if (!c) throw new ErroPagamento('Cobrança não encontrada.');
  if (!ehAtiva(c.status)) throw new ErroPagamento(`Esta cobrança já está ${ROTULO_STATUS[c.status].toLowerCase()}.`);
  if (c.mpOrderId) {
    try {
      await aplicarSituacao(c.id, await gateway().cancelar(c.mpOrderId, `cancelar-${c.id}`), 'acao');
    } catch (e) {
      await sincronizarCobranca(c.id, 'acao').catch(() => null);
      const agora = await db.cobranca.findUniqueOrThrow({ where: { id: c.id }, select: { status: true } });
      if (ehPaga(agora.status)) throw new ErroPagamento('A cliente acabou de pagar esta cobrança: ela não pode mais ser cancelada.');
      if (ehAtiva(agora.status)) throw new ErroPagamento(e instanceof Error ? e.message : 'Não foi possível cancelar no Mercado Pago.');
    }
  }
  // Sem order (falhou ao criar) ou o MP respondeu sem cancelar: fecha aqui.
  const final = await db.$transaction(async tx => {
    const [trava] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM cobranca WHERE id = ${c.id} FOR UPDATE`;
    if (!trava) return null;
    const atual = await tx.cobranca.findUniqueOrThrow({ where: { id: c.id }, include: { pedido: { select: { itens: { select: { varianteId: true, quantidade: true } } } } } });
    if (ehAtiva(atual.status)) {
      if (atual.reservou) await liberarTudo(tx, atual.pedido.itens);
      await tx.cobranca.update({ where: { id: c.id }, data: { status: 'cancelada', reservou: false } });
    }
    await evento(tx, { cobrancaId: c.id, origem: 'acao', tipo: 'cancelada_pela_equipe', mpOrderId: c.mpOrderId, dados: { usuarioId } });
    return atual.reservou;
  });
  if (final) invalidarCatalogo();
}

/** RP-08: estorno no Mercado Pago. Sem `valor`, o total que falta. A situação só muda com a resposta da API. */
export async function estornarCobranca(cobrancaId: string, usuarioId: string, motivo: string, valor?: number) {
  const c = await db.cobranca.findUnique({ where: { id: cobrancaId } });
  if (!c) throw new ErroPagamento('Cobrança não encontrada.');
  if (!ehPaga(c.status)) throw new ErroPagamento('Só um pagamento aprovado pode ser estornado.');
  if (!c.mpOrderId) throw new ErroPagamento('Cobrança sem order no Mercado Pago.');
  const resta = Math.round((Number(c.valor) - Number(c.valorEstornado)) * 100) / 100;
  if (valor != null && !(valor > 0 && valor <= resta + 0.001)) throw new ErroPagamento(`Informe um valor entre R$ 0,01 e ${brl(resta)}.`);
  const parcial = valor != null && valor < resta - 0.001;
  if (parcial && !c.mpPaymentId) throw new ErroPagamento('O Mercado Pago não informou o pagamento desta cobrança: estorne pelo painel do Mercado Pago.');
  // A chave muda a cada estorno (o valor estornado até agora entra nela), e repetir o mesmo pedido não estorna duas vezes.
  const chave = `estorno-${c.id}-${Number(c.valorEstornado).toFixed(2)}-${parcial ? valor!.toFixed(2) : 'total'}`;
  await evento(db, { cobrancaId: c.id, origem: 'acao', tipo: 'estorno_pedido', mpOrderId: c.mpOrderId, dados: { usuarioId, motivo: motivo.slice(0, 300), valor: parcial ? valor! : resta } });
  let s: SituacaoOrder;
  try {
    s = await gateway().estornar(c.mpOrderId, chave, parcial ? { pagamentoId: c.mpPaymentId!, valor: valor! } : undefined);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await evento(db, { cobrancaId: c.id, origem: 'acao', tipo: 'falha_estorno', mpOrderId: c.mpOrderId, erro: msg });
    throw new ErroPagamento(`O estorno não foi feito. ${msg}`);
  }
  return aplicarSituacao(c.id, s, 'acao');
}

// ---------- Conciliação ----------

/**
 * Cron (a cada 10 min) e o próprio site (no máximo a cada 3 min): consulta as abertas, cancela as vencidas, fecha as que
 * travaram antes de chegar ao Mercado Pago e tenta de novo a confirmação automática que falhou.
 */
export async function conciliarPagamentos(agora = new Date()) {
  const r = { consultadas: 0, vencidas: 0, travadas: 0, confirmadas: 0, falhas: 0 };
  const ativas = await db.cobranca.findMany({
    where: { status: { in: ATIVAS }, mpOrderId: { not: null }, OR: [{ consultadaEm: null }, { consultadaEm: { lt: new Date(agora.getTime() - 2 * 60_000) } }] },
    select: { id: true, mpOrderId: true, expiraEm: true }, orderBy: { criadaEm: 'asc' }, take: 100,
  });
  for (const c of ativas) {
    try {
      await sincronizarCobranca(c.id, 'conciliacao');
      r.consultadas++;
      const atual = await db.cobranca.findUniqueOrThrow({ where: { id: c.id }, select: { status: true, expiraEm: true } });
      // Vencida há mais de 2 min e ainda aberta no MP: cancela lá (a cliente não paga mais) e aqui.
      if (ehAtiva(atual.status) && atual.expiraEm && atual.expiraEm.getTime() < agora.getTime() - 2 * 60_000) {
        try {
          await aplicarSituacao(c.id, await gateway().cancelar(c.mpOrderId!, `vencer-${c.id}`), 'conciliacao');
        } catch {
          await sincronizarCobranca(c.id, 'conciliacao');
        }
        const depois = await db.cobranca.findUniqueOrThrow({ where: { id: c.id }, select: { status: true } });
        if (ehAtiva(depois.status)) await fecharLocal(c.id, 'expirada', 'vencida_sem_resposta');
        r.vencidas++;
      }
    } catch (e) {
      // Order que não existe mais no Mercado Pago (ou criada com outra credencial): nunca vai ser paga, fecha aqui.
      if (e instanceof ErroGateway && e.codigo === 'order_not_found') { await fecharLocal(c.id, 'cancelada', 'order_inexistente'); r.travadas++; continue; }
      r.falhas++;
      console.error('Pagamento: falha na conciliação', c.id, e instanceof Error ? e.message : e);
    }
  }
  // Gravadas mas sem order há 10 min: o processo caiu entre gravar e chamar o MP.
  const travadas = await db.cobranca.findMany({ where: { status: 'criada', mpOrderId: null, criadaEm: { lt: new Date(agora.getTime() - 10 * 60_000) } }, select: { id: true }, take: 100 });
  for (const t of travadas) { await fecharLocal(t.id, 'cancelada', 'travada_sem_order'); r.travadas++; }

  // Aprovadas cuja confirmação automática não aconteceu (processo caiu, estoque foi acertado depois).
  if ((await lerConfig()).pagamentoOnline.confirmarAoPagar) {
    const paradas = await db.cobranca.findMany({
      where: { status: 'aprovada', semEstoque: false, aprovadaEm: { lt: new Date(agora.getTime() - 60_000) }, pedido: { status: 'pendente', tipo: 'compra' } },
      select: { id: true, pedidoId: true }, take: 50,
    });
    for (const p of paradas) {
      if (await db.cobranca.count({ where: { pedidoId: p.pedidoId, status: { in: PAGAS } } }) > 1) continue;
      try { await confirmarPedido(p.pedidoId, {}, null); r.confirmadas++; } catch (e) { r.falhas++; console.error('Pagamento: confirmação na conciliação falhou', p.pedidoId, e instanceof Error ? e.message : e); }
    }
  }
  return r;
}

async function fecharLocal(cobrancaId: string, status: 'cancelada' | 'expirada', tipo: string) {
  const liberou = await db.$transaction(async tx => {
    const [trava] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM cobranca WHERE id = ${cobrancaId} FOR UPDATE`;
    if (!trava) return false;
    const c = await tx.cobranca.findUniqueOrThrow({ where: { id: cobrancaId }, include: { pedido: { select: { itens: { select: { varianteId: true, quantidade: true } } } } } });
    if (!ehAtiva(c.status)) return false;
    if (c.reservou) await liberarTudo(tx, c.pedido.itens);
    await tx.cobranca.update({ where: { id: c.id }, data: { status, reservou: false } });
    await evento(tx, { cobrancaId: c.id, origem: 'conciliacao', tipo, mpOrderId: c.mpOrderId });
    return c.reservou;
  });
  if (liberou) invalidarCatalogo();
}

const g = globalThis as unknown as { __conciliacaoPagamentos?: number };

/** O site concilia sozinho no máximo a cada 3 minutos (o cron garante mesmo sem acesso). */
export async function talvezConciliar() {
  const agora = Date.now();
  if (g.__conciliacaoPagamentos && agora - g.__conciliacaoPagamentos < 3 * 60_000) return;
  g.__conciliacaoPagamentos = agora;
  if (!(await lerConfig()).pagamentoOnline.ligado || !gatewayConfigurado()) return;
  await conciliarPagamentos(new Date(agora)).catch(e => console.error('Pagamento: falha na conciliação automática', e));
}

/** Para os testes: libera a próxima conciliação automática. */
export function reiniciarConciliacao() {
  g.__conciliacaoPagamentos = 0;
}

/**
 * Só com o Mercado Pago simulado (PAGAMENTO_GATEWAY=falso, ambiente de teste): faz o papel da cliente pagando a cobrança
 * aberta do pedido, para a loja ver o fluxo inteiro antes de ter as credenciais. Nunca existe na produção.
 */
export async function simularPagamentoDeTeste(codigo: string) {
  if (process.env.PAGAMENTO_GATEWAY !== 'falso') throw new ErroPagamento('Disponível só no ambiente de teste.');
  const c = await db.cobranca.findFirst({ where: { pedido: { codigo }, status: { in: ATIVAS }, mpOrderId: { not: null } }, orderBy: { criadaEm: 'desc' } });
  if (!c) throw new ErroPagamento('Gere o Pix ou o pagamento com cartão primeiro.');
  const { gatewayFalso } = await import('./falso');
  try {
    gatewayFalso.simularPagamento(c.mpOrderId!, c.metodo === 'pix' ? { meio: 'pix', tipoMeio: 'bank_transfer' } : { meio: 'visa', tipoMeio: 'credit_card', parcelas: 2 });
  } catch {
    throw new ErroPagamento('O servidor reiniciou e a cobrança simulada se perdeu. Gere o pagamento de novo.');
  }
  return sincronizarCobranca(c.id, 'acao');
}
