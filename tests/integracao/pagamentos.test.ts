/**
 * Pagamento online (docs/27) contra o MariaDB, com o Mercado Pago simulado (PAGAMENTO_GATEWAY=falso): cobrança, reserva,
 * aviso assinado, aprovação, confirmação automática, vencimento, divergência, estorno, travas do pedido e a página pública.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as aviso } from '@/app/api/pagamentos/mercadopago/route';
import { cancelarCobrancaDoPedido, conferirCobranca, definirFretePedido, estornarPagamento, gerarLinkPagamento, pagar, simularPagamento } from '@/server/acoes/pagamentos';
import { cancelar, cancelarMeuPedido, editarItens } from '@/server/acoes/pedidos';
import { salvarConfig, lerConfig, PAGAMENTO_ONLINE_PADRAO } from '@/server/config';
import { listarCobrancas, pagamentoDoPedido, pedidoParaPagar } from '@/server/consultas/pagamentos';
import { chaveDoPagamento } from '@/server/link-pedido';
import { assinarAviso } from '@/server/pagamentos/assinatura';
import { aplicarSituacao, conciliarPagamentos, criarCobranca } from '@/server/pagamentos/cobrancas';
import { gatewayFalso } from '@/server/pagamentos/falso';
import { confirmarPedido, criarPedido } from '@/server/pedidos';
import { comoUsuario, db, entrarComo, estado, produtoDeTeste, usuarioPorEmail, variante } from './suporte/ajuda';
import { depoisDaResposta } from './suporte/next';

const SITE = 'https://teste.dcerutti.local';
const SEGREDO = process.env.MP_WEBHOOK_SECRET!;
let seq = 0;

async function clienteDaAna(email: string | null = `pg${Date.now()}${seq++}@exemplo.com`) {
  const ana = await usuarioPorEmail('ana@dcerutti.local');
  const d = String(Date.now() + seq++).slice(-8);
  return db.cliente.create({ data: { nome: `Cliente Pagamento ${seq}`, telefone: `(49) 9${d.slice(0, 4)}-${d.slice(4)}`, email, vendedorId: ana.id } });
}

/** Compra pendente com frete definido (padrão R$ 10) de 1 peça de R$ 100. */
async function compra(o: { frete?: number | null; estoque?: number; quantidade?: number; email?: string | null; tipo?: 'compra' | 'condicional' } = {}) {
  const c = await clienteDaAna(o.email === undefined ? undefined : o.email);
  const { v } = await produtoDeTeste({ estoque: { M: o.estoque ?? 3 }, preco: 100 });
  const p = await criarPedido({
    tipo: o.tipo ?? 'compra', origem: 'loja', clienteId: c.id, vendedorId: c.vendedorId, nomeCliente: c.nome, telefoneCliente: c.telefone,
    cep: o.tipo === 'condicional' ? '89874-000' : null, linhas: [{ varianteId: v.M, quantidade: o.quantidade ?? 1 }],
    regraFrete: o.frete === null || o.tipo === 'condicional' ? null : { valor: o.frete ?? 10, gratisAcima: 0 },
  });
  return { c, v: v.M, p };
}

const cobrancas = (pedidoId: string) => db.cobranca.findMany({ where: { pedidoId }, orderBy: { criadaEm: 'asc' } });
const pedido = (id: string) => db.pedido.findUniqueOrThrow({ where: { id }, include: { venda: true, pagamentos: true } });

/** Aviso como o Mercado Pago manda: query data.id e type, cabeçalhos assinados. */
async function avisar(orderId: string, requestId = `req-${Date.now()}-${seq++}`, segredo = SEGREDO) {
  const r = await aviso(new Request(`${SITE}/api/pagamentos/mercadopago?data.id=${orderId}&type=order`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': requestId, 'x-signature': assinarAviso(segredo, orderId, requestId) },
    body: JSON.stringify({ action: 'order.processed', type: 'order', data: { id: orderId } }),
  }));
  await depoisDaResposta();
  return r;
}

beforeAll(() => salvarConfig({ pagamentoOnline: { ...PAGAMENTO_ONLINE_PADRAO, ligado: true } }));
beforeEach(async () => {
  estado.ip = `10.9.${seq % 250}.${++seq % 250}`;
  gatewayFalso.falharProxima = null;
  await salvarConfig({ pagamentoOnline: { ...PAGAMENTO_ONLINE_PADRAO, ligado: true } });
  await entrarComo('ana@dcerutti.local');
});
afterAll(() => salvarConfig({ pagamentoOnline: PAGAMENTO_ONLINE_PADRAO }));

