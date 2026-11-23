'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { z } from 'zod';
import { db } from '../db';
import { lerConfig } from '../config';
import { urlDoSite } from '../site';
import { registrarAcao } from '../equipe';
import { ErroNegocio } from '../erros';
import { garantirRegistroInicial, registrarHistorico } from '../historico';
import { codigoDaChavePagamento, linkDePagamento } from '../link-pedido';
import { bloqueio, ipDoCliente, PAGAMENTO_POR_IP, PAGAMENTO_POR_PEDIDO, registrarFalha } from '../limite';
import { EQUIPE, exigirPapel, podeAcessar, usuarioAtual } from '../permissoes';
import { cancelarCobranca, criarCobranca, ErroCobrancaEmAndamento, estornarCobranca, simularPagamentoDeTeste, sincronizarCobranca, valorDoPedido } from '../pagamentos/cobrancas';
import { garantirSemCobranca } from '../pagamentos/travas';
import { gatewayConfigurado, simuladoAtivo } from '../pagamentos/gateway';
import { brl, lerValor } from '@/lib/dinheiro';
import { mensagemLinkPagamento } from '@/lib/pagamento';
import { linkWhatsApp } from '@/lib/whatsapp';

/** Server Actions do pagamento online (docs/27): o quadro do pedido no painel e a página pública /pagar. */

type Resultado = { ok: true; mensagem?: string } | { ok: false; erro: string };

const erroDe = (e: unknown, padrao = 'Não foi possível concluir agora. Tente de novo.') => (e instanceof ErroNegocio ? e.message : padrao);

async function pedidoDaEquipe(u: Awaited<ReturnType<typeof exigirPapel>>, pedidoId: string) {
  const p = await db.pedido.findUnique({ where: { id: String(pedidoId) }, select: { id: true, vendedorId: true, codigo: true, clienteId: true, nomeCliente: true } });
  if (!p || !podeAcessar(u, p)) throw new ErroNegocio('Pedido não encontrado.');
  return p;
}

function revalidar(pedidoId: string) {
  revalidatePath(`/painel/pedidos/${pedidoId}`);
  revalidatePath('/painel/pagamentos');
  revalidatePath('/minha-conta', 'layout');
}

// ---------- Painel ----------

/** Link de pagamento para a vendedora copiar ou mandar no WhatsApp. A cobrança só nasce quando a cliente escolhe o meio. */
export async function gerarLinkPagamento(pedidoId: string): Promise<{ ok: true; link: string; whatsapp: string | null; texto: string } | { ok: false; erro: string; precisaFrete?: boolean }> {
  const u = await exigirPapel(EQUIPE);
  try {
    const cfg = (await lerConfig()).pagamentoOnline;
    if (!cfg.ligado) throw new ErroNegocio('O pagamento online está desligado em Configurações.');
    if (!gatewayConfigurado()) throw new ErroNegocio('O pagamento online ainda não foi configurado no servidor (credenciais do Mercado Pago).');
    const ref = await pedidoDaEquipe(u, pedidoId);
    const p = await db.pedido.findUniqueOrThrow({
      where: { id: ref.id },
      select: { id: true, codigo: true, tipo: true, status: true, origem: true, total: true, frete: true, pagamentoSituacao: true, telefoneCliente: true, nomeCliente: true, venda: { select: { valor: true } }, vendedor: { select: { name: true } } },
    });
    const valor = valorDoPedido(p);
    if (!valor.ok) return { ok: false, erro: valor.motivo, precisaFrete: valor.precisaFrete };
    const link = linkDePagamento(await urlDoSite(), p.codigo);
    const texto = mensagemLinkPagamento({ nomeCliente: p.nomeCliente, nomeVendedor: u.papel === 'vendedor' ? u.name : p.vendedor.name, codigo: p.codigo, valor: valor.valor, link, pix: cfg.pix, cartao: cfg.cartao, brl });
    if (p.pagamentoSituacao === 'a_combinar' || p.pagamentoSituacao === 'estornado') await db.pedido.update({ where: { id: p.id }, data: { pagamentoSituacao: 'aguardando' } });
    after(() => registrarAcao(u.id, 'pedido_editado', { clienteId: ref.clienteId, pedidoId: p.id, valor: valor.valor, descricao: `${p.nomeCliente} · ${p.codigo} · link de pagamento` }));
    revalidar(p.id);
    return { ok: true, link, texto, whatsapp: p.telefoneCliente ? linkWhatsApp(p.telefoneCliente, texto) : null };
  } catch (e) {
    return { ok: false, erro: erroDe(e) };
  }
}

const freteSchema = z.object({ pedidoId: z.string().max(40), frete: z.string().max(12) });

