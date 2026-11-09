import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Papel } from '@prisma/client';
import { auth } from './auth';
import { db } from './db';
import type { Usuario } from '@/lib/escopo';

export { escopoAtendimento, escopoVendedor, podeAcessar, podeAtender, type Usuario } from '@/lib/escopo';

/** Usuário da sessão atual, lido do banco (papel e status sempre atualizados). Uma consulta por requisição. */
export const usuarioAtual = cache(async (): Promise<Usuario | null> => {
  const sessao = await auth.api.getSession({ headers: await headers() });
  if (!sessao) return null;
  const u = await db.user.findUnique({
    where: { id: sessao.user.id },
    select: { id: true, name: true, email: true, papel: true, telefone: true, ativo: true, aceitouPrivacidadeEm: true },
  });
  if (!u || !u.ativo) return null;
  return { id: u.id, name: u.name, email: u.email, papel: u.papel, telefone: u.telefone, aceitouPrivacidadeEm: u.aceitouPrivacidadeEm };
});

/**
 * Exige um dos papéis informados. Sem sessão → /entrar; papel errado → início da loja.
 * Deve ser a primeira linha de toda página protegida e de toda Server Action.
 */
export async function exigirPapel(papeis: Papel[]): Promise<Usuario> {
  const u = await usuarioAtual();
  if (!u) redirect('/entrar');
  if (!papeis.includes(u.papel)) redirect(u.papel === 'cliente' ? '/' : '/painel');
  return u;
}

export const EQUIPE: Papel[] = ['vendedor', 'gestor'];