describe('criar a cobrança', () => {
  it('Pix: valor do banco (peças + frete), reserva as peças, order no MP e pedido aguardando', async () => {
    const { p, v } = await compra({ frete: 15 });
    const c = await criarCobranca({ pedidoId: p.id, metodo: 'pix', criadaPorId: null, site: SITE });
    expect(c).toMatchObject({ metodo: 'pix', status: 'pendente', valor: 115, reaproveitada: false });
    expect(c.pixCopiaECola).toBeTruthy();
    const [salva] = await cobrancas(p.id);
    expect(salva).toMatchObject({ reservou: true, status: 'pendente' });
    expect(salva.mpOrderId).toMatch(/^ORD/);
    expect((await variante(v)).reservado).toBe(1);
    expect((await pedido(p.id)).pagamentoSituacao).toBe('aguardando');
    const order = await gatewayFalso.consultar(salva.mpOrderId!);
    expect(order).toMatchObject({ referencia: salva.id, valorTotal: 115 });
  });

  it('abrir de novo reaproveita o Pix válido; trocar de meio cancela o anterior sem soltar a reserva', async () => {
    const { p, v } = await compra();
    const a = await criarCobranca({ pedidoId: p.id, metodo: 'pix', criadaPorId: null, site: SITE });
    const b = await criarCobranca({ pedidoId: p.id, metodo: 'pix', criadaPorId: null, site: SITE });
    expect(b).toMatchObject({ id: a.id, reaproveitada: true });
    const cartao = await criarCobranca({ pedidoId: p.id, metodo: 'checkout', criadaPorId: null, site: SITE });
    expect(cartao.checkoutUrl).toContain('checkout');
    const lista = await cobrancas(p.id);
    expect(lista.map(x => [x.metodo, x.status, x.reservou])).toEqual([['pix', 'cancelada', false], ['checkout', 'pendente', true]]);
    expect((await variante(v)).reservado).toBe(1);
    expect((await gatewayFalso.consultar(lista[0].mpOrderId!)).status).toBe('canceled');
  });

  it('frete a combinar bloqueia; a equipe informa o frete e libera', async () => {
    const { p } = await compra({ frete: null });
    await expect(criarCobranca({ pedidoId: p.id, metodo: 'pix', criadaPorId: null, site: SITE })).rejects.toThrow(/frete/);
    expect(await gerarLinkPagamento(p.id)).toMatchObject({ ok: false, precisaFrete: true });
    expect(await definirFretePedido({ pedidoId: p.id, frete: 'abc' })).toMatchObject({ ok: false });
    expect(await definirFretePedido({ pedidoId: p.id, frete: '0' })).toMatchObject({ ok: true });
    const r = await gerarLinkPagamento(p.id);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.link).toBe(`${SITE}/pagar/${chaveDoPagamento(p.codigo)}`);
      expect(r.texto).toMatch(/R\$\s100,00/);
      expect(r.whatsapp).toContain('api.whatsapp.com');
    }
    const hist = await db.pedidoHistorico.findMany({ where: { pedidoId: p.id, acao: 'editado' } });
    expect(hist.some(h => JSON.stringify(h.mudancas).includes('Frete de a combinar'))).toBe(true);
  });

  it('peça esgotada não gera cobrança e nada fica reservado', async () => {
    const { p, v } = await compra({ estoque: 1 });
    await db.variante.update({ where: { id: v }, data: { estoque: 0 } });
    await expect(criarCobranca({ pedidoId: p.id, metodo: 'pix', criadaPorId: null, site: SITE })).rejects.toThrow(/acabou/);
    expect(await cobrancas(p.id)).toEqual([]);
    await db.variante.update({ where: { id: v }, data: { estoque: 1 } });
  });

  it('falha no Mercado Pago: cobrança cancelada e a reserva volta', async () => {
    const { p, v } = await compra();
    gatewayFalso.falharProxima = 'Mercado Pago fora do ar';
    await expect(criarCobranca({ pedidoId: p.id, metodo: 'pix', criadaPorId: null, site: SITE })).rejects.toThrow(/Não foi possível gerar/);
    expect((await cobrancas(p.id)).map(c => [c.status, c.reservou])).toEqual([['cancelada', false]]);
    expect((await variante(v)).reservado).toBe(0);
    expect(await db.eventoPagamento.count({ where: { cobranca: { pedidoId: p.id }, tipo: 'falha_criar' } })).toBe(1);
  });

  it('desligado, sem e-mail para o Pix ou balcão: recusa com a mensagem certa', async () => {
    const semEmail = await compra({ email: null });
    await expect(criarCobranca({ pedidoId: semEmail.p.id, metodo: 'pix', criadaPorId: null, site: SITE })).rejects.toThrow(/e-mail/);
    expect((await variante(semEmail.v)).reservado).toBe(0);
    const ok = await criarCobranca({ pedidoId: semEmail.p.id, metodo: 'pix', criadaPorId: null, email: 'informado@exemplo.com', site: SITE });
    expect(ok.status).toBe('pendente');
    await salvarConfig({ pagamentoOnline: { ...PAGAMENTO_ONLINE_PADRAO, ligado: false } });
    const { p } = await compra();
    await expect(criarCobranca({ pedidoId: p.id, metodo: 'pix', criadaPorId: null, site: SITE })).rejects.toThrow(/desligado/);
  });
});

