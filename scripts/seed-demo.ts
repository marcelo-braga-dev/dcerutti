/**
 * Seed de demonstração: APAGA o banco e popula todas as tabelas com bastante dado, em todas as situações, para ver o
 * sistema funcionando como em uso real (scripts/seed/demo.ts).
 *   SEED_PERMITIDO=1 npm run db:seed:demo          (banco local; senha de todos: SEED_SENHA ou "demo1234")
 * Antes, as migrations: npx prisma migrate deploy.
 */
import 'dotenv/config';
import { db } from '../src/server/db';
import { garantirBancoDeTeste } from './seed/semear';
import { semearDemo } from './seed/demo';

async function main() {
  const banco = garantirBancoDeTeste();
  const senha = process.env.SEED_SENHA || 'demo1234';
  const inicio = Date.now();
  console.log(`Seed de demonstração no banco ${banco}...`);
  await semearDemo(db, { senha, log: m => console.log(`  ${m}`) });
  const tabelas = await db.$queryRaw<{ t: string; n: bigint }[]>`SELECT TABLE_NAME t, TABLE_ROWS n FROM information_schema.tables WHERE table_schema = DATABASE() AND TABLE_NAME <> '_prisma_migrations' ORDER BY TABLE_NAME`;
  console.log(`Pronto em ${((Date.now() - inicio) / 1000).toFixed(0)} s. ${tabelas.length} tabelas. Senha de todos os usuários: ${senha}`);
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
