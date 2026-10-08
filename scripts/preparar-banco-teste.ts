/**
 * Prepara um banco de teste do zero: recria o esquema (migrate reset) e roda o seed completo.
 *   DATABASE_URL=mysql://.../test_dcerutti_e2e SEED_SENHA=... npm run test:preparar
 * Recusa bancos que não sejam de teste (nome começando com test_). Usado antes da suíte ponta a ponta.
 */
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { db } from '../src/server/db';
import { garantirBancoDeTeste, semear } from './seed/semear';

async function main() {
  const banco = garantirBancoDeTeste();
  if (!banco.startsWith('test_')) throw new Error('test:preparar só roda em banco com nome começando por test_.');
  console.log(`Recriando o banco ${banco}...`);
  // Sem `prisma migrate reset`: ele conecta no banco de sistema `mysql`, que o usuário de teste não acessa.
  // Apaga e recria pelo information_schema (acessível a todos) e aplica as migrations.
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/information_schema';
  const admin = new PrismaClient({ datasourceUrl: url.toString() });
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${banco}\``);
  await admin.$executeRawUnsafe(`CREATE DATABASE \`${banco}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.$disconnect();
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], { stdio: ['ignore', 'ignore', 'inherit'], env: process.env });
  const inicio = Date.now();
  await semear(db, { senha: process.env.SEED_SENHA ?? '', log: m => console.log(`  ${m}`) });
  console.log(`Banco ${banco} pronto em ${((Date.now() - inicio) / 1000).toFixed(1)} s.`);
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => db.$disconnect());
