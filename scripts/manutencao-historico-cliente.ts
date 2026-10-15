/**
 * Histórico do cliente (docs/21): apaga a navegação com mais de 12 meses e avisa os vendedores das sacolas paradas.
 * O site já faz isso sozinho no máximo uma vez por hora; o cron garante que roda mesmo sem acesso nenhum.
 *   cron: 15 * * * * cd <projeto> && npm run historico:manutencao
 */
import 'dotenv/config';
import { manutencaoHistorico } from '../src/server/navegacao';
import { db } from '../src/server/db';

manutencaoHistorico()
  .then(r => console.log(`Histórico: ${r.apagados} registro(s) antigo(s) apagado(s), ${r.avisos} aviso(s) de sacola parada.`))
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
