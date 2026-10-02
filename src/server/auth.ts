import 'server-only';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import { db } from './db';

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: 'mysql' }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6,
    // Contas são criadas pelas nossas Server Actions (cadastro de cliente, cadastro de vendedor),
    // nunca pelo endpoint público do Better Auth.
    disableSignUp: true,
  },
  user: {
    additionalFields: {
      papel: { type: 'string', input: false, defaultValue: 'cliente' },
      telefone: { type: 'string', required: false, input: false },
      ativo: { type: 'boolean', input: false, defaultValue: true },
    },
  },
  // cookieCache evita uma consulta de sessão por requisição; usuarioAtual() continua conferindo `ativo` no banco.
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24, cookieCache: { enabled: true, maxAge: 5 * 60 } },
  databaseHooks: {
    session: {
      create: {
        // Usuário desativado não consegue entrar.
        before: async session => {
          const u = await db.user.findUnique({ where: { id: session.userId }, select: { ativo: true } });
          if (!u?.ativo) return false;
        },
      },
    },
  },
  // Rate limit das rotas /api/auth: o IP real vem do Nginx em X-Real-IP (X-Forwarded-For pode ser forjado).
  advanced: { ipAddress: { ipAddressHeaders: ['x-real-ip'] } },
  plugins: [nextCookies()],
});
