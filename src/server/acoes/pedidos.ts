'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '../db';
import { lerConfig } from '../config';
import { EQUIPE, exigirPapel, podeAcessar } from '../permissoes';
import { cancelarPedido, confirmarPedido, criarPedido, ErroPedido } from '../pedidos';
import { brl } from '@/lib/dinheiro';
import { celularValido, formatarCep, somenteDigitos } from '@/lib/telefone';
import { linkWhatsApp, mensagemDoCliente, mensagemDoVendedor, type ItemMensagem } from '@/lib/whatsapp';

export type ResultadoEnvio =
  | { ok: true; codigo: string; tipo: 'compra' | 'condicional'; url: string; destinatario: string; itens: ItemMensagem[]; nomeCliente: string; nomeVendedor: string; cep: string | null }
  | { ok: false; erro: string; cepFora?: boolean };

const linhasSchema = z.array(z.object({ varianteId: z.number().int(), quantidade: z.number().int().min(1).max(20) })).min(1).max(40);

const envioSchema = z.object({
  tipo: z.enum(['compra', 'condicional']),
  linhas: linhasSchema,
  nome: z.string().trim().min(2, 'Informe seu nome para enviarmos o pedido.').max(120),
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
      nomeCliente: d.nome, telefoneCliente: cliente.telefone, cep, linhas: d.linhas,
    });
    if (cep && !cliente.cep) await db.cliente.update({ where: { id: cliente.id }, data: { cep } });
    const frete = d.tipo === 'compra' ? `Frete: ${p.total >= cfg.frete.gratisAcima ? 'grátis' : brl(cfg.frete.valor)} · Pagamento e entrega: a combinar` : undefined;
    const texto = mensagemDoCliente({ tipo: d.tipo, codigo: p.codigo, itens: p.itens, nomeCliente: d.nome, cep, cidadeCondicional: cfg.cidadeCondicional, freteTexto: frete });
    revalidatePath('/minha-conta');
    return { ok: true, codigo: p.codigo, tipo: d.tipo, url: linkWhatsApp(telefone, texto), destinatario, itens: p.itens, nomeCliente: d.nome, nomeVendedor: destinatario, cep };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}

/** Vendedor monta uma seleção para o cliente (RF-23). */
export async function criarSelecao(entrada: { clienteId: string; linhas: { varianteId: number; quantidade: number }[] }): Promise<ResultadoEnvio & { pedidoId?: string }> {
  const u = await exigirPapel(EQUIPE);
  const linhas = linhasSchema.safeParse(entrada.linhas);
  if (!linhas.success) return { ok: false, erro: 'Adicione pelo menos uma peça.' };
  const cliente = await db.cliente.findUnique({ where: { id: String(entrada.clienteId) } });
  if (!cliente || !podeAcessar(u, cliente)) return { ok: false, erro: 'Escolha o cliente.' };
  if (!celularValido(cliente.telefone)) return { ok: false, erro: 'O WhatsApp deste cliente está incompleto no cadastro.' };

  try {
    const p = await criarPedido({
      tipo: 'compra', origem: 'vendedor', clienteId: cliente.id,
      vendedorId: u.papel === 'vendedor' ? u.id : cliente.vendedorId,
      nomeCliente: cliente.nome, telefoneCliente: cliente.telefone, linhas: linhas.data,
    });
    const texto = mensagemDoVendedor({ codigo: p.codigo, itens: p.itens, nomeCliente: cliente.nome, nomeVendedor: u.name });
    revalidatePath('/painel', 'layout');
    return {
      ok: true, pedidoId: p.id, codigo: p.codigo, tipo: 'compra', url: linkWhatsApp(cliente.telefone, texto),
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

export async function confirmar(pedidoId: string, situacoes: Record<number, 'vendido' | 'devolvido'>): Promise<{ ok: boolean; erro?: string }> {
  const u = await exigirPapel(EQUIPE);
  try {
    await garantirAcesso(u, pedidoId);
    await confirmarPedido(pedidoId, situacoes, u.id);
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
  revalidatePath('/painel', 'layout');
  return { ok: true };
}

export async function cancelar(pedidoId: string): Promise<{ ok: boolean; erro?: string }> {
  const u = await exigirPapel(EQUIPE);
  try {
    await garantirAcesso(u, pedidoId);
    await cancelarPedido(pedidoId);
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
  revalidatePath('/painel', 'layout');
  return { ok: true };
}
