'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '../db';
import { criarConta, trocarSenha } from '../contas';
import { gravar } from '../erros';
import { EQUIPE, exigirPapel, podeAcessar } from '../permissoes';
import { dataDoFormulario, diaDe } from '@/lib/datas';
import { lerValor } from '@/lib/dinheiro';
import { errosDoZod, falha, type EstadoForm } from '@/lib/formulario';
import { celularValido, formatarCep, formatarTelefone } from '@/lib/telefone';

const opcional = z.string().trim().max(200).optional().transform(v => v || null);

const esquemaCliente = z.object({
  id: z.string().optional(),
  nome: z.string().trim().min(2, 'Informe o nome.').max(120),
  telefone: z.string().refine(celularValido, 'Informe o WhatsApp com DDD e 9 dígitos.').transform(formatarTelefone),
  email: z.union([z.literal(''), z.email('E-mail inválido.')]).optional().transform(v => (v ? v.toLowerCase() : null)),
  senha: z.string().optional().refine(v => !v || v.length >= 8, 'A senha precisa ter pelo menos 8 caracteres.'),
  endereco: opcional,
  cidade: opcional,
  cep: z.string().optional().transform(v => (v ? formatarCep(v) : null)).refine(v => !v || v.length === 9, 'CEP inválido.'),
  preferencias: opcional,
  vendedorId: z.string().optional(),
});

export async function salvarCliente(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const u = await exigirPapel(EQUIPE);
  const r = esquemaCliente.safeParse(Object.fromEntries(fd));
  if (!r.success) return falha(fd, errosDoZod(r.error));
  const d = r.data;

  const atual = d.id ? await db.cliente.findUnique({ where: { id: d.id }, include: { user: true } }) : null;
  if (d.id && (!atual || !podeAcessar(u, atual))) return falha(fd, {}, 'Cliente não encontrado.');

  // Só o gestor escolhe (ou troca) o vendedor; o vendedor cadastra sempre para si.
  let vendedorId = u.papel === 'gestor' ? d.vendedorId || atual?.vendedorId : atual?.vendedorId ?? u.id;
  if (u.papel === 'gestor') {
    const ok = vendedorId && (await db.user.findFirst({ where: { id: vendedorId, papel: { in: ['vendedor', 'gestor'] } } }));
    if (!ok) return falha(fd, { vendedorId: 'Escolha o vendedor.' });
  }
  vendedorId = vendedorId!;

  // Conta já criada: e-mail e senha só mudam pelo gestor. Com a recuperação de senha por e-mail, trocar o e-mail
  // de outra pessoa seria um jeito de tomar a conta dela.
  const temConta = !!atual?.userId;
  if (temConta && u.papel !== 'gestor') {
    if (d.senha) return falha(fd, { senha: 'Só o gestor troca a senha de um cliente com acesso à loja.' });
    if (d.email !== atual!.user!.email) return falha(fd, { email: 'Só o gestor troca o e-mail de um cliente com acesso à loja.' });
  }
  if (temConta && !d.email) return falha(fd, { email: 'Cliente com acesso à loja precisa de e-mail.' });

  if (d.email) {
    const dono = await db.user.findUnique({ where: { email: d.email }, select: { id: true } });
    if (dono && dono.id !== atual?.userId) return falha(fd, { email: 'Este e-mail já está em uso.' });
  }

  const dados = { nome: d.nome, telefone: d.telefone, email: d.email, endereco: d.endereco, cidade: d.cidade, cep: d.cep, preferencias: d.preferencias, vendedorId };
  const salvo = await gravar(() => db.$transaction(async tx => {
    let userId = atual?.userId ?? null;
    if (userId) {
      await tx.user.update({ where: { id: userId }, data: { name: d.nome, telefone: d.telefone, ...(d.email ? { email: d.email } : {}) } });
      if (d.senha) await trocarSenha(tx, userId, d.senha);
    } else if (d.email && d.senha) {
      // E-mail + senha criam o acesso à loja. Só e-mail: fica registrado como contato, sem login.
      userId = (await criarConta(tx, { nome: d.nome, email: d.email, senha: d.senha, papel: 'cliente', telefone: d.telefone })).id;
    }
    const c = atual
      ? await tx.cliente.update({ where: { id: atual.id }, data: { ...dados, userId } })
      : await tx.cliente.create({ data: { ...dados, userId } });
    // B-09: trocou o vendedor do cliente? Os pedidos em aberto dele passam para o novo vendedor.
    if (atual && atual.vendedorId !== vendedorId)
      await tx.pedido.updateMany({ where: { clienteId: atual.id, status: 'pendente' }, data: { vendedorId } });
    return c.id;
  }));
  if (!salvo.ok) return falha(fd, {}, salvo.erro);
  revalidatePath('/painel/clientes');
  if (!atual) redirect(`/painel/clientes/${salvo.valor}`);
  return { ok: true, mensagem: 'Cliente salvo.' };
}

const esquemaVenda = z.object({
  clienteId: z.string(),
  valor: z.string().transform(lerValor).refine(v => v > 0 && v < 1_000_000, 'Informe o valor.'),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data.').refine(d => d <= diaDe(), 'A data não pode ser no futuro.'),
  observacao: z.string().trim().max(120).optional(),
});

/** RN-11: venda manual (loja física) — sem itens e sem custo. */
export async function registrarVenda(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const u = await exigirPapel(EQUIPE);
  const r = esquemaVenda.safeParse(Object.fromEntries(fd));
  if (!r.success) return falha(fd, errosDoZod(r.error));
  const cliente = await db.cliente.findUnique({ where: { id: r.data.clienteId } });
  if (!cliente || !podeAcessar(u, cliente)) return falha(fd, {}, 'Cliente não encontrado.');
  await db.venda.create({
    data: {
      vendedorId: u.papel === 'vendedor' ? u.id : cliente.vendedorId,
      clienteId: cliente.id,
      valor: r.data.valor,
      data: dataDoFormulario(r.data.data),
      observacao: r.data.observacao || 'Venda na loja',
    },
  });
  revalidatePath('/painel', 'layout');
  return { ok: true, mensagem: 'Venda registrada.' };
}

/** Só vendas manuais; as de pedido saem cancelando o pedido. */
export async function excluirVenda(vendaId: string): Promise<{ ok: boolean; erro?: string }> {
  const u = await exigirPapel(EQUIPE);
  const v = await db.venda.findUnique({ where: { id: vendaId } });
  if (!v || !podeAcessar(u, v)) return { ok: false, erro: 'Venda não encontrada.' };
  if (v.pedidoId) return { ok: false, erro: 'Venda de pedido não se exclui por aqui.' };
  await db.venda.deleteMany({ where: { id: vendaId } });
  revalidatePath('/painel', 'layout');
  return { ok: true };
}
