'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '../db';
import { salvarConfig } from '../config';
import { criarConta, trocarSenha } from '../contas';
import { ErroNegocio, gravar } from '../erros';
import { exigirPapel } from '../permissoes';
import { mesDe } from '@/lib/datas';
import { lerValor } from '@/lib/dinheiro';
import { errosDoZod, falha, type EstadoForm } from '@/lib/formulario';
import { celularValido, formatarCep, formatarTelefone, somenteDigitos } from '@/lib/telefone';

const esquemaVendedor = z.object({
  id: z.string().optional(),
  nome: z.string().trim().min(3, 'Informe o nome.').max(120),
  telefone: z.string().refine(celularValido, 'Informe o WhatsApp com DDD e 9 dígitos, ex.: (49) 99998-0637.').transform(formatarTelefone),
  email: z.email('Informe um e-mail válido.').transform(e => e.toLowerCase()),
  senha: z.string().optional(),
  meta: z.string().transform(lerValor).refine(v => v >= 0, 'Informe a meta em reais (0 para sem meta).'),
});

export async function salvarVendedor(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirPapel(['gestor']);
  const r = esquemaVendedor.safeParse(Object.fromEntries(fd));
  if (!r.success) return falha(fd, errosDoZod(r.error));
  const d = r.data;
  if (!d.id && (d.senha ?? '').length < 8) return falha(fd, { senha: 'Defina uma senha com pelo menos 8 caracteres.' });
  if (d.id && d.senha && d.senha.length < 8) return falha(fd, { senha: 'A nova senha precisa ter pelo menos 8 caracteres.' });
  const dono = await db.user.findUnique({ where: { email: d.email }, select: { id: true } });
  if (dono && dono.id !== d.id) return falha(fd, { email: 'Este e-mail já está em uso.' });

  const mes = mesDe();
  const salvo = await gravar(() => db.$transaction(async tx => {
    let userId = d.id;
    if (userId) {
      const u = await tx.user.findFirst({ where: { id: userId, papel: 'vendedor' } });
      if (!u) throw new ErroNegocio('Vendedor não encontrado.');
      await tx.user.update({ where: { id: userId }, data: { name: d.nome, email: d.email, telefone: d.telefone } });
      if (d.senha) await trocarSenha(tx, userId, d.senha);
    } else {
      userId = (await criarConta(tx, { nome: d.nome, email: d.email, senha: d.senha!, papel: 'vendedor', telefone: d.telefone })).id;
    }
    await tx.meta.upsert({ where: { vendedorId_mes: { vendedorId: userId, mes } }, create: { vendedorId: userId, mes, valor: d.meta }, update: { valor: d.meta } });
    return userId;
  }));
  if (!salvo.ok) return falha(fd, {}, salvo.erro);
  revalidatePath('/painel', 'layout');
  if (!d.id) redirect(`/painel/vendedores/${salvo.valor}`);
  return { ok: true, mensagem: 'Vendedor salvo.' };
}

/** RN-01: desativar exige transferir os clientes; as sessões abertas são encerradas. */
export async function desativarVendedor(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const u = await exigirPapel(['gestor']);
  const id = String(fd.get('id'));
  const destino = String(fd.get('transferirPara') ?? '');
  // C-09: só desativa vendedores; o gestor nunca desativa a si mesmo nem outro gestor por aqui.
  if (id === u.id || !(await db.user.findFirst({ where: { id, papel: 'vendedor' }, select: { id: true } })))
    return falha(fd, {}, 'Vendedor não encontrado.');
  // Contagem e transferência na mesma transação: um cliente criado no meio do caminho também é transferido.
  const salvo = await gravar(() => db.$transaction(async tx => {
    const n = await tx.cliente.count({ where: { vendedorId: id } });
    if (n > 0 && !(await tx.user.findFirst({ where: { id: destino, papel: 'vendedor', ativo: true, NOT: { id } } })))
      throw new ErroNegocio('Escolha para quem transferir os clientes.');
    if (n > 0) await tx.cliente.updateMany({ where: { vendedorId: id }, data: { vendedorId: destino } });
    await tx.user.update({ where: { id }, data: { ativo: false } });
    await tx.session.deleteMany({ where: { userId: id } });
    return n;
  }));
  if (!salvo.ok) return falha(fd, salvo.erro.startsWith('Escolha') ? { transferirPara: salvo.erro } : {}, salvo.erro);
  const n = salvo.valor;
  revalidatePath('/painel', 'layout');
  return { ok: true, mensagem: n ? `Vendedor desativado. ${n} cliente(s) transferido(s).` : 'Vendedor desativado.' };
}

export async function reativarVendedor(id: string): Promise<{ ok: boolean; erro?: string }> {
  await exigirPapel(['gestor']);
  const { count } = await db.user.updateMany({ where: { id, papel: 'vendedor' }, data: { ativo: true } });
  if (!count) return { ok: false, erro: 'Vendedor não encontrado.' };
  revalidatePath('/painel', 'layout');
  return { ok: true };
}

export async function salvarMeta(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirPapel(['gestor']);
  const vendedorId = String(fd.get('vendedorId'));
  const mes = String(fd.get('mes'));
  const valor = lerValor(String(fd.get('valor')));
  if (!/^\d{4}-\d{2}$/.test(mes)) return falha(fd, { mes: 'Escolha o mês.' });
  if (!(valor >= 0)) return falha(fd, { valor: 'Informe a meta em reais.' });
  if (!(await db.user.findFirst({ where: { id: vendedorId, papel: 'vendedor' }, select: { id: true } }))) return falha(fd, {}, 'Vendedor não encontrado.');
  await db.meta.upsert({ where: { vendedorId_mes: { vendedorId, mes } }, create: { vendedorId, mes, valor }, update: { valor } });
  revalidatePath('/painel', 'layout');
  return { ok: true, mensagem: 'Meta salva.' };
}

const esquemaConfig = z.object({
  whatsappLoja: z.string().refine(celularValido, 'WhatsApp com DDD e 9 dígitos.'),
  cepsCondicional: z.string(),
  cidadeCondicional: z.string().trim().min(2, 'Informe a cidade.'),
  freteValor: z.string().transform(lerValor).refine(v => v >= 0, 'Valor inválido.'),
  freteGratisAcima: z.string().transform(lerValor).refine(v => v >= 0, 'Valor inválido.'),
  parcelas: z.coerce.number().int().min(0).max(12),
  vendedorPadraoId: z.string().optional(),
});

export async function salvarConfiguracoes(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirPapel(['gestor']);
  const r = esquemaConfig.safeParse(Object.fromEntries(fd));
  if (!r.success) return falha(fd, errosDoZod(r.error));
  const d = r.data;
  const ceps = d.cepsCondicional.split(/[\s,;]+/).map(formatarCep).filter(Boolean);
  if (ceps.some(c => c.length !== 9)) return falha(fd, { cepsCondicional: 'Cada CEP precisa ter 8 números.' });
  await salvarConfig({
    whatsappLoja: somenteDigitos(d.whatsappLoja),
    cepsCondicional: ceps,
    cidadeCondicional: d.cidadeCondicional,
    frete: { valor: d.freteValor, gratisAcima: d.freteGratisAcima },
    parcelas: d.parcelas,
    catalogoPublico: fd.get('catalogoPublico') === 'on',
    vendedorPadraoId: d.vendedorPadraoId ?? '',
  });
  revalidatePath('/', 'layout');
  return { ok: true, mensagem: 'Configurações salvas.' };
}
