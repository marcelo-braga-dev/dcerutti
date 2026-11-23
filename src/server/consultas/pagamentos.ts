import 'server-only';
import type { Prisma, StatusCobranca } from '@prisma/client';
import { db } from '../db';
import { lerConfig } from '../config';
import { escopoVendedor, podeAcessar, type Usuario } from '../permissoes';
import { valorDoPedido } from '../pagamentos/cobrancas';
import { gatewayConfigurado } from '../pagamentos/gateway';
import { ATIVAS, ehAtiva, ehPaga, PAGAS } from '@/lib/pagamento';

/** Leituras do pagamento online (docs/27), já com o escopo de quem pede. */

function exigirGestorDe(u: Usuario) {
  if (u.papel !== 'gestor') throw new Error('Somente o gestor vê os pagamentos da loja.');
}

const COBRANCA = {
  id: true, metodo: true, status: true, valor: true, valorEstornado: true, meio: true, tipoMeio: true, parcelas: true, taxa: true, semEstoque: true,
  expiraEm: true, aprovadaEm: true, criadaEm: true, mpOrderId: true, statusMp: true, reservou: true,
} satisfies Prisma.CobrancaSelect;

const numero = (d: Prisma.Decimal | null) => (d == null ? null : Number(d));

const paraTela = (c: Prisma.CobrancaGetPayload<{ select: typeof COBRANCA }>) => ({
  ...c, valor: Number(c.valor), valorEstornado: Number(c.valorEstornado), taxa: numero(c.taxa), ativa: ehAtiva(c.status), paga: ehPaga(c.status),
});

export type CobrancaTela = ReturnType<typeof paraTela>;

/** Quadro "Pagamento online" do pedido no painel. */
export async function pagamentoDoPedido(u: Usuario, pedidoId: string) {
  const [cfg, pedido] = await Promise.all([
    lerConfig(),
    db.pedido.findUnique({
      where: { id: pedidoId },
      select: {
        id: true, codigo: true, tipo: true, status: true, origem: true, total: true, frete: true, pagamentoSituacao: true, vendedorId: true,
        venda: { select: { valor: true } }, cobrancas: { select: COBRANCA, orderBy: { criadaEm: 'desc' }, take: 20 },
      },
    }),
  ]);
  if (!pedido || !podeAcessar(u, pedido)) return null;
  const cobrancas = pedido.cobrancas.map(paraTela);
  // R-10: o registro de cada cobrança (avisos, consultas, ações), para o gestor conferir com o Mercado Pago.
  const eventos = u.papel === 'gestor' && cobrancas.length
    ? await db.eventoPagamento.findMany({
        where: { cobrancaId: { in: cobrancas.map(c => c.id) } }, orderBy: { id: 'desc' }, take: 40,
        select: { id: true, cobrancaId: true, origem: true, tipo: true, statusMp: true, erro: true, criadoEm: true },
      })
    : [];
  return {
    configurado: gatewayConfigurado(),
    cfg: cfg.pagamentoOnline,
    valor: valorDoPedido(pedido),
    cobrancas,
    ativa: cobrancas.find(c => c.ativa) ?? null,
    paga: cobrancas.find(c => c.paga) ?? null,
    podeEstornar: u.papel === 'gestor' || cfg.pagamentoOnline.quemEstorna === 'equipe',
    podeDefinirFrete: pedido.tipo === 'compra' && pedido.status === 'pendente' && !cobrancas.some(c => c.ativa || c.paga),
    frete: numero(pedido.frete),
    eventos,
  };
}

/** Página pública /pagar: só o que pode aparecer sem login (primeiro nome, peças e valores). */
export async function pedidoParaPagar(codigo: string) {
  const [cfg, p] = await Promise.all([
    lerConfig(),
    db.pedido.findUnique({
      where: { codigo },
      select: {
        id: true, codigo: true, tipo: true, status: true, origem: true, total: true, frete: true, pagamentoSituacao: true, nomeCliente: true,
        codigoCupom: true, descontoCupom: true, freteCupom: true,
        venda: { select: { valor: true } },
        cliente: { select: { email: true, user: { select: { email: true } } } },
        itens: { select: { id: true, nome: true, tamanho: true, cor: true, quantidade: true, precoUnitario: true, imagem: true, situacao: true }, orderBy: { id: 'asc' } },
        cobrancas: { select: { ...COBRANCA, pixCopiaECola: true, checkoutUrl: true }, orderBy: { criadaEm: 'desc' }, take: 5 },
      },
    }),
  ]);
  if (!p) return null;
  const cobrancas = p.cobrancas.map(c => ({ ...paraTela(c), pixCopiaECola: c.pixCopiaECola, checkoutUrl: c.checkoutUrl }));
  const condFechado = p.tipo === 'condicional' && p.status === 'confirmado';
  return {
    id: p.id, codigo: p.codigo, tipo: p.tipo, status: p.status,
    primeiroNome: p.nomeCliente.trim().split(/\s+/)[0] ?? '',
    itens: p.itens.filter(i => !condFechado || i.situacao === 'vendido').filter(i => i.situacao !== 'devolvido').map(i => ({ ...i, preco: Number(i.precoUnitario) })),
    cupom: p.codigoCupom ? { codigo: p.codigoCupom, desconto: Number(p.descontoCupom), freteGratis: p.freteCupom } : null,
    frete: numero(p.frete),
    valor: valorDoPedido(p),
    pago: cobrancas.find(c => c.paga) ?? null,
    pagoManual: p.pagamentoSituacao === 'pago' && !cobrancas.some(c => c.paga),
    /** Devolvido: só volta a cobrar quando a equipe gerar o link de novo. */
    estornado: p.pagamentoSituacao === 'estornado',
    pixAtivo: cobrancas.find(c => c.ativa && c.metodo === 'pix' && c.pixCopiaECola && (!c.expiraEm || c.expiraEm > new Date())) ?? null,
    ultima: cobrancas[0] ?? null,
    precisaEmail: !(p.cliente.email || p.cliente.user?.email),
    ligado: cfg.pagamentoOnline.ligado && gatewayConfigurado(),
    pix: cfg.pagamentoOnline.pix,
    cartao: cfg.pagamentoOnline.cartao,
    parcelasMax: cfg.pagamentoOnline.parcelasMax,
    parcelasSemJuros: cfg.pagamentoOnline.parcelasSemJuros,
    minutosPix: cfg.pagamentoOnline.minutosPix,
  };
}

