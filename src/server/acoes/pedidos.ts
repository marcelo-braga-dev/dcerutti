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
import { cancelarPedido, confirmarPedido, criarPedido, editarPedido, ErroPedido } from '../pedidos';
import { casaBusca, emEstoque, termosDeBusca, type VarianteCatalogo } from '@/lib/catalogo';
import { celularValido, formatarCep, somenteDigitos } from '@/lib/telefone';
import { linkWhatsApp, mensagemDoCliente, mensagemDoVendedor, type ItemMensagem } from '@/lib/whatsapp';

export type ResultadoEnvio =
  | { ok: true; codigo: string; tipo: 'compra' | 'condicional'; url: string; destinatario: string; itens: ItemMensagem[]; nomeCliente: string; nomeVendedor: string; cep: string | null }
  | { ok: false; erro: string; cepFora?: boolean };

const linhasSchema = z.array(z.object({ varianteId: z.number().int(), quantidade: z.number().int().min(1).max(20) })).min(1).max(40);

const envioSchema = z.object({
  tipo: z.enum(['compra', 'condicional']),
  linhas: linhasSchema,
  cep: z.string().optional(),
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
      nomeCliente: cliente.nome, telefoneCliente: cliente.telefone, cep, linhas: d.linhas, regraFrete: cfg.frete,
    });
    if (cep && !cliente.cep) await db.cliente.update({ where: { id: cliente.id }, data: { cep } });
    const site = await urlDoSite();
    const texto = mensagemDoCliente({ tipo: d.tipo, codigo: p.codigo, itens: p.itens, nomeCliente: cliente.nome, cep, cidadeCondicional: cfg.cidadeCondicional, frete: d.tipo === 'compra' ? (p.frete ?? undefined) : undefined, site });
    after(() => avisarEquipe(p.id, 'novo', site).catch(e => console.error('Falha ao avisar a equipe do pedido', p.codigo, e)));
    revalidatePath('/minha-conta');
    return { ok: true, codigo: p.codigo, tipo: d.tipo, url: linkWhatsApp(telefone, texto), destinatario, itens: p.itens, nomeCliente: cliente.nome, nomeVendedor: destinatario, cep };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
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
export async function criarSelecao(entrada: { clienteId: string; linhas: { varianteId: number; quantidade: number }[]; tipo?: 'compra' | 'condicional' | 'balcao' }): Promise<ResultadoEnvio & { pedidoId?: string }> {
  // Q-04: "balcao" = venda feita na loja física; vira um pedido de compra já confirmado (baixa estoque, grava custo e venda).
  const balcao = entrada.tipo === 'balcao';
  const tipo = entrada.tipo === 'condicional' ? 'condicional' : 'compra';
  const u = await exigirPapel(EQUIPE);
  const linhas = linhasSchema.safeParse(entrada.linhas);
  if (!linhas.success) return { ok: false, erro: 'Adicione pelo menos uma peça.' };
  const cliente = await db.cliente.findUnique({ where: { id: String(entrada.clienteId) } });
  if (!cliente || !podeAcessar(u, cliente)) return { ok: false, erro: 'Escolha o cliente.' };
  if (!balcao && !celularValido(cliente.telefone)) return { ok: false, erro: 'O WhatsApp deste cliente está incompleto no cadastro.' };

  try {
    const p = await criarPedido({
      tipo, origem: balcao ? 'balcao' : 'vendedor', clienteId: cliente.id, cep: tipo === 'condicional' ? cliente.cep : null,
      vendedorId: u.papel === 'vendedor' ? u.id : cliente.vendedorId,
      nomeCliente: cliente.nome, telefoneCliente: cliente.telefone, linhas: linhas.data,
    });
    if (balcao) await confirmarPedido(p.id, {}, u.id);
    const texto = mensagemDoVendedor({ codigo: p.codigo, itens: p.itens, nomeCliente: cliente.nome, nomeVendedor: u.name, condicional: tipo === 'condicional' });
    revalidatePath('/painel', 'layout');
    return {
      ok: true, pedidoId: p.id, codigo: p.codigo, tipo, url: linkWhatsApp(cliente.telefone, texto),
      destinatario: cliente.nome.split(' ')[0], itens: p.itens, nomeCliente: cliente.nome, nomeVendedor: u.name, cep: null,
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

/** U-08: a equipe ajusta as peças de um pedido pendente (quantidade ou retirar). */
export async function editarItens(pedidoId: string, quantidades: Record<number, number>): Promise<{ ok: boolean; erro?: string }> {
  const u = await exigirPapel(EQUIPE);
  try {
    await garantirAcesso(u, pedidoId);
    await editarPedido(pedidoId, quantidades, (await lerConfig()).frete);
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
  revalidatePath('/painel', 'layout');
  revalidatePath('/minha-conta');
  return { ok: true };
}

/** U-05: a cliente cancela um pedido ou condicional dela que ainda está em aberto (a reserva volta ao estoque). */
export async function cancelarMeuPedido(pedidoId: string): Promise<{ ok: boolean; erro?: string }> {
  const u = await exigirPapel(['cliente']);
  const pedido = await db.pedido.findUnique({ where: { id: String(pedidoId) }, select: { cliente: { select: { userId: true } } } });
  if (!pedido || pedido.cliente.userId !== u.id) return { ok: false, erro: 'Pedido não encontrado.' };
  try {
    await cancelarPedido(pedidoId, 'cliente');
    const site = await urlDoSite();
    after(() => avisarEquipe(pedidoId, 'cancelado', site).catch(e => console.error('Falha ao avisar a equipe do cancelamento', pedidoId, e)));
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
  revalidatePath('/minha-conta');
  revalidatePath('/painel', 'layout');
  return { ok: true };
}

export async function cancelar(pedidoId: string): Promise<{ ok: boolean; erro?: string }> {
  const u = await exigirPapel(EQUIPE);
  try {
    await garantirAcesso(u, pedidoId);
    await cancelarPedido(pedidoId, 'equipe');
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
  revalidatePath('/painel', 'layout');
  return { ok: true };
}
