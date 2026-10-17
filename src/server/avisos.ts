import 'server-only';
import { db } from './db';
import { gestoresAtivos, notificar, responsaveis } from './notificacoes';
import { brl } from '@/lib/dinheiro';
import { plural } from '@/lib/pedido';

/**
 * L-13: avisa a equipe quando a cliente envia ou cancela um pedido (D-28: no sino do painel e, conforme a preferência,
 * por e-mail). O vendedor dela recebe; se ele estiver inativo, recebem os gestores; os gestores também veem no painel. Não substitui o WhatsApp: cobre o caso de a cliente fechar a aba antes de enviar.
 * Roda depois da resposta (after) e nunca derruba o pedido; sem SMTP, vai para o log.
 */
export async function avisarEquipe(pedidoId: string, evento: 'novo' | 'cancelado', site: string) {
  const p = await db.pedido.findUnique({
    where: { id: pedidoId },
    select: { codigo: true, tipo: true, nomeCliente: true, total: true, itens: { select: { quantidade: true } }, vendedorId: true, vendedor: { select: { email: true, ativo: true, name: true } } },
  });
  if (!p) return;
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
  // D-28: no painel, quem cuida da cliente e os gestores; por e-mail, só quem cuida (como antes), conforme a preferência.
  const cuida = await responsaveis(p.vendedorId);
  await notificar([...cuida, ...(await gestoresAtivos())], {
    tipo: evento === 'novo' ? 'pedido_novo' : 'pedido_cancelado',
    titulo: evento === 'novo' ? `${oque} novo ${p.codigo} · ${p.nomeCliente}` : `${p.nomeCliente} cancelou ${p.codigo}`,
    texto: evento === 'novo' ? `${plural(pecas, 'peça', 'peças')} · ${brl(Number(p.total))}` : 'As peças reservadas voltaram ao estoque.',
    link: `/painel/pedidos/${pedidoId}`,
    email: { assunto, texto },
  }, cuida);
}
