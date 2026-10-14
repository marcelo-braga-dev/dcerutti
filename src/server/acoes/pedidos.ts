'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { z } from 'zod';
import { db } from '../db';
import { catalogo } from '../catalogo';
import { lerConfig } from '../config';
import { urlDoSite } from '../site';
import { avisarEquipe } from '../avisos';
import { EQUIPE, exigirPapel, podeAcessar } from '../permissoes';
import { cancelarPedido, confirmarPedido, criarPedido, editarPedido, ErroPedido, trocarCupomDoPedido, type LinhaEdicao } from '../pedidos';
import { buscarCupom, contextoDoCupom, pecasDoCupom } from '../cupons';
import { nomesDosAlvos, regraDe } from '../consultas/cupons';
import { bloqueio, CUPOM_POR_CLIENTE, registrarFalha } from '../limite';
import { avaliarCupom, regraEmPalavras } from '@/lib/cupom';
import { casaBusca, emEstoque, termosDeBusca, type VarianteCatalogo } from '@/lib/catalogo';
import { celularValido, formatarCep, somenteDigitos } from '@/lib/telefone';
import { linkWhatsApp, mensagemDoCliente, mensagemDoVendedor, mensagemPedidoAlterado, type ItemMensagem } from '@/lib/whatsapp';

export type ResultadoEnvio =
  | {
      ok: true; codigo: string; tipo: 'compra' | 'condicional'; url: string; destinatario: string; itens: ItemMensagem[]; nomeCliente: string; nomeVendedor: string; cep: string | null;
      cupom?: { codigo: string; desconto: number; freteGratis: boolean } | null;
    }
  | { ok: false; erro: string; cepFora?: boolean };

const linhasSchema = z.array(z.object({ varianteId: z.number().int(), quantidade: z.number().int().min(1).max(20) })).min(1).max(40);

const envioSchema = z.object({
  tipo: z.enum(['compra', 'condicional']),
  linhas: linhasSchema,
  cep: z.string().optional(),
  cupom: z.string().max(40).optional(),
});

const mensagemErro = (e: unknown) => (e instanceof ErroPedido ? e.message : 'Não foi possível registrar o pedido. Tente novamente.');

/** Cliente fecha a sacola: grava o pedido (D-07) e devolve o link do WhatsApp do vendedor. */
export async function enviarPedido(entrada: z.input<typeof envioSchema>): Promise<ResultadoEnvio> {
  const u = await exigirPapel(['cliente']);
  const r = envioSchema.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0].message };
  const d = r.data;

  const cliente = await db.cliente.findUnique({ where: { userId: u.id }, include: { vendedor: { select: { name: true, telefone: true, ativo: true } } } });
  if (!cliente) return { ok: false, erro: 'Seu cadastro de cliente não foi encontrado. Fale com a loja.' };

  const cfg = await lerConfig();
  let cep: string | null = null;
  if (d.tipo === 'condicional') {
    cep = formatarCep(d.cep ?? '');
    if (somenteDigitos(cep).length !== 8) return { ok: false, erro: 'Digite um CEP válido com 8 números.' };
    if (!cfg.cepsCondicional.includes(cep)) return { ok: false, erro: 'O condicional ainda não atende este CEP.', cepFora: true };
  }

  // RN-03: sem vendedor ativo com WhatsApp válido, o pedido vai para o WhatsApp da loja.
  const vendedorOk = cliente.vendedor.ativo && celularValido(cliente.vendedor.telefone);
  const telefone = vendedorOk ? cliente.vendedor.telefone! : cfg.whatsappLoja;
  const destinatario = vendedorOk ? cliente.vendedor.name.split(' ')[0] : 'a loja';

  try {
    const p = await criarPedido({
      tipo: d.tipo, origem: 'loja', clienteId: cliente.id, vendedorId: cliente.vendedorId,
      nomeCliente: cliente.nome, telefoneCliente: cliente.telefone, cep, linhas: d.linhas, regraFrete: cfg.frete, usuarioId: u.id,
      cupom: d.cupom?.trim() && cfg.cupons.ligados ? { codigo: d.cupom, quem: 'cliente' } : null,
    });
    if (cep && !cliente.cep) await db.cliente.update({ where: { id: cliente.id }, data: { cep } });
    const site = await urlDoSite();
    const texto = mensagemDoCliente({ tipo: d.tipo, codigo: p.codigo, itens: p.itens, nomeCliente: cliente.nome, cep, cidadeCondicional: cfg.cidadeCondicional, frete: d.tipo === 'compra' ? (p.frete ?? undefined) : undefined, site, cupom: p.cupom });
    after(() => avisarEquipe(p.id, 'novo', site).catch(e => console.error('Falha ao avisar a equipe do pedido', p.codigo, e)));
    revalidatePath('/minha-conta', 'layout');
    return { ok: true, codigo: p.codigo, tipo: d.tipo, url: linkWhatsApp(telefone, texto), destinatario, itens: p.itens, nomeCliente: cliente.nome, nomeVendedor: destinatario, cep, cupom: p.cupom };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}

