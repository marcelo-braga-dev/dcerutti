'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { exigirPapel } from '../permissoes';
import { z } from 'zod';
import { auth } from '../auth';
import { db } from '../db';
import { lerConfig } from '../config';
import { criarConta } from '../contas';
import { gravar } from '../erros';
import { bloqueio, CADASTRO_POR_IP, ipDoCliente, limpar, LOGIN_POR_EMAIL, LOGIN_POR_IP, REDEFINICAO_POR_EMAIL, REDEFINICAO_POR_IP, registrarFalha } from '../limite';
import { errosDoZod, falha, valoresDe, type EstadoForm } from '@/lib/formulario';
import { celularValido, formatarCep, formatarTelefone, somenteDigitos } from '@/lib/telefone';
import { caminhoInterno } from '@/lib/url';

const destinoDoPapel = (papel: string) => (papel === 'cliente' ? '/' : '/painel');

export async function entrar(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const email = String(fd.get('email') ?? '').trim().toLowerCase();
  const senha = String(fd.get('senha') ?? '');
  if (!email || !senha) return falha(fd, {}, 'Informe e-mail e senha.');
  // C-01: a action chama o Better Auth direto, sem passar pelo rate limit das rotas HTTP dele.
  const chaveEmail = `login:email:${email}`;
  const chaveIp = `login:ip:${await ipDoCliente()}`;
  const minutos = Math.max(bloqueio(chaveEmail, LOGIN_POR_EMAIL), bloqueio(chaveIp, LOGIN_POR_IP));
  if (minutos) return { erro: `Muitas tentativas. Tente de novo em ${minutos} min.`, valores: valoresDe(fd) };
  try {
    await auth.api.signInEmail({ body: { email, password: senha }, headers: await headers() });
  } catch {
    registrarFalha(chaveEmail, LOGIN_POR_EMAIL);
    registrarFalha(chaveIp, LOGIN_POR_IP);
    return { erro: 'E-mail ou senha incorretos.', valores: valoresDe(fd) };
  }
  limpar(chaveEmail);
  const u = await db.user.findUnique({ where: { email }, select: { papel: true } });
  redirect(caminhoInterno(String(fd.get('volta') ?? '')) ?? destinoDoPapel(u?.papel ?? 'cliente'));
}

const MSG_REDEFINICAO = 'Se este e-mail tiver conta, enviamos um link para criar uma senha nova. Confira também a caixa de spam.';

/** B-03: pede o link de redefinição. A resposta é sempre a mesma, exista ou não a conta (não revela quem é cliente). */
export async function pedirRedefinicao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const email = String(fd.get('email') ?? '').trim().toLowerCase();
  if (!z.email().safeParse(email).success) return falha(fd, { email: 'Informe um e-mail válido.' });
  const chaveEmail = `redefinir:email:${email}`;
  const chaveIp = `redefinir:ip:${await ipDoCliente()}`;
  if (bloqueio(chaveEmail, REDEFINICAO_POR_EMAIL) || bloqueio(chaveIp, REDEFINICAO_POR_IP)) return { ok: true, mensagem: MSG_REDEFINICAO };
  registrarFalha(chaveEmail, REDEFINICAO_POR_EMAIL);
  registrarFalha(chaveIp, REDEFINICAO_POR_IP);
  await auth.api.requestPasswordReset({ body: { email }, headers: await headers() }).catch(e => console.error('Falha ao pedir redefinição de senha', e));
  return { ok: true, mensagem: MSG_REDEFINICAO };
}

const esquemaRedefinir = z.object({
  token: z.string().min(10, 'Link inválido.'),
  senha: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres.'),
  confirmacao: z.string(),
}).refine(d => d.senha === d.confirmacao, { path: ['confirmacao'], message: 'As duas senhas não são iguais.' });

/** B-03: define a senha nova pelo link do e-mail. O link é de uso único e todas as sessões abertas são encerradas. */
export async function redefinirSenha(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const r = esquemaRedefinir.safeParse(Object.fromEntries(fd));
  if (!r.success) return falha(fd, errosDoZod(r.error));
  try {
    await auth.api.resetPassword({ body: { newPassword: r.data.senha, token: r.data.token } });
  } catch {
    return { erro: 'Este link é inválido ou já expirou. Peça um novo em "Esqueci a senha".', valores: valoresDe(fd) };
  }
  redirect('/entrar?redefinida=1');
}

const esquemaMeusDados = z.object({
  nome: z.string().trim().min(3, 'Informe seu nome completo.').max(120),
  telefone: z.string().refine(celularValido, 'Informe o WhatsApp com DDD, ex.: (49) 99999-9999.').transform(formatarTelefone),
  endereco: z.string().trim().max(200).optional().transform(v => v || null),
  cidade: z.string().trim().max(80).optional().transform(v => v || null),
  cep: z.string().optional().transform(v => (v ? formatarCep(v) : null)).refine(v => !v || v.length === 9, 'CEP inválido.'),
});

