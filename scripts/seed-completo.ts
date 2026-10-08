/**
 * Seed completo para testes: APAGA o banco e popula todas as tabelas com todas as variações (scripts/seed/).
 *   npm run db:seed:completo                  (DATABASE_URL de um banco test_* ou SEED_PERMITIDO=1, e SEED_SENHA)
 * Antes, as migrations: npx prisma migrate deploy. Ou tudo de uma vez: npm run test:preparar
 */
import 'dotenv/config';
import { db } from '../src/server/db';
import { garantirBancoDeTeste, semear } from './seed/semear';

async function main() {
  const banco = garantirBancoDeTeste();
  const senha = process.env.SEED_SENHA ?? '';
  const inicio = Date.now();
  console.log(`Seed completo no banco ${banco}...`);
  await semear(db, { senha, log: m => console.log(`  ${m}`) });
  console.log(`Pronto em ${((Date.now() - inicio) / 1000).toFixed(1)} s. Senha de todos os usuários: a de SEED_SENHA.`);
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => db.$disconnect());
