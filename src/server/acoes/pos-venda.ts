'use server';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { criarAtendimento } from '../atendimento';
import { db } from '../db';
import { ErroNegocio, gravar } from '../erros';
import { registrarAcao } from '../equipe';
import { EQUIPE, exigirPapel, podeAcessar } from '../permissoes';
import { errosDoZod, falha, type EstadoForm } from '@/lib/formulario';
import { consentimento, RESULTADOS_POS_VENDA, SITUACOES_ENTREGA, SITUACOES_PAGAMENTO } from '@/lib/pos-venda';

export type ResultadoPosVenda = { ok: boolean; erro?: string };

/** O contato com a permissão conferida: quem cuida é a vendedora da ficha; o gestor, de todas. */
async function contatoDoEscopo(u: Awaited<ReturnType<typeof exigirPapel>>, id: number) {
  const c = await db.posVendaContato.findUnique({ where: { id }, include: { cliente: { select: { id: true, nome: true, telefone: true, vendedorId: true } } } });
  if (!c || !podeAcessar(u, c.cliente)) throw new ErroNegocio('Contato não encontrado.');
  return c;
}

/** A condição `feitoEm: null` faz o segundo clique não sobrescrever o primeiro. */
const concluir = (id: number, usuarioId: string, resultado: string) =>
  db.posVendaContato.updateMany({ where: { id, feitoEm: null }, data: { feitoEm: new Date(), resultado, usuarioId } });

export async function concluirPosVenda(id: number, resultado: string): Promise<ResultadoPosVenda> {
  const u = await exigirPapel(EQUIPE);
  if (!(resultado in RESULTADOS_POS_VENDA) || resultado === 'virou_atendimento') return { ok: false, erro: 'Resultado inválido.' };
  const r = await gravar(async () => {
    const c = await contatoDoEscopo(u, Number(id));
    await concluir(c.id, u.id, resultado);
    return c;
  });
  if (!r.ok) return { ok: false, erro: r.erro };
  if (resultado !== 'pulado') after(() => registrarAcao(u.id, 'pos_venda_feito', { clienteId: r.valor.clienteId, pedidoId: r.valor.pedidoId, descricao: `${r.valor.cliente.nome} · ${RESULTADOS_POS_VENDA[resultado]}` }));
  revalidatePath('/painel', 'layout');
  return { ok: true };
}

/** A conversa rendeu: abre um atendimento com a cliente, pela regra da carteira, e leva até ele. */
export async function posVendaViraAtendimento(id: number): Promise<ResultadoPosVenda> {
  const u = await exigirPapel(EQUIPE);
  const r = await gravar(async () => {
    const c = await contatoDoEscopo(u, Number(id));
    const a = await criarAtendimento(u, { nome: c.cliente.nome, telefone: c.cliente.telefone, instagram: null, canal: 'whatsapp', nota: 'Veio do pós-venda.' });
    await concluir(c.id, u.id, 'virou_atendimento');
    return { atendimentoId: a.id, c };
  });
  if (!r.ok) return { ok: false, erro: r.erro };
  after(() => registrarAcao(u.id, 'pos_venda_feito', { clienteId: r.valor.c.clienteId, pedidoId: r.valor.c.pedidoId, descricao: `${r.valor.c.cliente.nome} · ${RESULTADOS_POS_VENDA.virou_atendimento}` }));
  revalidatePath('/painel', 'layout');
  redirect(`/painel/atendimento/${r.valor.atendimentoId}`);
}

/** Ela pediu para não receber ofertas: sai da fila de ofertas. Contato sobre o próprio pedido continua. */
export async function descadastrarDeOfertas(clienteId: string): Promise<ResultadoPosVenda> {
  const u = await exigirPapel(EQUIPE);
  const r = await gravar(async () => {
    const c = await db.cliente.findUnique({ where: { id: String(clienteId) }, select: { vendedorId: true, aceitaOfertasEm: true, descadastradaEm: true } });
    if (!c || !podeAcessar(u, c)) throw new ErroNegocio('Cliente não encontrada.');
    await db.cliente.update({ where: { id: String(clienteId) }, data: consentimento(c, false) });
  });
  if (!r.ok) return { ok: false, erro: r.erro };
  revalidatePath('/painel', 'layout');
  return { ok: true };
}

const esquemaSituacao = z.object({
  id: z.string().max(40),
  pagamento: z.string().refine(v => v in SITUACOES_PAGAMENTO, 'Escolha a situação.'),
  entrega: z.string().refine(v => v in SITUACOES_ENTREGA, 'Escolha a situação.'),
});

/** Registro manual: nada é cobrado nem rastreado. Entra no Acompanhamento da equipe. */
export async function salvarSituacaoDoPedido(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const u = await exigirPapel(EQUIPE);
  const r = esquemaSituacao.safeParse(Object.fromEntries(fd));
  if (!r.success) return falha(fd, errosDoZod(r.error));
  const d = r.data;
  const p = await db.pedido.findUnique({ where: { id: d.id }, select: { id: true, codigo: true, vendedorId: true, clienteId: true, nomeCliente: true, status: true } });
  if (!p || !podeAcessar(u, p)) return falha(fd, {}, 'Pedido não encontrado.');
  if (p.status === 'cancelado') return falha(fd, {}, 'Este pedido foi cancelado.');
  await db.pedido.update({ where: { id: p.id }, data: { pagamentoSituacao: d.pagamento as never, entregaSituacao: d.entrega as never } });
  after(() => registrarAcao(u.id, 'pedido_editado', { clienteId: p.clienteId, pedidoId: p.id, descricao: `${p.nomeCliente} · ${p.codigo} · ${SITUACOES_PAGAMENTO[d.pagamento]} · ${SITUACOES_ENTREGA[d.entrega]}` }));
  revalidatePath(`/painel/pedidos/${p.id}`);
  revalidatePath('/painel/atendimento');
  return { ok: true, mensagem: 'Situação salva.' };
}