describe('aviso do Mercado Pago e aprovação', () => {
  it('aprovado: pagamento gravado, pedido pago e confirmado sozinho, estoque baixado usando a reserva, vendedora avisada', async () => {
    const { p, v } = await compra();
    const c = await criarCobranca({ pedidoId: p.id, metodo: 'pix', criadaPorId: null, site: SITE });
    const [salva] = await cobrancas(p.id);
    gatewayFalso.simularPagamento(salva.mpOrderId!, { meio: 'pix', tipoMeio: 'bank_transfer', taxa: 1.09 });
    const r = await avisar(salva.mpOrderId!, 'req-aprovado-1');
    expect(r.status).toBe(200);
    const depois = await db.cobranca.findUniqueOrThrow({ where: { id: c.id } });
    expect(depois).toMatchObject({ status: 'aprovada', reservou: false, meio: 'pix' });
    expect(Number(depois.taxa)).toBe(1.09);
    const ped = await pedido(p.id);
    expect(ped).toMatchObject({ status: 'confirmado', pagamentoSituacao: 'pago' });
    expect(Number(ped.venda!.valor)).toBe(100);
    expect(ped.pagamentos.map(g => [g.forma, Number(g.valor), g.cobrancaId])).toEqual([['pix', 110, c.id]]);
    const vv = await variante(v);
    expect([vv.estoque, vv.reservado]).toEqual([2, 0]);
    const ana = await usuarioPorEmail('ana@dcerutti.local');
    expect(await db.notificacao.count({ where: { usuarioId: ana.id, tipo: 'pagamento_aprovado', chave: `pago:${c.id}` } })).toBe(1);

    // O mesmo aviso de novo (mesmo x-request-id): nada muda.
    expect(await (await avisar(salva.mpOrderId!, 'req-aprovado-1')).json()).toMatchObject({ repetido: true });
    // Outro aviso da mesma situação: idempotente.
    await avisar(salva.mpOrderId!);
    expect(await db.pagamento.count({ where: { cobrancaId: c.id } })).toBe(1);
    expect(await db.venda.count({ where: { pedidoId: p.id } })).toBe(1);
  });

  it('assinatura errada ou ausente: 401 e nada é gravado; sem o segredo no servidor, 503', async () => {
    const { p } = await compra();
    await criarCobranca({ pedidoId: p.id, metodo: 'pix', criadaPorId: null, site: SITE });
    const [salva] = await cobrancas(p.id);
    gatewayFalso.simularPagamento(salva.mpOrderId!);
    expect((await avisar(salva.mpOrderId!, 'req-falso', 'outro-segredo')).status).toBe(401);
    const sem = await aviso(new Request(`${SITE}/api/pagamentos/mercadopago?data.id=${salva.mpOrderId}&type=order`, { method: 'POST', body: '{}' }));
    expect(sem.status).toBe(401);
    expect((await db.cobranca.findUniqueOrThrow({ where: { id: salva.id } })).status).toBe('pendente');
    expect(await db.eventoPagamento.count({ where: { requestId: 'req-falso' } })).toBe(0);
    const segredo = process.env.MP_WEBHOOK_SECRET;
    delete process.env.MP_WEBHOOK_SECRET;
    expect((await avisar(salva.mpOrderId!, 'req-sem-segredo', 'x')).status).toBe(503);
    process.env.MP_WEBHOOK_SECRET = segredo;
  });

  it('cartão parcelado pelo checkout: forma crédito com as parcelas', async () => {
    const { p } = await compra();
    await criarCobranca({ pedidoId: p.id, metodo: 'checkout', criadaPorId: null, site: SITE });
    const [salva] = await cobrancas(p.id);
    gatewayFalso.simularPagamento(salva.mpOrderId!, { meio: 'master', tipoMeio: 'credit_card', parcelas: 3 });
    await avisar(salva.mpOrderId!);
    const ped = await pedido(p.id);
    expect(ped.pagamentos.map(g => [g.forma, g.parcelas])).toEqual([['credito', 3]]);
  });

  it('"Confirmar ao pagar" desligado: fica pago e pendente, com a reserva; a confirmação manual usa a reserva', async () => {
    await salvarConfig({ pagamentoOnline: { ...PAGAMENTO_ONLINE_PADRAO, ligado: true, confirmarAoPagar: false } });
    const { p, v } = await compra();
    await criarCobranca({ pedidoId: p.id, metodo: 'pix', criadaPorId: null, site: SITE });
    const [salva] = await cobrancas(p.id);
    gatewayFalso.simularPagamento(salva.mpOrderId!);
    await avisar(salva.mpOrderId!);
    expect(await pedido(p.id)).toMatchObject({ status: 'pendente', pagamentoSituacao: 'pago' });
    expect((await variante(v)).reservado).toBe(1);
    await confirmarPedido(p.id, {}, (await usuarioPorEmail('ana@dcerutti.local')).id);
    const vv = await variante(v);
    expect([vv.estoque, vv.reservado]).toEqual([2, 0]);
    expect((await db.cobranca.findUniqueOrThrow({ where: { id: salva.id } })).reservou).toBe(false);
  });

  it('valor ou referência divergente: nada muda e o gestor é avisado', async () => {
    const { p } = await compra();
    await criarCobranca({ pedidoId: p.id, metodo: 'pix', criadaPorId: null, site: SITE });
    const [salva] = await cobrancas(p.id);
    gatewayFalso.simularPagamento(salva.mpOrderId!, { total: 1 });
    await avisar(salva.mpOrderId!);
    expect((await db.cobranca.findUniqueOrThrow({ where: { id: salva.id } })).status).toBe('pendente');
    expect(await pedido(p.id)).toMatchObject({ status: 'pendente', pagamentoSituacao: 'aguardando' });
    const gestor = await usuarioPorEmail('gestor@dcerutti.local');
    expect(await db.notificacao.count({ where: { usuarioId: gestor.id, tipo: 'pagamento_problema', link: `/painel/pedidos/${p.id}` } })).toBeGreaterThan(0);

    const s = await gatewayFalso.consultar(salva.mpOrderId!);
    await aplicarSituacao(salva.id, { ...s, valorTotal: 110, referencia: 'outra-cobranca' }, 'teste');
    expect((await db.cobranca.findUniqueOrThrow({ where: { id: salva.id } })).status).toBe('pendente');
    expect(await db.eventoPagamento.count({ where: { cobrancaId: salva.id, tipo: { startsWith: 'divergencia' } } })).toBe(2);
  });

  it('pago depois de vencer: reserva de novo e confirma; se a peça acabou, fica "pago, peça indisponível"', async () => {
    const a = await compra({ estoque: 1 });
    await criarCobranca({ pedidoId: a.p.id, metodo: 'pix', criadaPorId: null, site: SITE });
    const [ca] = await cobrancas(a.p.id);
    gatewayFalso.simularSituacao(ca.mpOrderId!, 'failed', 'expired');
    await avisar(ca.mpOrderId!);
    expect((await db.cobranca.findUniqueOrThrow({ where: { id: ca.id } })).status).toBe('expirada');
    expect((await variante(a.v)).reservado).toBe(0);
    gatewayFalso.simularPagamento(ca.mpOrderId!);
    await avisar(ca.mpOrderId!);
    expect(await pedido(a.p.id)).toMatchObject({ status: 'confirmado', pagamentoSituacao: 'pago' });

    const b = await compra({ estoque: 1 });
    await criarCobranca({ pedidoId: b.p.id, metodo: 'pix', criadaPorId: null, site: SITE });
    const [cb] = await cobrancas(b.p.id);
    gatewayFalso.simularSituacao(cb.mpOrderId!, 'failed', 'expired');
    await avisar(cb.mpOrderId!);
    await db.variante.update({ where: { id: b.v }, data: { estoque: 0 } }); // vendida no balcão no meio do caminho
    gatewayFalso.simularPagamento(cb.mpOrderId!);
    await avisar(cb.mpOrderId!);
    expect(await db.cobranca.findUniqueOrThrow({ where: { id: cb.id } })).toMatchObject({ status: 'aprovada', semEstoque: true, reservou: false });
    expect(await pedido(b.p.id)).toMatchObject({ status: 'pendente', pagamentoSituacao: 'pago' });
    const gestor = await usuarioPorEmail('gestor@dcerutti.local');
    expect(await db.notificacao.count({ where: { usuarioId: gestor.id, tipo: 'pagamento_problema', titulo: { contains: b.p.codigo } } })).toBeGreaterThan(0);
    // Volta ao estado consistente para os invariantes: estorna e cancela.
    await db.variante.update({ where: { id: b.v }, data: { estoque: 1 } });
    await entrarComo('gestor@dcerutti.local');
    expect(await estornarPagamento({ cobrancaId: cb.id, motivo: 'Peça acabou' })).toMatchObject({ ok: true });
    expect(await cancelar(b.p.id, 'Peça acabou')).toMatchObject({ ok: true });
  });

  it('pago duas vezes (Pix e cartão): não confirma sozinho e avisa', async () => {
    const { p } = await compra();
    await criarCobranca({ pedidoId: p.id, metodo: 'pix', criadaPorId: null, site: SITE });
    const [pix] = await cobrancas(p.id);
    await criarCobranca({ pedidoId: p.id, metodo: 'checkout', criadaPorId: null, site: SITE }); // cancela o Pix aqui...
    const [, cartao] = await cobrancas(p.id);
    gatewayFalso.simularPagamento(cartao.mpOrderId!);
    gatewayFalso.simularPagamento(pix.mpOrderId!); // ...mas a cliente já tinha pago o Pix
    await avisar(cartao.mpOrderId!);
    await avisar(pix.mpOrderId!);
    const lista = await cobrancas(p.id);
    expect(lista.map(c => c.status)).toEqual(['aprovada', 'aprovada']);
    expect(await db.notificacao.count({ where: { tipo: 'pagamento_problema', titulo: { contains: `${p.codigo} foi pago duas vezes` } } })).toBeGreaterThan(0);
    await entrarComo('gestor@dcerutti.local');
    expect(await estornarPagamento({ cobrancaId: pix.id, motivo: 'Pagou duas vezes' })).toMatchObject({ ok: true });
  });
});

