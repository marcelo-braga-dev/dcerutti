import 'server-only';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import { db } from './db';
import { enviarEmail } from './email';
import { registrarLogin } from './navegacao';
import { registrarLoginEquipe } from './equipe';
import { marcaAtual } from '@/server/marca';

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: 'mysql' }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // Contas são criadas pelas nossas Server Actions (cadastro de cliente, cadastro de vendedor),
    // nunca pelo endpoint público do Better Auth.
    disableSignUp: true,
    // B-03: "Esqueci a senha". O link aponta para a nossa página /redefinir-senha, vale 1 hora e é de uso único.
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, token }) => {
      const ativo = await db.user.findUnique({ where: { id: user.id }, select: { ativo: true } });
      if (!ativo?.ativo) return; // conta desativada não redefine senha
      const site = (process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
      const { nome } = await marcaAtual();
      await enviarEmail({
        para: user.email,
        assunto: `Redefinir sua senha · ${nome}`,
        texto: `Olá, ${user.name.split(' ')[0]}!\n\nPara criar uma senha nova, abra o link abaixo (vale por 1 hora):\n${site}/redefinir-senha?token=${token}\n\nSe você não pediu, ignore este e-mail: sua senha continua a mesma.\n\n${nome}`,
      });
    },
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
        // Histórico do cliente (docs/21): último login. Nunca impede o login.
        after: async session => {
          await registrarLogin(session.userId, session.userAgent).catch(e => console.error('Falha ao registrar o login', e));
          // D-26: login da equipe (vendedores e gestores).
          await registrarLoginEquipe(session.userId, session.userAgent).catch(e => console.error('Falha ao registrar o login da equipe', e));
        },
      },
    },
  },
  // Rate limit das rotas /api/auth: o IP real vem do Nginx em X-Real-IP (X-Forwarded-For pode ser forjado).
  advanced: { ipAddress: { ipAddressHeaders: ['x-real-ip'] } },
  plugins: [nextCookies()],
});
