import 'server-only';
import { db } from './db';
import { enviarEmail } from './email';
import { brl } from '@/lib/dinheiro';
import { plural } from '@/lib/pedido';

/**
 * L-13: avisa a equipe por e-mail quando a cliente envia ou cancela um pedido. O vendedor dela recebe; se ele estiver
 * inativo, recebem os gestores. Não substitui o WhatsApp: cobre o caso de a cliente fechar a aba antes de enviar.
 * Roda depois da resposta (after) e nunca derruba o pedido; sem SMTP, vai para o log.
 */
export async function avisarEquipe(pedidoId: string, evento: 'novo' | 'cancelado', site: string) {
  const p = await db.pedido.findUnique({
    where: { id: pedidoId },
    select: { codigo: true, tipo: true, nomeCliente: true, total: true, itens: { select: { quantidade: true } }, vendedor: { select: { email: true, ativo: true, name: true } } },
  });
  if (!p) return;
  const para = p.vendedor.ativo
    ? [p.vendedor.email]
    : (await db.user.findMany({ where: { papel: 'gestor', ativo: true }, select: { email: true } })).map(g => g.email);
  const oque = p.tipo === 'condicional' ? 'Condicional' : 'Pedido';
  const pecas = p.itens.reduce((a, i) => a + i.quantidade, 0);
  const assunto = evento === 'novo' ? `${oque} novo ${p.codigo} · ${p.nomeCliente}` : `${oque} ${p.codigo} cancelado pela cliente`;
  const texto = [
    evento === 'novo'
      ? `${p.nomeCliente} enviou o ${oque.toLowerCase()} ${p.codigo}: ${plural(pecas, 'peça', 'peças')}, ${brl(Number(p.total))}.`
      : `${p.nomeCliente} cancelou o ${oque.toLowerCase()} ${p.codigo}. As peças reservadas voltaram ao estoque.`,
    '',
    `Abrir no painel: ${site}/painel/pedidos/${pedidoId}`,
    '',
    evento === 'novo' ? 'Se a mensagem dela não chegou no seu WhatsApp, chame-a por lá a partir do pedido.' : '',
  ].join('\n').trim();
  for (const email of para) await enviarEmail({ para: email, assunto, texto });
}