describe('vencimento e conciliação', () => {
  it('Pix vencido e sem resposta: cancelado no MP, expirado aqui e a reserva volta', async () => {
    const { p, v } = await compra();
    await criarCobranca({ pedidoId: p.id, metodo: 'pix', criadaPorId: null, site: SITE });
    const [c] = await cobrancas(p.id);
    await db.cobranca.update({ where: { id: c.id }, data: { expiraEm: new Date(Date.now() - 10 * 60_000), consultadaEm: null } });
    const r = await conciliarPagamentos();
    expect(r.vencidas).toBeGreaterThanOrEqual(1);
    const depois = await db.cobranca.findUniqueOrThrow({ where: { id: c.id } });
    expect(['cancelada', 'expirada']).toContain(depois.status);
    expect(depois.reservou).toBe(false);
    expect((await variante(v)).reservado).toBe(0);
    expect((await gatewayFalso.consultar(c.mpOrderId!)).status).toBe('canceled');
  });

  it('pago sem aviso: a conciliação encontra e aplica', async () => {
    const { p } = await compra();
    await criarCobranca({ pedidoId: p.id, metodo: 'pix', criadaPorId: null, site: SITE });
    const [c] = await cobrancas(p.id);
    gatewayFalso.simularPagamento(c.mpOrderId!);
    await db.cobranca.update({ where: { id: c.id }, data: { consultadaEm: null } });
    await conciliarPagamentos();
    expect(await pedido(p.id)).toMatchObject({ status: 'confirmado', pagamentoSituacao: 'pago' });
  });

  it('order que sumiu no Mercado Pago é fechada na conciliação', async () => {
    const { p, v } = await compra();
    await criarCobranca({ pedidoId: p.id, metodo: 'pix', criadaPorId: null, site: SITE });
    const [c] = await cobrancas(p.id);
    await db.cobranca.update({ where: { id: c.id }, data: { mpOrderId: 'ORDINEXISTENTE', consultadaEm: null } });
    await conciliarPagamentos();
    expect(await db.cobranca.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ status: 'cancelada', reservou: false });
    expect((await variante(v)).reservado).toBe(0);
  });

  it('cobrança que travou antes de chegar ao MP é fechada e solta a reserva', async () => {
    const { p, v } = await compra();
    await criarCobranca({ pedidoId: p.id, metodo: 'pix', criadaPorId: null, site: SITE });
    const [c] = await cobrancas(p.id);
    await db.cobranca.update({ where: { id: c.id }, data: { status: 'criada', mpOrderId: null, criadaEm: new Date(Date.now() - 20 * 60_000) } });
    await conciliarPagamentos();
    expect(await db.cobranca.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ status: 'cancelada', reservou: false });
    expect((await variante(v)).reservado).toBe(0);
  });
});