/** RP-02: frete "a combinar" impede a cobrança; a equipe informa o valor combinado (0 = retirada ou grátis). */
export async function definirFretePedido(entrada: { pedidoId: string; frete: string }): Promise<Resultado> {
  const u = await exigirPapel(EQUIPE);
  const r = freteSchema.safeParse(entrada);
  if (!r.success) return { ok: false, erro: 'Informe o frete.' };
  const valor = r.data.frete.trim() === '' ? NaN : lerValor(r.data.frete);
  if (!Number.isFinite(valor) || valor < 0 || valor > 9999) return { ok: false, erro: 'Informe o frete em reais (0 para retirada na loja ou frete grátis).' };
  try {
    const ref = await pedidoDaEquipe(u, r.data.pedidoId);
    await db.$transaction(async tx => {
      const [trava] = await tx.$queryRaw<{ status: string; tipo: string }[]>`SELECT status, tipo FROM pedido WHERE id = ${ref.id} FOR UPDATE`;
      if (!trava || trava.status !== 'pendente' || trava.tipo !== 'compra') throw new ErroNegocio('Só dá para mudar o frete de uma compra em aberto.');
      await garantirSemCobranca(tx, ref.id);
      const antes = await tx.pedido.findUniqueOrThrow({ where: { id: ref.id }, select: { frete: true, criadoEm: true, freteCupom: true } });
      if (antes.freteCupom) throw new ErroNegocio('O cupom deste pedido dá frete grátis.');
      await garantirRegistroInicial(tx, ref.id, antes.criadoEm);
      await tx.pedido.update({ where: { id: ref.id }, data: { frete: valor.toFixed(2) } });
      await registrarHistorico(tx, { pedidoId: ref.id, acao: 'editado', usuarioId: u.id, mudancas: [`Frete de ${antes.frete == null ? 'a combinar' : brl(Number(antes.frete))} para ${valor ? brl(valor) : 'grátis / retirada'}`] });
    });
    after(() => registrarAcao(u.id, 'pedido_editado', { clienteId: ref.clienteId, pedidoId: ref.id, descricao: `${ref.nomeCliente} · ${ref.codigo} · frete ${brl(valor)}` }));
  } catch (e) {
    return { ok: false, erro: erroDe(e) };
  }
  revalidar(r.data.pedidoId);
  return { ok: true, mensagem: 'Frete salvo.' };
}

async function cobrancaDaEquipe(u: Awaited<ReturnType<typeof exigirPapel>>, cobrancaId: string) {
  const c = await db.cobranca.findUnique({ where: { id: String(cobrancaId) }, select: { id: true, pedido: { select: { id: true, vendedorId: true, codigo: true, clienteId: true, nomeCliente: true } } } });
  if (!c || !podeAcessar(u, c.pedido)) throw new ErroNegocio('Cobrança não encontrada.');
  return c;
}

/** "Conferir no Mercado Pago": consulta agora, sem esperar o aviso. */
export async function conferirCobranca(cobrancaId: string): Promise<Resultado> {
  const u = await exigirPapel(EQUIPE);
  try {
    const c = await cobrancaDaEquipe(u, cobrancaId);
    await sincronizarCobranca(c.id, 'acao');
    revalidar(c.pedido.id);
    return { ok: true, mensagem: 'Situação atualizada com o Mercado Pago.' };
  } catch (e) {
    return { ok: false, erro: erroDe(e, e instanceof Error ? e.message : undefined) };
  }
}

export async function cancelarCobrancaDoPedido(cobrancaId: string): Promise<Resultado> {
  const u = await exigirPapel(EQUIPE);
  try {
    const c = await cobrancaDaEquipe(u, cobrancaId);
    await cancelarCobranca(c.id, u.id);
    after(() => registrarAcao(u.id, 'pedido_editado', { clienteId: c.pedido.clienteId, pedidoId: c.pedido.id, descricao: `${c.pedido.nomeCliente} · ${c.pedido.codigo} · cobrança cancelada` }));
    revalidar(c.pedido.id);
    return { ok: true, mensagem: 'Cobrança cancelada. A reserva das peças voltou ao estoque.' };
  } catch (e) {
    return { ok: false, erro: erroDe(e) };
  }
}

const estornoSchema = z.object({ cobrancaId: z.string().max(40), motivo: z.string().trim().min(3, 'Informe o motivo do estorno.').max(300), valor: z.string().max(12).optional() });

/** RP-08: estorno total ou parcial. Gestor; vendedoras também se a loja liberar (PG-05). */
export async function estornarPagamento(entrada: { cobrancaId: string; motivo: string; valor?: string }): Promise<Resultado> {
  const u = await exigirPapel(EQUIPE);
  const r = estornoSchema.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0].message };
  const cfg = (await lerConfig()).pagamentoOnline;
  if (u.papel !== 'gestor' && cfg.quemEstorna !== 'equipe') return { ok: false, erro: 'Só o gestor pode estornar pagamentos.' };
  const valor = r.data.valor?.trim() ? lerValor(r.data.valor) : undefined;
  if (valor != null && !(valor > 0)) return { ok: false, erro: 'Informe o valor do estorno, ou deixe em branco para estornar tudo.' };
  try {
    const c = await cobrancaDaEquipe(u, r.data.cobrancaId);
    await estornarCobranca(c.id, u.id, r.data.motivo, valor);
    await db.$transaction(async tx => {
      const p = await tx.pedido.findUniqueOrThrow({ where: { id: c.pedido.id }, select: { criadoEm: true } });
      await garantirRegistroInicial(tx, c.pedido.id, p.criadoEm);
      await registrarHistorico(tx, { pedidoId: c.pedido.id, acao: 'editado', usuarioId: u.id, mudancas: [`Pagamento online estornado${valor != null ? ` (${brl(valor)})` : ''}`], observacao: r.data.motivo });
    });
    after(() => registrarAcao(u.id, 'pedido_editado', { clienteId: c.pedido.clienteId, pedidoId: c.pedido.id, descricao: `${c.pedido.nomeCliente} · ${c.pedido.codigo} · estorno: ${r.data.motivo}` }));
    revalidar(c.pedido.id);
    const atual = await db.cobranca.findUniqueOrThrow({ where: { id: c.id }, select: { status: true } });
    return { ok: true, mensagem: atual.status === 'estornada' || atual.status === 'estornada_parcial' ? 'Estorno feito no Mercado Pago.' : 'Estorno pedido ao Mercado Pago; a confirmação chega em instantes.' };
  } catch (e) {
    return { ok: false, erro: erroDe(e) };
  }
}