export type PedidoParaPagar = NonNullable<Awaited<ReturnType<typeof pedidoParaPagar>>>;

/** Situação para a página do Pix (sondagem): o mínimo. */
export async function situacaoParaPagina(codigo: string) {
  const p = await db.pedido.findUnique({
    where: { codigo },
    select: { pagamentoSituacao: true, status: true, cobrancas: { select: { id: true, status: true, metodo: true, expiraEm: true, mpOrderId: true }, orderBy: { criadaEm: 'desc' }, take: 5 } },
  });
  if (!p) return null;
  const paga = p.cobrancas.find(c => ehPaga(c.status));
  const ativa = p.cobrancas.find(c => ehAtiva(c.status));
  return { pago: !!paga, ativa: ativa ? { id: ativa.id, status: ativa.status, expiraEm: ativa.expiraEm, temOrder: !!ativa.mpOrderId } : null, ultima: p.cobrancas[0]?.status ?? null };
}

// ---------- Página Pagamentos (gestor) ----------

export type FiltroCobrancas = { status?: StatusCobranca | 'abertas' | 'pagas' | 'problemas' | null; de?: Date | null; ate?: Date | null; pagina: number };

export async function listarCobrancas(u: Usuario, f: FiltroCobrancas) {
  exigirGestorDe(u);
  const where: Prisma.CobrancaWhereInput = {
    pedido: escopoVendedor(u),
    ...(f.de || f.ate ? { criadaEm: { ...(f.de ? { gte: f.de } : {}), ...(f.ate ? { lt: f.ate } : {}) } } : {}),
    ...(f.status === 'abertas' ? { status: { in: ATIVAS } }
      : f.status === 'pagas' ? { status: { in: PAGAS } }
      : f.status === 'problemas' ? { OR: [{ semEstoque: true }, { status: 'contestada' }, { eventos: { some: { tipo: { startsWith: 'divergencia' } } } }] }
      : f.status ? { status: f.status } : {}),
  };
  const periodo: Prisma.CobrancaWhereInput = { ...(f.de || f.ate ? { aprovadaEm: { ...(f.de ? { gte: f.de } : {}), ...(f.ate ? { lt: f.ate } : {}) } } : { aprovadaEm: { not: null } }) };
  const [lista, total, recebido, porMeio, abertas] = await Promise.all([
    db.cobranca.findMany({
      where, orderBy: { criadaEm: 'desc' }, take: 50 * f.pagina,
      select: { ...COBRANCA, pedido: { select: { id: true, codigo: true, nomeCliente: true, vendedor: { select: { name: true } } } } },
    }),
    db.cobranca.count({ where }),
    db.cobranca.aggregate({ where: { ...periodo, status: { in: [...PAGAS, 'estornada'] } }, _sum: { valor: true, valorEstornado: true, taxa: true }, _count: true }),
    db.cobranca.groupBy({ by: ['metodo'], where: { ...periodo, status: { in: PAGAS } }, _sum: { valor: true }, _count: true }),
    db.cobranca.aggregate({ where: { status: { in: ATIVAS } }, _sum: { valor: true }, _count: true }),
  ]);
  const bruto = Number(recebido._sum.valor ?? 0), estornado = Number(recebido._sum.valorEstornado ?? 0), taxas = Number(recebido._sum.taxa ?? 0);
  return {
    lista: lista.map(c => ({ ...paraTela(c), pedido: c.pedido })),
    total,
    resumo: {
      pagamentos: recebido._count, bruto, estornado, taxas, liquido: Math.round((bruto - estornado - taxas) * 100) / 100,
      porMeio: porMeio.map(m => ({ metodo: m.metodo, valor: Number(m._sum.valor ?? 0), quantidade: m._count })),
      abertas: { quantidade: abertas._count, valor: Number(abertas._sum.valor ?? 0) },
    },
  };
}

/** Linha do tempo de uma cobrança (avisos, consultas e ações), para a conferência do gestor. */
export async function eventosDaCobranca(u: Usuario, cobrancaId: string) {
  exigirGestorDe(u);
  return db.eventoPagamento.findMany({ where: { cobrancaId }, orderBy: { id: 'desc' }, take: 50, select: { id: true, origem: true, tipo: true, statusMp: true, erro: true, criadoEm: true } });
}

/** Retorno do checkout: a última cobrança de cartão do pedido que chegou ao Mercado Pago. */
export async function ultimoCheckoutDoPedido(codigo: string) {
  return db.cobranca.findFirst({ where: { pedido: { codigo }, metodo: 'checkout', mpOrderId: { not: null } }, orderBy: { criadaEm: 'desc' }, select: { id: true } });
}