describe('travas no pedido', () => {
  it('com link aberto não edita; cancelar o pedido cancela a cobrança e solta a reserva', async () => {
    const { p, v } = await compra();
    await criarCobranca({ pedidoId: p.id, metodo: 'pix', criadaPorId: null, site: SITE });
    const item = await db.pedidoItem.findFirstOrThrow({ where: { pedidoId: p.id } });
    const r = await editarItens(p.id, { linhas: [{ itemId: item.id, varianteId: item.varianteId, quantidade: 1, preco: 90 }] });
    expect(r).toMatchObject({ ok: false });
    expect(r.erro).toMatch(/link de pagamento aberto/);
    expect(await cancelar(p.id, 'Desistiu')).toMatchObject({ ok: true });
    const [c] = await cobrancas(p.id);
    expect(c).toMatchObject({ status: 'cancelada', reservou: false });
    expect((await variante(v)).reservado).toBe(0);
    expect((await gatewayFalso.consultar(c.mpOrderId!)).status).toBe('canceled');
  });

  it('a equipe cancela só a cobrança: o pedido continua e pode ser editado', async () => {
    const { p, v } = await compra();
    await criarCobranca({ pedidoId: p.id, metodo: 'pix', criadaPorId: null, site: SITE });
    const [c] = await cobrancas(p.id);
    expect(await cancelarCobrancaDoPedido(c.id)).toMatchObject({ ok: true });
    expect((await variante(v)).reservado).toBe(0);
    expect(await cancelarCobrancaDoPedido(c.id)).toMatchObject({ ok: false });
    const item = await db.pedidoItem.findFirstOrThrow({ where: { pedidoId: p.id } });
    expect(await editarItens(p.id, { linhas: [{ itemId: item.id, varianteId: item.varianteId, quantidade: 1, preco: 90 }] })).toMatchObject({ ok: true });
  });

  it('pago: cliente e equipe não cancelam; vendedora não estorna; gestor estorna e aí cancela', async () => {
    await salvarConfig({ pagamentoOnline: { ...PAGAMENTO_ONLINE_PADRAO, ligado: true, confirmarAoPagar: false } });
    const { p, c: cliente, v } = await compra();
    await criarCobranca({ pedidoId: p.id, metodo: 'checkout', criadaPorId: null, site: SITE });
    const [c] = await cobrancas(p.id);
    gatewayFalso.simularPagamento(c.mpOrderId!);
    await avisar(c.mpOrderId!);
    expect(await cancelar(p.id, 'Teste')).toMatchObject({ ok: false, erro: expect.stringMatching(/Estorne/) });
    const conta = await db.user.create({ data: { name: cliente.nome, email: `conta${Date.now()}@exemplo.com`, papel: 'cliente', emailVerified: false } });
    await db.cliente.update({ where: { id: cliente.id }, data: { userId: conta.id } });
    await entrarComo(conta.email);
    expect(await cancelarMeuPedido(p.id)).toMatchObject({ ok: false });
    await entrarComo('ana@dcerutti.local');
    expect(await estornarPagamento({ cobrancaId: c.id, motivo: 'Teste' })).toMatchObject({ ok: false, erro: expect.stringMatching(/gestor/) });

    await entrarComo('gestor@dcerutti.local');
    expect(await estornarPagamento({ cobrancaId: c.id, motivo: 'De' })).toMatchObject({ ok: false });
    expect(await estornarPagamento({ cobrancaId: c.id, motivo: 'Cliente desistiu', valor: '30' })).toMatchObject({ ok: true });
    let depois = await db.cobranca.findUniqueOrThrow({ where: { id: c.id }, include: { pagamento: true } });
    expect(depois.status).toBe('estornada_parcial');
    expect(Number(depois.pagamento!.valor)).toBe(80);
    expect(await estornarPagamento({ cobrancaId: c.id, motivo: 'Resto', valor: '999' })).toMatchObject({ ok: false });
    expect(await estornarPagamento({ cobrancaId: c.id, motivo: 'Resto' })).toMatchObject({ ok: true });
    depois = await db.cobranca.findUniqueOrThrow({ where: { id: c.id }, include: { pagamento: true } });
    expect(depois).toMatchObject({ status: 'estornada', reservou: false, pagamento: null });
    expect(Number(depois.valorEstornado)).toBe(110);
    expect((await pedido(p.id)).pagamentoSituacao).toBe('estornado');
    expect((await variante(v)).reservado).toBe(0);
    expect(await cancelar(p.id, 'Estornado')).toMatchObject({ ok: true });
  });

  it('estorno liberado para a equipe em Configurações', async () => {
    await salvarConfig({ pagamentoOnline: { ...PAGAMENTO_ONLINE_PADRAO, ligado: true, quemEstorna: 'equipe' } });
    const { p } = await compra();
    await criarCobranca({ pedidoId: p.id, metodo: 'pix', criadaPorId: null, site: SITE });
    const [c] = await cobrancas(p.id);
    gatewayFalso.simularPagamento(c.mpOrderId!);
    await avisar(c.mpOrderId!);
    expect(await estornarPagamento({ cobrancaId: c.id, motivo: 'Devolveu' })).toMatchObject({ ok: true });
    // Venda confirmada e estornada: agora pode desfazer a venda.
    expect(await cancelar(p.id, 'Devolveu as peças')).toMatchObject({ ok: true });
    expect((await pedido(p.id)).status).toBe('cancelado');
  });

  it('outra vendedora não mexe nas cobranças do pedido', async () => {
    const { p } = await compra();
    await criarCobranca({ pedidoId: p.id, metodo: 'pix', criadaPorId: null, site: SITE });
    const [c] = await cobrancas(p.id);
    await entrarComo('carlos@dcerutti.local');
    expect(await gerarLinkPagamento(p.id)).toMatchObject({ ok: false, erro: 'Pedido não encontrado.' });
    expect(await conferirCobranca(c.id)).toMatchObject({ ok: false });
    expect(await cancelarCobrancaDoPedido(c.id)).toMatchObject({ ok: false });
    expect(await pagamentoDoPedido(await comoUsuario('carlos@dcerutti.local'), p.id)).toBeNull();
    await entrarComo('ana@dcerutti.local');
    expect(await cancelarCobrancaDoPedido(c.id)).toMatchObject({ ok: true });
  });
});

