'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '../db';
import { salvarConfig } from '../config';
import { criarConta, trocarSenha } from '../contas';
import { exigirPapel } from '../permissoes';
import { mesDe } from '@/lib/datas';
import { lerValor } from '@/lib/dinheiro';
import { errosDoZod, falha, type EstadoForm } from '@/lib/formulario';
import { celularValido, formatarCep, somenteDigitos } from '@/lib/telefone';

const esquemaVendedor = z.object({
  id: z.string().optional(),
  nome: z.string().trim().min(3, 'Informe o nome.').max(120),
  telefone: z.string().refine(celularValido, 'Informe o WhatsApp com DDD e 9 dígitos, ex.: (49) 99998-0637.'),
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
  const id = await db.$transaction(async tx => {
    let userId = d.id;
    if (userId) {
      const u = await tx.user.findFirst({ where: { id: userId, papel: 'vendedor' } });
      if (!u) throw new Error('Vendedor não encontrado.');
      await tx.user.update({ where: { id: userId }, data: { name: d.nome, email: d.email, telefone: d.telefone } });
      if (d.senha) await trocarSenha(tx, userId, d.senha);
    } else {
      userId = (await criarConta(tx, { nome: d.nome, email: d.email, senha: d.senha!, papel: 'vendedor', telefone: d.telefone })).id;
    }
    await tx.meta.upsert({ where: { vendedorId_mes: { vendedorId: userId, mes } }, create: { vendedorId: userId, mes, valor: d.meta }, update: { valor: d.meta } });
    return userId;
  });
  revalidatePath('/painel', 'layout');
  if (!d.id) redirect(`/painel/vendedores/${id}`);
  return { ok: true, mensagem: 'Vendedor salvo.' };
}

/** RN-01: desativar exige transferir os clientes; as sessões abertas são encerradas. */
export async function desativarVendedor(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirPapel(['gestor']);
  const id = String(fd.get('id'));
  const destino = String(fd.get('transferirPara') ?? '');
  const n = await db.cliente.count({ where: { vendedorId: id } });
  if (n > 0) {
    const ok = await db.user.findFirst({ where: { id: destino, papel: 'vendedor', ativo: true, NOT: { id } } });
    if (!ok) return falha(fd, { transferirPara: 'Escolha para quem transferir os clientes.' });
  }
  await db.$transaction([
    db.cliente.updateMany({ where: { vendedorId: id }, data: { vendedorId: destino } }),
    db.user.update({ where: { id }, data: { ativo: false } }),
    db.session.deleteMany({ where: { userId: id } }),
  ]);
  revalidatePath('/painel', 'layout');
  return { ok: true, mensagem: n ? `Vendedor desativado. ${n} cliente(s) transferido(s).` : 'Vendedor desativado.' };
}

export async function reativarVendedor(id: string) {
  await exigirPapel(['gestor']);
  await db.user.update({ where: { id }, data: { ativo: true } });
  revalidatePath('/painel', 'layout');
}

export async function salvarMeta(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirPapel(['gestor']);
  const vendedorId = String(fd.get('vendedorId'));
  const mes = String(fd.get('mes'));
  const valor = lerValor(String(fd.get('valor')));
  if (!/^\d{4}-\d{2}$/.test(mes)) return falha(fd, { mes: 'Escolha o mês.' });
  if (!(valor >= 0)) return falha(fd, { valor: 'Informe a meta em reais.' });
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