export type PreviaCupom =
  | { ok: true; codigo: string; desconto: number; freteGratis: boolean; regra: string }
  | { ok: false; erro: string };

/**
 * Sacola (fase 2 dos cupons): confere o cupom com as peças e o tipo do pedido, sem gravar nada. A mesma regra do envio,
 * que confere tudo de novo. Código inexistente conta como tentativa (CUPOM_POR_CLIENTE).
 */
export async function previaCupom(entrada: { codigo: string; tipo: 'compra' | 'condicional'; linhas: { varianteId: number; quantidade: number }[] }): Promise<PreviaCupom> {
  const u = await exigirPapel(['cliente']);
  if (!(await lerConfig()).cupons.ligados) return { ok: false, erro: 'Os cupons não estão disponíveis agora.' };
  const chave = `cupom:${u.id}`;
  const espera = bloqueio(chave, CUPOM_POR_CLIENTE);
  if (espera) return { ok: false, erro: `Muitos códigos errados. Tente de novo em ${espera} min.` };
  const linhas = linhasSchema.safeParse(entrada.linhas);
  if (!linhas.success) return { ok: false, erro: 'A sacola está vazia.' };
  const cliente = await db.cliente.findUnique({ where: { userId: u.id }, select: { id: true } });
  if (!cliente) return { ok: false, erro: 'Seu cadastro de cliente não foi encontrado. Fale com a loja.' };

  const cupom = await buscarCupom(db, String(entrada.codigo ?? ''));
  if (!cupom) {
    registrarFalha(chave, CUPOM_POR_CLIENTE);
    return { ok: false, erro: 'Cupom não encontrado. Confira as letras e os números.' };
  }
  const variantes = await db.variante.findMany({ where: { id: { in: linhas.data.map(l => l.varianteId) } }, select: { id: true, produtoId: true, produto: { select: { preco: true } } } });
  const porId = new Map(variantes.map(v => [v.id, v]));
  const pecas = await pecasDoCupom(db, linhas.data.filter(l => porId.has(l.varianteId)).map(l => {
    const v = porId.get(l.varianteId)!;
    return { chave: v.id, produtoId: v.produtoId, preco: Number(v.produto.preco), quantidade: l.quantidade };
  }));
  const r = avaliarCupom(regraDe(cupom), pecas, {
    agora: new Date(), quem: 'cliente', clienteId: cliente.id, tipoPedido: entrada.tipo === 'condicional' ? 'condicional' : 'compra',
    ...(await contextoDoCupom(db, cupom.id, cliente.id)),
  });
  if (!r.ok) return { ok: false, erro: r.mensagem };
  return { ok: true, codigo: cupom.codigo, desconto: r.desconto, freteGratis: r.freteGratis, regra: regraEmPalavras(regraDe(cupom), nomesDosAlvos(cupom)) };
}

export type PecaSelecao = { id: number; referencia: string; nome: string; marca: string; cor: string | null; categoria: string; preco: number; imagem: string | null; variantes: VarianteCatalogo[] };

/** Busca do montador de seleção: até 12 peças com estoque. Sem termo, as que têm foto. */
export async function buscarPecas(termo: string): Promise<PecaSelecao[]> {
  await exigirPapel(EQUIPE);
  const termos = termosDeBusca(String(termo).slice(0, 80));
  const achados = (await catalogo()).filter(p => emEstoque(p) && (termos.length ? casaBusca(p, termos) : p.imagens.length > 0)).slice(0, 12);
  return achados.map(p => ({
    id: p.id, referencia: p.referencia, nome: p.nome, marca: p.marca, cor: p.cor, categoria: p.categoria, preco: p.preco,
    imagem: p.imagens[0] ?? null, variantes: p.variantes.filter(v => v.disponivel > 0),
  }));
}

export type ConferenciaSacola = Record<number, { preco: number; disponivel: number } | null>;

/**
 * Q-02/B-06: confere a sacola guardada no navegador com o catálogo atual. Para cada tamanho, devolve o preço e o
 * disponível de agora, ou null se saiu do catálogo. Não grava nada.
 */
export async function conferirSacola(varianteIds: number[]): Promise<ConferenciaSacola> {
  await exigirPapel(['cliente', 'vendedor', 'gestor']);
  const ids = new Set(varianteIds.filter(Number.isInteger).slice(0, 60));
  const r: ConferenciaSacola = {};
  for (const id of ids) r[id] = null;
  for (const p of await catalogo())
    for (const v of p.variantes) if (ids.has(v.id)) r[v.id] = { preco: p.preco, disponivel: v.disponivel };
  return r;
}