describe('condicional', () => {
  it('só depois de fechado, o valor do que ficou, sem reservar nada', async () => {
    const { p, v } = await compra({ tipo: 'condicional', quantidade: 2 });
    await expect(criarCobranca({ pedidoId: p.id, metodo: 'pix', criadaPorId: null, site: SITE })).rejects.toThrow(/feche o condicional/);
    const item = await db.pedidoItem.findFirstOrThrow({ where: { pedidoId: p.id } });
    await confirmarPedido(p.id, { [item.id]: 1 }, (await usuarioPorEmail('ana@dcerutti.local')).id);
    const c = await criarCobranca({ pedidoId: p.id, metodo: 'pix', criadaPorId: null, site: SITE });
    expect(c.valor).toBe(100);
    expect((await cobrancas(p.id))[0].reservou).toBe(false);
    const vv = await variante(v);
    expect([vv.estoque, vv.reservado]).toEqual([2, 0]);
    gatewayFalso.simularPagamento((await cobrancas(p.id))[0].mpOrderId!);
    await avisar((await cobrancas(p.id))[0].mpOrderId!);
    expect((await pedido(p.id)).pagamentoSituacao).toBe('pago');
  });
});

describe('página pública e action pagar', () => {
  it('link inválido, desligado, sem e-mail e o fluxo do Pix', async () => {
    await entrarComo(null);
    expect(await pagar({ chave: 'PED-000001.aaaaaaaaaaaaaaaa', metodo: 'pix' })).toMatchObject({ ok: false, erro: 'Link de pagamento inválido.' });
    const { p, c: cliente } = await compra({ email: null });
    const chave = chaveDoPagamento(p.codigo);
    const semEmail = await pagar({ chave, metodo: 'pix' });
    expect(semEmail).toMatchObject({ ok: false, pedirEmail: true });
    const r = await pagar({ chave, metodo: 'pix', email: 'cliente@exemplo.com' });
    expect(r).toMatchObject({ ok: true, metodo: 'pix', valor: 110 });
    const tela = await pedidoParaPagar(p.codigo);
    expect(tela).toMatchObject({ ligado: true, valor: { ok: true, valor: 110 }, primeiroNome: 'Cliente' });
    expect(tela!.pixAtivo?.pixCopiaECola).toBeTruthy();
    expect(JSON.stringify(tela)).not.toContain(cliente.telefone);
    const cartao = await pagar({ chave, metodo: 'checkout' });
    expect(cartao).toMatchObject({ ok: true, metodo: 'checkout' });
    await salvarConfig({ pagamentoOnline: { ...PAGAMENTO_ONLINE_PADRAO, ligado: false } });
    expect((await pedidoParaPagar(p.codigo))!.ligado).toBe(false);
    expect(await pagar({ chave, metodo: 'pix' })).toMatchObject({ ok: false });
  });

  it('simular pagamento: só com o Mercado Pago simulado', async () => {
    await entrarComo(null);
    const { p } = await compra();
    const chave = chaveDoPagamento(p.codigo);
    expect(await simularPagamento(chave)).toMatchObject({ ok: false, erro: expect.stringMatching(/primeiro/) });
    await pagar({ chave, metodo: 'pix', email: 'x@exemplo.com' });
    expect(await simularPagamento(chave)).toMatchObject({ ok: true });
    expect(await pedido(p.id)).toMatchObject({ status: 'confirmado', pagamentoSituacao: 'pago' });
    process.env.PAGAMENTO_GATEWAY = 'mercadopago';
    expect(await simularPagamento(chave)).toMatchObject({ ok: false, erro: expect.stringMatching(/teste/) });
    process.env.PAGAMENTO_GATEWAY = 'falso';
  });

  it('limite de tentativas por pedido', async () => {
    await entrarComo(null);
    const { p } = await compra();
    const chave = chaveDoPagamento(p.codigo);
    let ultima: Awaited<ReturnType<typeof pagar>> | null = null;
    for (let i = 0; i < 10; i++) { estado.ip = `10.8.${i}.${seq++ % 250}`; ultima = await pagar({ chave, metodo: i % 2 ? 'pix' : 'checkout' }); }
    expect(ultima).toMatchObject({ ok: false, erro: expect.stringMatching(/Muitas tentativas/) });
  });
});

