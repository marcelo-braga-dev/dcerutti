import 'server-only';
import { db } from './db';
import { notificar } from './notificacoes';
import { lerConfig } from './config';
import { etapaDoFechamento, retornoPadrao } from '@/lib/atendimento';
import { contatosDoPedido } from '@/lib/pos-venda';

/**
 * Atendimento online (docs/26): o que o pedido define no atendimento. Separado de atendimento.ts para `pedidos.ts`
 * poder chamar sem importação circular. Roda depois do commit e nunca lança: falhar aqui não pode impedir a venda.
 */
export async function sincronizarAtendimento(pedidoId: string, status: 'confirmado' | 'cancelado', agora = new Date()) {
  try {
    const a = await db.atendimento.findUnique({ where: { pedidoId }, select: { id: true, codigo: true, responsavelId: true } });
    if (!a) return;
    const vendeu = status === 'confirmado' && (await db.venda.count({ where: { pedidoId } })) > 0;
    const etapa = etapaDoFechamento(status, vendeu);
    if (etapa === 'ganho') {
      await db.atendimento.update({ where: { id: a.id }, data: { etapa, fechadoEm: agora, proximoContatoEm: null, registros: { create: { tipo: 'pedido', texto: 'Pedido confirmado: venda feita.' } } } });
      return;
    }
    // Cancelado, venda desfeita ou condicional devolvido: a conversa volta, e o atendimento pode gerar outro pedido.
    await db.atendimento.update({
      where: { id: a.id },
      data: { etapa, pedidoId: null, fechadoEm: null, proximoContatoEm: retornoPadrao(agora), registros: { create: { tipo: 'pedido', texto: 'O pedido não virou venda: o atendimento voltou para Em conversa.' } } },
    });
    if (a.responsavelId) await notificar([a.responsavelId], { tipo: 'retorno_vencendo', titulo: `O pedido do atendimento ${a.codigo} não virou venda`, texto: 'Vale retomar a conversa.', link: `/painel/atendimento/${a.id}`, chave: `sem-venda:${a.codigo}:${pedidoId}`.slice(0, 100) });
  } catch (e) {
    console.error('Falha ao atualizar o atendimento do pedido', pedidoId, e);
  }
}

/**
 * Pós-venda: programa os contatos quando sai venda de cliente identificada. Nunca lança: não pode impedir a venda.
 * Nova compra encerra a reativação pendente: ela não está mais parada.
 */
export async function programarPosVenda(pedidoId: string, agora = new Date()) {
  try {
    const cfg = (await lerConfig()).atendimento;
    if (!cfg.ligado) return;
    const p = await db.pedido.findUnique({ where: { id: pedidoId }, select: { origem: true, clienteId: true, cliente: { select: { telefone: true } }, venda: { select: { id: true } } } });
    if (!p?.venda || !p.cliente.telefone) return;
    await db.posVendaContato.updateMany({ where: { clienteId: p.clienteId, tipo: 'reativacao', feitoEm: null, NOT: { pedidoId } }, data: { feitoEm: agora, resultado: 'nova_compra' } });
    await db.posVendaContato.createMany({
      data: contatosDoPedido(p.origem, cfg.diasPosVenda, agora).map(c => ({ ...c, pedidoId, clienteId: p.clienteId })),
      skipDuplicates: true,
    });
  } catch (e) {
    console.error('Falha ao programar o pós-venda do pedido', pedidoId, e);
  }
}

/** Venda desfeita: os contatos que faltavam saem da fila. */
export async function cancelarPosVenda(pedidoId: string, agora = new Date()) {
  await db.posVendaContato.updateMany({ where: { pedidoId, feitoEm: null }, data: { feitoEm: agora, resultado: 'venda_desfeita' } }).catch(e => console.error('Falha ao cancelar o pós-venda do pedido', pedidoId, e));
}

export const MESES_RETENCAO_ATENDIMENTO = 12;

/** LGPD: atendimento encerrado de quem nunca teve ficha sai depois de 12 meses (notas, peças e contato em cascata). */
export async function limparAtendimentos(agora = new Date()) {
  const corte = new Date(agora);
  corte.setMonth(corte.getMonth() - MESES_RETENCAO_ATENDIMENTO);
  await db.atendimento.deleteMany({ where: { clienteId: null, fechadoEm: { lt: corte } } });
}
