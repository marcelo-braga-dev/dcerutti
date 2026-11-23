/**
 * Pagamento online (docs/27): conciliação com o Mercado Pago. Consulta as cobranças abertas, cancela as vencidas
 * (a reserva das peças volta), fecha as que travaram antes de chegar ao MP e refaz a confirmação automática que falhou.
 * O site já faz isso sozinho no máximo a cada 3 minutos; o cron garante que roda mesmo sem acesso nenhum.
 *   cron: *\/10 * * * * cd <projeto> && npm run pagamentos:conciliar
 */
import 'dotenv/config';
import { conciliarPagamentos } from '../src/server/pagamentos/cobrancas';
import { lerConfig } from '../src/server/config';
import { db } from '../src/server/db';

async function main() {
  if (!(await lerConfig()).pagamentoOnline.ligado && !(await db.cobranca.count({ where: { status: { in: ['criada', 'pendente'] } } }))) {
    console.log('Pagamento online desligado e sem cobranças abertas: nada a conciliar.');
    return;
  }
  const r = await conciliarPagamentos();
  console.log(`Pagamentos: ${r.consultadas} consultada(s), ${r.vencidas} vencida(s), ${r.travadas} travada(s), ${r.confirmadas} confirmada(s), ${r.avisos} aviso(s) reprocessado(s), ${r.pagasConferidas} paga(s) conferida(s), ${r.falhas} falha(s).`);
  if (r.falhas) process.exitCode = 1;
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