describe('painel', () => {
  it('quadro do pedido e a página Pagamentos (gestor) com recebido, taxa e líquido', async () => {
    const { p } = await compra();
    await criarCobranca({ pedidoId: p.id, metodo: 'pix', criadaPorId: null, site: SITE });
    const [c] = await cobrancas(p.id);
    gatewayFalso.simularPagamento(c.mpOrderId!, { meio: 'pix', tipoMeio: 'bank_transfer', taxa: 1.09 });
    await avisar(c.mpOrderId!);
    const quadro = await pagamentoDoPedido(await comoUsuario('ana@dcerutti.local'), p.id);
    expect(quadro).toMatchObject({ paga: { status: 'aprovada', valor: 110 }, podeEstornar: false });
    const gestor = await comoUsuario('gestor@dcerutti.local');
    const l = await listarCobrancas(gestor, { status: 'pagas', pagina: 1 });
    expect(l.lista.some(x => x.id === c.id)).toBe(true);
    expect(l.resumo.bruto).toBeGreaterThanOrEqual(110);
    expect(l.resumo.liquido).toBeLessThan(l.resumo.bruto);
    await expect(listarCobrancas(await comoUsuario('ana@dcerutti.local'), { pagina: 1 })).rejects.toThrow();
  });

  it('configuração salva antes do pagamento online vale o padrão (desligado)', async () => {
    await db.configuracao.deleteMany({ where: { chave: 'pagamentoOnline' } });
    expect((await lerConfig()).pagamentoOnline).toEqual(PAGAMENTO_ONLINE_PADRAO);
    await db.configuracao.create({ data: { chave: 'pagamentoOnline', valor: { ligado: 'sim' } } });
    expect((await lerConfig()).pagamentoOnline.ligado).toBe(false);
    await db.configuracao.deleteMany({ where: { chave: 'pagamentoOnline' } });
  });
});

