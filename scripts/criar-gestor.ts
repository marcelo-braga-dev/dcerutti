/** Cria o primeiro gestor em produção: npm run criar-gestor */
import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { PrismaClient } from '@prisma/client';
import { criarConta } from '../src/server/contas';

const db = new PrismaClient();

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const nome = (await rl.question('Nome: ')).trim();
  const email = (await rl.question('E-mail: ')).trim().toLowerCase();
  const senha = await rl.question('Senha (mín. 8 caracteres): ');
  rl.close();
  if (!nome || !/^\S+@\S+\.\S+$/.test(email) || senha.length < 8) throw new Error('Dados inválidos.');
  if (await db.user.findUnique({ where: { email } })) throw new Error('Já existe um usuário com esse e-mail.');
  await criarConta(db, { nome, email, senha, papel: 'gestor' });
  console.log(`Gestor ${email} criado.`);
}

main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
