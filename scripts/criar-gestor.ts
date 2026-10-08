/**
 * Cria o primeiro gestor em produção: npm run criar-gestor
 * Pergunta nome, e-mail e senha; ou lê as 3 linhas da entrada (printf 'Nome\nemail\nsenha\n' | npm run criar-gestor).
 */
import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { PrismaClient } from '@prisma/client';
import { criarConta } from '../src/server/contas';

const db = new PrismaClient();

async function main() {
  let nome: string, email: string, senha: string;
  if (process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    nome = (await rl.question('Nome: ')).trim();
    email = (await rl.question('E-mail: ')).trim().toLowerCase();
    senha = await rl.question('Senha (mín. 8 caracteres): ');
    rl.close();
  } else {
    // Entrada por pipe (3 linhas: nome, e-mail, senha): o readline perderia as linhas que chegam antes de cada pergunta.
    const linhas: string[] = [];
    for await (const l of createInterface({ input: process.stdin })) linhas.push(l);
    [nome = '', email = '', senha = ''] = linhas;
    nome = nome.trim();
    email = email.trim().toLowerCase();
  }
  if (!nome || !/^\S+@\S+\.\S+$/.test(email) || senha.length < 8) throw new Error('Dados inválidos.');
  if (await db.user.findUnique({ where: { email } })) throw new Error('Já existe um usuário com esse e-mail.');
  await criarConta(db, { nome, email, senha, papel: 'gestor' });
  console.log(`Gestor ${email} criado.`);
}

main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