describe('revisão (docs/28)', () => {
  it('R-01: o simulado nunca vale no banco de produção', async () => {
    const original = process.env.DATABASE_URL;
    const { modoPagamento, gatewayConfigurado, gateway } = await import('@/server/pagamentos/gateway');
    expect(modoPagamento()).toBe('simulado');
    process.env.DATABASE_URL = 'mysql://u:s@localhost:3306/dcerutti_producao';
    try {
      expect(modoPagamento()).toBe('bloqueado');
      expect(gatewayConfigurado()).toBe(false);
      expect(() => gateway()).toThrow(/bloqueado/);
      await entrarComo(null);
      expect(await simularPagamento(chaveDoPagamento('PED-000001'))).toMatchObject({ ok: false, erro: expect.stringMatching(/teste/) });
      const { p } = await compra();
      await expect(criarCobranca({ pedidoId: p.id, metodo: 'pix', criadaPorId: null, site: SITE })).rejects.toThrow(/configurado/);
    } finally {
      process.env.DATABASE_URL = original;
    }
    process.env.PAGAMENTO_PRODUCAO = '1';
    expect(modoPagamento()).toBe('bloqueado');
    delete process.env.PAGAMENTO_PRODUCAO;
  });

  it('R-02: dois cliques ao mesmo tempo geram uma cobrança só', async () => {
    await entrarComo(null);
    const { p, v } = await compra();
    const chave = chaveDoPagamento(p.codigo);
    const antes = gatewayFalso.requisicoes.length;
    const [a, b] = await Promise.all([pagar({ chave, metodo: 'pix' }), pagar({ chave, metodo: 'pix' })]);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok && a.metodo === 'pix' && b.metodo === 'pix') expect(a.copiaECola).toBe(b.copiaECola);
    expect(gatewayFalso.requisicoes.length - antes).toBe(1);
    expect((await cobrancas(p.id)).map(c => c.status)).toEqual(['pendente']);
    expect((await variante(v)).reservado).toBe(1);
  });

  it('R-03: pago líquido de tarifa (valor pago menor que o cobrado) é aprovado', async () => {
    const { p } = await compra();
    await criarCobranca({ pedidoId: p.id, metodo: 'checkout', criadaPorId: null, site: SITE });
    const [c] = await cobrancas(p.id);
    gatewayFalso.simularPagamento(c.mpOrderId!, { valor: 104.52 });
    await avisar(c.mpOrderId!);
    expect((await db.cobranca.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('aprovada');
  });

  it('R-04: aviso processado é marcado; aviso que falhou é reprocessado; estorno feito no MP é encontrado', async () => {
    const { p } = await compra();
    await criarCobranca({ pedidoId: p.id, metodo: 'pix', criadaPorId: null, site: SITE });
    const [c] = await cobrancas(p.id);
    gatewayFalso.simularPagamento(c.mpOrderId!);
    await avisar(c.mpOrderId!, 'req-r04-ok');
    expect((await db.eventoPagamento.findUniqueOrThrow({ where: { requestId: 'req-r04-ok' } })).processadoEm).not.toBeNull();

    // Aviso gravado e não processado (o app caiu): a conciliação processa.
    const b = await compra();
    await criarCobranca({ pedidoId: b.p.id, metodo: 'pix', criadaPorId: null, site: SITE });
    const [cb] = await cobrancas(b.p.id);
    gatewayFalso.simularPagamento(cb.mpOrderId!);
    await db.cobranca.update({ where: { id: cb.id }, data: { consultadaEm: new Date() } }); // fora da varredura das abertas
    const ev = await db.eventoPagamento.create({ data: { origem: 'webhook', tipo: 'aviso_order.processed', mpOrderId: cb.mpOrderId, requestId: 'req-r04-perdido', criadoEm: new Date(Date.now() - 10 * 60_000) } });
    const r = await conciliarPagamentos();
    expect(r.avisos).toBeGreaterThanOrEqual(1);
    expect((await db.eventoPagamento.findUniqueOrThrow({ where: { id: ev.id } })).processadoEm).not.toBeNull();
    expect((await db.cobranca.findUniqueOrThrow({ where: { id: cb.id } })).status).toBe('aprovada');

    // Estorno feito direto no painel do Mercado Pago, sem aviso: a conferência diária das pagas encontra.
    await gatewayFalso.estornar(c.mpOrderId!, 'no-painel-do-mp');
    await db.cobranca.update({ where: { id: c.id }, data: { consultadaEm: new Date(Date.now() - 2 * 86_400_000) } });
    await conciliarPagamentos();
    expect((await db.cobranca.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('estornada');
    await entrarComo('gestor@dcerutti.local');
    expect(await cancelar(p.id, 'Estornado no Mercado Pago')).toMatchObject({ ok: true });
  });

  it('R-07: aviso do outro ambiente é registrado, ignorado e avisa o gestor', async () => {
    const { p } = await compra();
    await criarCobranca({ pedidoId: p.id, metodo: 'pix', criadaPorId: null, site: SITE });
    const [c] = await cobrancas(p.id);
    gatewayFalso.simularPagamento(c.mpOrderId!);
    process.env.MP_AMBIENTE = 'producao';
    try {
      const requestId = 'req-r07';
      const r = await aviso(new Request(`${SITE}/api/pagamentos/mercadopago?data.id=${c.mpOrderId}&type=order`, {
        method: 'POST', headers: { 'x-request-id': requestId, 'x-signature': assinarAviso(SEGREDO, c.mpOrderId!, requestId) },
        body: JSON.stringify({ type: 'order', action: 'order.processed', live_mode: false, data: { id: c.mpOrderId } }),
      }));
      await depoisDaResposta();
      expect(await r.json()).toMatchObject({ ignorado: true });
      expect((await db.cobranca.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('pendente');
      expect((await db.eventoPagamento.findUniqueOrThrow({ where: { requestId } })).tipo).toBe('aviso_ambiente_errado');
      const gestor = await usuarioPorEmail('gestor@dcerutti.local');
      expect(await db.notificacao.count({ where: { usuarioId: gestor.id, titulo: 'Aviso do Mercado Pago do ambiente errado' } })).toBe(1);
    } finally {
      delete process.env.MP_AMBIENTE;
    }
  });

  it('R-08: a página de um pedido só concilia as cobranças dele', async () => {
    const { conciliarDoPedido } = await import('@/server/pagamentos/cobrancas');
    const a = await compra(), b = await compra();
    for (const x of [a, b]) await criarCobranca({ pedidoId: x.p.id, metodo: 'pix', criadaPorId: null, site: SITE });
    const [ca] = await cobrancas(a.p.id), [cb] = await cobrancas(b.p.id);
    gatewayFalso.simularPagamento(ca.mpOrderId!);
    gatewayFalso.simularPagamento(cb.mpOrderId!);
    await db.cobranca.updateMany({ where: { id: { in: [ca.id, cb.id] } }, data: { consultadaEm: null } });
    await conciliarDoPedido(a.p.codigo);
    expect((await db.cobranca.findUniqueOrThrow({ where: { id: ca.id } })).status).toBe('aprovada');
    expect((await db.cobranca.findUniqueOrThrow({ where: { id: cb.id } })).status).toBe('pendente');
    await avisar(cb.mpOrderId!);
  });

  it('R-12: cobrança aberta segura a exclusão da conta', async () => {
    const { excluirMinhaConta } = await import('@/server/acoes/conta');
    const { p, c: cliente } = await compra({ tipo: 'condicional' });
    const item = await db.pedidoItem.findFirstOrThrow({ where: { pedidoId: p.id } });
    await confirmarPedido(p.id, { [item.id]: 1 }, (await usuarioPorEmail('ana@dcerutti.local')).id);
    await criarCobranca({ pedidoId: p.id, metodo: 'pix', criadaPorId: null, site: SITE });
    const conta = await db.user.create({ data: { name: cliente.nome, email: `r12${Date.now()}@exemplo.com`, papel: 'cliente', emailVerified: false, aceitouPrivacidadeEm: new Date() } });
    await db.cliente.update({ where: { id: cliente.id }, data: { userId: conta.id } });
    await entrarComo(conta.email);
    expect(await excluirMinhaConta()).toMatchObject({ ok: false, erro: expect.stringMatching(/pagamento online em aberto/) });
    await entrarComo('ana@dcerutti.local');
    const [c] = await cobrancas(p.id);
    expect(await cancelarCobrancaDoPedido(c.id)).toMatchObject({ ok: true });
  });

  it('O-06/O-07: nome na fatura, telefone e CPF vão ao Mercado Pago', async () => {
    const { nomeNaFatura } = await import('@/server/pagamentos/cobrancas');
    expect(nomeNaFatura("D'Cerutti")).toBe('DCERUTTI');
    expect(nomeNaFatura('Loja Ação Moda Feminina')).toBe('LOJA ACAO MOD');
    expect(nomeNaFatura('')).toBe('DCERUTTI');
    const { p, c } = await compra();
    await db.cliente.update({ where: { id: c.id }, data: { cpf: '529.982.247-25' } });
    await criarCobranca({ pedidoId: p.id, metodo: 'checkout', criadaPorId: null, site: SITE });
    const req = gatewayFalso.requisicoes.at(-1) as Parameters<typeof gatewayFalso.criarCheckout>[0];
    expect(req.nomeNaFatura).toMatch(/^[A-Z0-9 ]{1,13}$/);
    expect(req.pagador).toMatchObject({ telefone: c.telefone, cpf: '529.982.247-25', email: c.email });
  });
});
