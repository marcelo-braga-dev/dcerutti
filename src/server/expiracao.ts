import 'server-only';
import { lerConfig } from './config';
import { db } from './db';
import { cancelarPedido } from './pedidos';
import { limiteDeExpiracao } from '@/lib/pedido';

export { expiraEm } from '@/lib/pedido';

/**
 * Q-05: cancela pedidos e condicionais pendentes há mais de `diasExpiracao` dias (a reserva volta ao estoque).
 * Roda dentro do app, no máximo uma vez por hora, quando a equipe abre o painel; um processo só (D-11).
 */
const UMA_HORA = 60 * 60_000;
const g = globalThis as unknown as { __expiracaoEm?: number };


export async function expirarPendentes() {
  const { diasExpiracao } = await lerConfig();
  if (!diasExpiracao) return 0;
  const vencidos = await db.pedido.findMany({ where: { status: 'pendente', criadoEm: { lt: limiteDeExpiracao(diasExpiracao) } }, select: { id: true } });
  let n = 0;
  for (const p of vencidos) await cancelarPedido(p.id, 'expirado').then(() => n++, () => {}); // fechado por outra pessoa no meio: ignora
  return n;
}

export async function expirarSeNecessario() {
  const agora = Date.now();
  if (g.__expiracaoEm && agora - g.__expiracaoEm < UMA_HORA) return;
  g.__expiracaoEm = agora;
  const n = await expirarPendentes().catch(e => { console.error('Falha ao expirar pendentes', e); return 0; });
  if (n) console.warn(`${n} pedido(s) pendente(s) expirado(s) automaticamente.`);
}