// ---------- Página pública /pagar ----------

export type ResultadoPagar =
  | { ok: true; metodo: 'pix'; copiaECola: string; expiraEm: string | null; valor: number }
  | { ok: true; metodo: 'checkout'; url: string }
  | { ok: false; erro: string; pedirEmail?: boolean };

const pagarSchema = z.object({ chave: z.string().max(60), metodo: z.enum(['pix', 'checkout']), email: z.email().max(120).optional().or(z.literal('')) });

/** A cliente escolhe Pix ou cartão no link. Sem login: a chave assinada é a autorização; limite por IP e por pedido. */
export async function pagar(entrada: { chave: string; metodo: 'pix' | 'checkout'; email?: string }): Promise<ResultadoPagar> {
  const r = pagarSchema.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues.some(i => i.path[0] === 'email') ? 'Confira o e-mail.' : 'Link inválido.' };
  const codigo = codigoDaChavePagamento(decodeURIComponent(r.data.chave));
  if (!codigo) return { ok: false, erro: 'Link de pagamento inválido.' };
  const ip = await ipDoCliente();
  const porIp = `pagar:ip:${ip}`, porPedido = `pagar:pedido:${codigo}`;
  const espera = Math.max(bloqueio(porIp, PAGAMENTO_POR_IP), bloqueio(porPedido, PAGAMENTO_POR_PEDIDO));
  if (espera) return { ok: false, erro: `Muitas tentativas. Tente de novo em ${espera} min.` };
  const pedido = await db.pedido.findUnique({ where: { codigo }, select: { id: true, pagamentoSituacao: true } });
  if (!pedido) return { ok: false, erro: 'Pedido não encontrado.' };
  if (pedido.pagamentoSituacao === 'estornado') return { ok: false, erro: 'O pagamento deste pedido foi devolvido. Fale com a loja pelo WhatsApp.' };
  const u = await usuarioAtual();
  try {
    const site = await urlDoSite();
    const tentar = () => criarCobranca({ pedidoId: pedido.id, metodo: r.data.metodo, criadaPorId: u?.id ?? null, email: r.data.email || null, site });
    // R-02: dois cliques ao mesmo tempo. O segundo espera o primeiro terminar (até ~12 s) e reaproveita a mesma cobrança.
    let c: Awaited<ReturnType<typeof criarCobranca>> | null = null;
    for (let i = 0; !c; i++) {
      try { c = await tentar(); } catch (e) {
        if (!(e instanceof ErroCobrancaEmAndamento) || i >= 12) throw e;
        await new Promise(res => setTimeout(res, 1000));
      }
    }
    if (!c.reaproveitada) { registrarFalha(porIp, PAGAMENTO_POR_IP); registrarFalha(porPedido, PAGAMENTO_POR_PEDIDO); }
    revalidar(pedido.id);
    if (c.metodo === 'pix') {
      if (!c.pixCopiaECola) return { ok: false, erro: 'O Mercado Pago ainda está gerando o Pix. Atualize a página em alguns segundos.' };
      return { ok: true, metodo: 'pix', copiaECola: c.pixCopiaECola, expiraEm: c.expiraEm?.toISOString() ?? null, valor: c.valor };
    }
    if (!c.checkoutUrl) return { ok: false, erro: 'O Mercado Pago não devolveu o endereço do pagamento. Tente de novo.' };
    return { ok: true, metodo: 'checkout', url: c.checkoutUrl };
  } catch (e) {
    const erro = erroDe(e);
    return { ok: false, erro, pedirEmail: /e-mail/i.test(erro) };
  }
}

/** Ambiente de teste com o Mercado Pago simulado: "Simular pagamento aprovado" na página /pagar. */
export async function simularPagamento(chave: string): Promise<Resultado> {
  if (!simuladoAtivo()) return { ok: false, erro: 'Disponível só no ambiente de teste.' };
  const codigo = codigoDaChavePagamento(decodeURIComponent(String(chave)));
  if (!codigo) return { ok: false, erro: 'Link de pagamento inválido.' };
  try {
    await simularPagamentoDeTeste(codigo);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: erroDe(e) };
  }
}