/** Vendedor monta uma seleção para o cliente (RF-23). */
/** U-08: a seleção pode ser compra ou condicional (o condicional reserva as peças na hora, como o da loja). */
export async function criarSelecao(entrada: { clienteId: string; linhas: { varianteId: number; quantidade: number }[]; tipo?: 'compra' | 'condicional' | 'balcao'; cupom?: string }): Promise<ResultadoEnvio & { pedidoId?: string }> {
  // Q-04: "balcao" = venda feita na loja física; vira um pedido de compra já confirmado (baixa estoque, grava custo e venda).
  const balcao = entrada.tipo === 'balcao';
  const tipo = entrada.tipo === 'condicional' ? 'condicional' : 'compra';
  const u = await exigirPapel(EQUIPE);
  const linhas = linhasSchema.safeParse(entrada.linhas);
  if (!linhas.success) return { ok: false, erro: 'Adicione pelo menos uma peça.' };
  const cliente = await db.cliente.findUnique({ where: { id: String(entrada.clienteId) } });
  if (!cliente || !podeAcessar(u, cliente)) return { ok: false, erro: 'Escolha o cliente.' };
  if (!balcao && !celularValido(cliente.telefone)) return { ok: false, erro: 'O WhatsApp deste cliente está incompleto no cadastro.' };
  const codigoCupom = String(entrada.cupom ?? '').trim();
  const semCupom = codigoCupom ? await equipeAplicaCupom(u) : null;
  if (semCupom) return { ok: false, erro: semCupom };

  try {
    const p = await criarPedido({
      tipo, origem: balcao ? 'balcao' : 'vendedor', clienteId: cliente.id, cep: tipo === 'condicional' ? cliente.cep : null,
      vendedorId: u.papel === 'vendedor' ? u.id : cliente.vendedorId,
      nomeCliente: cliente.nome, telefoneCliente: cliente.telefone, linhas: linhas.data, usuarioId: u.id,
      cupom: codigoCupom ? { codigo: codigoCupom, quem: 'equipe' } : null,
    });
    if (balcao) await confirmarPedido(p.id, {}, u.id);
    const texto = mensagemDoVendedor({ codigo: p.codigo, itens: p.itens, nomeCliente: cliente.nome, nomeVendedor: u.name, condicional: tipo === 'condicional', cupom: p.cupom });
    revalidatePath('/painel', 'layout');
    return {
      ok: true, pedidoId: p.id, codigo: p.codigo, tipo, url: linkWhatsApp(cliente.telefone, texto),
      destinatario: cliente.nome.split(' ')[0], itens: p.itens, nomeCliente: cliente.nome, nomeVendedor: u.name, cep: null, cupom: p.cupom,
    };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}

/** Verifica o acesso ao pedido. `exigirPapel` fica fora do try: o redirect dele não pode virar mensagem de erro. */
async function garantirAcesso(u: Awaited<ReturnType<typeof exigirPapel>>, pedidoId: string) {
  const pedido = await db.pedido.findUnique({ where: { id: pedidoId }, select: { vendedorId: true } });
  if (!pedido || !podeAcessar(u, pedido)) throw new ErroPedido('Pedido não encontrado.');
}

export async function confirmar(pedidoId: string, ficaram: Record<number, number>): Promise<{ ok: boolean; erro?: string }> {
  const u = await exigirPapel(EQUIPE);
  try {
    await garantirAcesso(u, pedidoId);
    await confirmarPedido(pedidoId, ficaram, u.id);
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
  revalidatePath('/painel', 'layout');
  return { ok: true };
}

const edicaoSchema = z.object({
  linhas: z.array(z.object({ itemId: z.number().int().optional(), varianteId: z.number().int(), quantidade: z.number().int(), preco: z.number() })).max(40),
  observacao: z.string().max(500).optional(),
});

/**
 * U-08: a equipe ajusta um pedido pendente (trocar tamanho, cor ou modelo, incluir, retirar, quantidade e desconto).
 * Devolve o link do WhatsApp com o pedido atualizado, para avisar a cliente.
 */
export async function editarItens(pedidoId: string, entrada: { linhas: LinhaEdicao[]; observacao?: string }): Promise<{ ok: boolean; erro?: string; url?: string }> {
  const u = await exigirPapel(EQUIPE);
  const r = edicaoSchema.safeParse(entrada);
  if (!r.success) return { ok: false, erro: 'Confira as peças do pedido.' };
  try {
    await garantirAcesso(u, pedidoId);
    await editarPedido(pedidoId, r.data.linhas, (await lerConfig()).frete, { usuarioId: u.id, observacao: r.data.observacao });
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
  revalidatePath('/painel', 'layout');
  revalidatePath('/minha-conta', 'layout');
  return { ok: true, url: await linkPedidoAtualizado(pedidoId, u) };
}

/** Link do WhatsApp com o pedido como ficou (peças, descontos e cupom), para avisar a cliente; undefined sem telefone. */
async function linkPedidoAtualizado(pedidoId: string, u: Awaited<ReturnType<typeof exigirPapel>>) {
  const p = await db.pedido.findUniqueOrThrow({ where: { id: pedidoId }, include: { itens: { orderBy: { id: 'asc' } }, vendedor: { select: { name: true } } } });
  if (!p.telefoneCliente) return undefined;
  const texto = mensagemPedidoAlterado({
    codigo: p.codigo, nomeCliente: p.nomeCliente, nomeVendedor: u.papel === 'vendedor' ? u.name : p.vendedor.name, condicional: p.tipo === 'condicional',
    frete: p.frete == null ? null : Number(p.frete),
    cupom: p.codigoCupom ? { codigo: p.codigoCupom, desconto: Number(p.descontoCupom), freteGratis: p.freteCupom } : null,
    itens: p.itens.map(i => ({ nome: i.nome, marca: i.marca, referencia: i.referencia, tamanho: i.tamanho, cor: i.cor, codigoInterno: i.codigoInterno, quantidade: i.quantidade, preco: Number(i.precoUnitario), precoTabela: i.precoTabela == null ? null : Number(i.precoTabela) })),
  });
  return linkWhatsApp(p.telefoneCliente, texto);
}

/** A equipe pode aplicar cupom? Cupons ligados e, para o vendedor, "Vendedores podem aplicar cupons" (o gestor sempre). */
async function equipeAplicaCupom(u: Awaited<ReturnType<typeof exigirPapel>>) {
  const cfg = await lerConfig();
  if (!cfg.cupons.ligados) return 'Os cupons estão desligados em Configurações.';
  if (u.papel === 'vendedor' && !cfg.cupons.vendedorAplica) return 'A loja não liberou vendedores para aplicar cupons.';
  return null;
}

/** Fase 3 dos cupons: aplicar, trocar ou retirar (`codigo` vazio) o cupom de um pedido pendente. */
export async function cupomDoPedido(pedidoId: string, codigo: string | null, observacao?: string): Promise<{ ok: boolean; erro?: string; url?: string }> {
  const u = await exigirPapel(EQUIPE);
  const bloqueado = codigo ? await equipeAplicaCupom(u) : null; // retirar vale sempre
  if (bloqueado) return { ok: false, erro: bloqueado };
  try {
    await garantirAcesso(u, String(pedidoId));
    await trocarCupomDoPedido(String(pedidoId), codigo?.trim() || null, (await lerConfig()).frete, { usuarioId: u.id, observacao: observacao?.slice(0, 500) });
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
  revalidatePath('/painel', 'layout');
  revalidatePath('/minha-conta', 'layout');
  return { ok: true, url: await linkPedidoAtualizado(String(pedidoId), u) };
}

/** U-05: a cliente cancela um pedido ou condicional dela que ainda está em aberto (a reserva volta ao estoque). */
export async function cancelarMeuPedido(pedidoId: string): Promise<{ ok: boolean; erro?: string }> {
  const u = await exigirPapel(['cliente']);
  const pedido = await db.pedido.findUnique({ where: { id: String(pedidoId) }, select: { cliente: { select: { userId: true } } } });
  if (!pedido || pedido.cliente.userId !== u.id) return { ok: false, erro: 'Pedido não encontrado.' };
  try {
    await cancelarPedido(pedidoId, 'cliente', u.id);
    const site = await urlDoSite();
    after(() => avisarEquipe(pedidoId, 'cancelado', site).catch(e => console.error('Falha ao avisar a equipe do cancelamento', pedidoId, e)));
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
  revalidatePath('/minha-conta', 'layout');
  revalidatePath('/painel', 'layout');
  return { ok: true };
}

/** A equipe cancela um pedido em aberto; o motivo é obrigatório e fica no histórico. */
export async function cancelar(pedidoId: string, motivo: string): Promise<{ ok: boolean; erro?: string }> {
  const u = await exigirPapel(EQUIPE);
  const texto = String(motivo ?? '').trim().slice(0, 500);
  if (texto.length < 3) return { ok: false, erro: 'Informe o motivo do cancelamento.' };
  try {
    await garantirAcesso(u, pedidoId);
    await cancelarPedido(pedidoId, 'equipe', u.id, texto);
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
  revalidatePath('/painel', 'layout');
  return { ok: true };
}
