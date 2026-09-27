'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '../auth';
import { db } from '../db';
import { lerConfig } from '../config';
import { criarConta } from '../contas';
import { errosDoZod, falha, valoresDe, type EstadoForm } from '@/lib/formulario';
import { celularValido, somenteDigitos } from '@/lib/telefone';

const destinoDoPapel = (papel: string) => (papel === 'cliente' ? '/' : '/painel');

export async function entrar(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const email = String(fd.get('email') ?? '').trim().toLowerCase();
  const senha = String(fd.get('senha') ?? '');
  if (!email || !senha) return falha(fd, {}, 'Informe e-mail e senha.');
  try {
    await auth.api.signInEmail({ body: { email, password: senha }, headers: await headers() });
  } catch {
    return { erro: 'E-mail ou senha incorretos.', valores: valoresDe(fd) };
  }
  const u = await db.user.findUnique({ where: { email }, select: { papel: true } });
  const volta = String(fd.get('volta') ?? '');
  redirect(volta.startsWith('/') && !volta.startsWith('//') ? volta : destinoDoPapel(u?.papel ?? 'cliente'));
}

export async function sair() {
  await auth.api.signOut({ headers: await headers() });
  redirect('/entrar');
}

const esquemaCadastro = z.object({
  nome: z.string().trim().min(3, 'Informe seu nome completo.').max(120),
  telefone: z.string().refine(celularValido, 'Informe o WhatsApp com DDD, ex.: (49) 99999-9999.'),
  endereco: z.string().trim().max(200).optional(),
  cidade: z.string().trim().max(80).optional(),
  email: z.email('Informe um e-mail válido.').transform(e => e.toLowerCase()),
  senha: z.string().min(6, 'A senha precisa ter pelo menos 6 caracteres.'),
  vendedorId: z.string().optional(),
});

/** Vendedor ativo para um novo cliente: convite → escolha → padrão da loja → primeiro vendedor ativo. */
async function vendedorParaNovoCliente(escolhido?: string) {
  const ativo = (id?: string) => (id ? db.user.findFirst({ where: { id, papel: 'vendedor', ativo: true }, select: { id: true } }) : null);
  const cfg = await lerConfig();
  return (
    (await ativo(escolhido)) ??
    (await ativo(cfg.vendedorPadraoId || undefined)) ??
    (await db.user.findFirst({ where: { papel: 'vendedor', ativo: true }, orderBy: { createdAt: 'asc' }, select: { id: true } }))
  );
}

export async function cadastrarCliente(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const r = esquemaCadastro.safeParse(Object.fromEntries(fd));
  if (!r.success) return falha(fd, errosDoZod(r.error));
  const d = r.data;
  if (await db.user.findUnique({ where: { email: d.email } })) return falha(fd, { email: 'Este e-mail já tem conta. Use "Entrar".' });

  const vendedor = await vendedorParaNovoCliente(d.vendedorId);
  if (!vendedor) return falha(fd, {}, 'A loja ainda não tem vendedores cadastrados. Tente novamente mais tarde.');

  await db.$transaction(async tx => {
    const user = await criarConta(tx, { nome: d.nome, email: d.email, senha: d.senha, papel: 'cliente', telefone: d.telefone });
    // Se o vendedor já tinha cadastrado esta pessoa (mesmo WhatsApp, sem conta), liga a conta à ficha existente.
    const digitos = somenteDigitos(d.telefone);
    const candidatos = await tx.cliente.findMany({ where: { userId: null }, select: { id: true, telefone: true } });
    const existente = candidatos.find(c => somenteDigitos(c.telefone) === digitos);
    const dados = { nome: d.nome, telefone: d.telefone, email: d.email, endereco: d.endereco || null, cidade: d.cidade || null };
    if (existente) await tx.cliente.update({ where: { id: existente.id }, data: { ...dados, userId: user.id } });
    else await tx.cliente.create({ data: { ...dados, userId: user.id, vendedorId: vendedor.id } });
  });

  await auth.api.signInEmail({ body: { email: d.email, password: d.senha }, headers: await headers() });
  redirect('/');
}
