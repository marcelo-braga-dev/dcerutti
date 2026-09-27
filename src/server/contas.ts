// Sem 'server-only' de propósito: também é usado pelos scripts (seed, criar-gestor), que rodam fora do Next.
import { hashPassword } from 'better-auth/crypto';
import type { Papel, Prisma, PrismaClient } from '@prisma/client';

type Tx = PrismaClient | Prisma.TransactionClient;

/** Cria usuário + credencial no formato do Better Auth (account.providerId = "credential"). */
export async function criarConta(tx: Tx, d: { nome: string; email: string; senha: string; papel: Papel; telefone?: string | null }) {
  const user = await tx.user.create({
    data: { name: d.nome, email: d.email.trim().toLowerCase(), papel: d.papel, telefone: d.telefone ?? null, emailVerified: false },
  });
  await tx.account.create({
    data: { userId: user.id, accountId: user.id, providerId: 'credential', password: await hashPassword(d.senha) },
  });
  return user;
}

export async function trocarSenha(tx: Tx, userId: string, senha: string) {
  await tx.account.updateMany({ where: { userId, providerId: 'credential' }, data: { password: await hashPassword(senha) } });
}