/** U-04 (e LGPD, direito de correção): a cliente atualiza os próprios dados. O e-mail de acesso só muda pela loja. */
export async function atualizarMeusDados(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const u = await exigirPapel(['cliente']);
  const r = esquemaMeusDados.safeParse(Object.fromEntries(fd));
  if (!r.success) return falha(fd, errosDoZod(r.error));
  const d = r.data;
  await db.$transaction([
    db.user.update({ where: { id: u.id }, data: { name: d.nome, telefone: d.telefone } }),
    db.cliente.updateMany({ where: { userId: u.id }, data: { nome: d.nome, telefone: d.telefone, endereco: d.endereco, cidade: d.cidade, cep: d.cep } }),
  ]);
  revalidatePath('/minha-conta');
  return { ok: true, mensagem: 'Dados atualizados.' };
}

/** LGPD: cliente que ainda não aceitou (contas antigas ou criadas pelo vendedor) aceita no primeiro acesso. */
export async function aceitarPrivacidade(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const u = await exigirPapel(['cliente']);
  await db.user.update({ where: { id: u.id }, data: { aceitouPrivacidadeEm: new Date() } });
  redirect(caminhoInterno(String(fd.get('volta') ?? '')) ?? '/');
}

/**
 * LGPD, direito de exclusão: apaga o acesso e anonimiza a ficha e os pedidos (os valores ficam, sem identificar a
 * pessoa, para os relatórios da loja). Com pedido pendente, recusa: o vendedor precisa fechar ou cancelar antes.
 */
export async function excluirMinhaConta(): Promise<{ ok: boolean; erro?: string }> {
  const u = await exigirPapel(['cliente']);
  const cliente = await db.cliente.findUnique({ where: { userId: u.id }, select: { id: true } });
  if (cliente && (await db.pedido.count({ where: { clienteId: cliente.id, status: 'pendente' } })))
    return { ok: false, erro: 'Você tem pedido ou condicional em aberto. Peça ao seu vendedor para fechar ou cancelar antes de excluir a conta.' };
  const anonimo = 'Cliente removido';
  await db.$transaction([
    ...(cliente
      ? [
          db.pedido.updateMany({ where: { clienteId: cliente.id }, data: { nomeCliente: anonimo, telefoneCliente: '', cep: null } }),
          db.cliente.update({ where: { id: cliente.id }, data: { nome: anonimo, telefone: '', email: null, endereco: null, cidade: null, cep: null, preferencias: null, userId: null } }),
        ]
      : []),
    db.user.delete({ where: { id: u.id } }), // sessões e credencial saem em cascata
  ]);
  return { ok: true };
}

export async function sair() {
  await auth.api.signOut({ headers: await headers() });
  redirect('/entrar');
}

const esquemaCadastro = z.object({
  nome: z.string().trim().min(3, 'Informe seu nome completo.').max(120),
  telefone: z.string().refine(celularValido, 'Informe o WhatsApp com DDD, ex.: (49) 99999-9999.').transform(formatarTelefone),
  endereco: z.string().trim().max(200).optional(),
  cidade: z.string().trim().max(80).optional(),
  email: z.email('Informe um e-mail válido.').transform(e => e.toLowerCase()),
  senha: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres.'),
  vendedorId: z.string().optional(),
  aceite: z.literal('on', 'Para criar a conta, aceite a política de privacidade.'),
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
  const chaveIp = `cadastro:ip:${await ipDoCliente()}`;
  const minutos = bloqueio(chaveIp, CADASTRO_POR_IP);
  if (minutos) return falha(fd, {}, `Muitos cadastros a partir desta conexão. Tente de novo em ${minutos} min.`);
  const r = esquemaCadastro.safeParse(Object.fromEntries(fd));
  if (!r.success) return falha(fd, errosDoZod(r.error));
  const d = r.data;
  if (await db.user.findUnique({ where: { email: d.email } })) return falha(fd, { email: 'Este e-mail já tem conta. Use "Entrar".' });

  const vendedor = await vendedorParaNovoCliente(d.vendedorId);
  if (!vendedor) return falha(fd, {}, 'A loja ainda não tem vendedores cadastrados. Tente novamente mais tarde.');

  registrarFalha(chaveIp, CADASTRO_POR_IP); // conta cada cadastro concluído, não só os que falham
  const salvo = await gravar(() => db.$transaction(async tx => {
    const user = await criarConta(tx, { nome: d.nome, email: d.email, senha: d.senha, papel: 'cliente', telefone: d.telefone, aceitouPrivacidadeEm: new Date() });
    // C-03: nunca liga a conta nova a uma ficha existente só pelo telefone (quem soubesse o número veria o histórico
    // de outra pessoa). Se o vendedor já tinha uma ficha com este WhatsApp, a nova fica com o mesmo vendedor.
    const telefone = formatarTelefone(d.telefone);
    const existente = await tx.cliente.findFirst({ where: { userId: null, telefone: { in: [telefone, somenteDigitos(d.telefone)] } }, select: { vendedorId: true } });
    await tx.cliente.create({
      data: { nome: d.nome, telefone, email: d.email, endereco: d.endereco || null, cidade: d.cidade || null, userId: user.id, vendedorId: existente?.vendedorId ?? vendedor.id },
    });
  }));
  if (!salvo.ok) return falha(fd, {}, salvo.erro);

  await auth.api.signInEmail({ body: { email: d.email, password: d.senha }, headers: await headers() });
  redirect(caminhoInterno(String(fd.get('volta') ?? '')) ?? '/');
}
