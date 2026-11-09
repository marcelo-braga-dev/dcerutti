'use server';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { gravar } from '../erros';
import { registrarAcao } from '../equipe';
import { notificar } from '../notificacoes';
import { impactoDaRemocao } from '../consultas/numeros';
import { exigirPapel } from '../permissoes';
import * as numeros from '../numeros';
import { celularValido, formatarTelefone, somenteDigitos } from '@/lib/telefone';
import { errosDoZod, falha, type EstadoForm } from '@/lib/formulario';

/** Números de WhatsApp da loja (D-31): tudo aqui é só da gestora. */
export type ResultadoNumero = { ok: boolean; erro?: string; aviso?: string };

const id = z.number().int().positive();
const pessoa = z.string().min(1).max(40);
const ENTRADA_INVALIDA = { ok: false, erro: 'Dados inválidos. Atualize a página e tente de novo.' };

const atualizar = () => revalidatePath('/painel', 'layout');

const AVISO_DESCONECTAR = 'Agora desconecte o aparelho em Aparelhos conectados, no WhatsApp: tirar daqui não desconecta o aparelho.';

const avisarPessoa = (usuarioId: string, titulo: string, texto: string) =>
  after(() => notificar([usuarioId], { tipo: 'numero_alterado', titulo, texto, link: '/painel' }));

const esquema = z.object({
  id: z.coerce.number().int().positive().optional(),
  telefone: z.string().refine(celularValido, 'Informe o WhatsApp com DDD e 9 dígitos.').transform(somenteDigitos),
  apelido: z.string().trim().min(2, 'Dê um nome para a equipe reconhecer o número.').max(60, 'No máximo 60 caracteres.'),
  observacao: z.string().trim().max(300, 'No máximo 300 caracteres.').optional().transform(v => v || null),
});

export async function salvarNumero(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const u = await exigirPapel(['gestor']);
  const r = esquema.safeParse(Object.fromEntries(fd));
  if (!r.success) return falha(fd, errosDoZod(r.error));
  const salvo = await gravar(() => numeros.salvarNumeroDaLoja(r.data, u.id));
  if (!salvo.ok) return falha(fd, {}, salvo.erro.startsWith('Já existe') ? 'Este telefone já está cadastrado.' : salvo.erro);
  if (!r.data.id) after(() => registrarAcao(u.id, 'numero_cadastrado', { numeroId: salvo.valor.id, descricao: `${salvo.valor.apelido} · ${formatarTelefone(salvo.valor.telefone)}` }));
  revalidatePath('/', 'layout');
  return { ok: true, mensagem: 'Número salvo.' };
}

export async function ligarPessoa(numeroId: number, usuarioId: string): Promise<ResultadoNumero> {
  const u = await exigirPapel(['gestor']);
  if (!id.safeParse(numeroId).success || !pessoa.safeParse(usuarioId).success) return ENTRADA_INVALIDA;
  const r = await gravar(() => numeros.vincular(numeroId, usuarioId, u.id));
  if (!r.ok) return { ok: false, erro: r.erro };
  after(() => registrarAcao(u.id, 'numero_vinculado', { numeroId, descricao: r.valor.apelido }));
  avisarPessoa(usuarioId, `Você agora atende pelo número ${r.valor.apelido}`, formatarTelefone(r.valor.telefone));
  atualizar();
  return { ok: true };
}

export async function tirarPessoa(d: { numeroId: number; usuarioId: string; motivo?: string; transferirPara?: string }): Promise<ResultadoNumero> {
  const u = await exigirPapel(['gestor']);
  if (!id.safeParse(d.numeroId).success || !pessoa.safeParse(d.usuarioId).success) return ENTRADA_INVALIDA;
  const r = await gravar(() => numeros.desvincular({ ...d, porId: u.id, transferirPara: d.transferirPara || null, motivo: d.motivo?.trim() || null }));
  if (!r.ok) return { ok: false, erro: r.erro };
  after(() => registrarAcao(u.id, 'numero_desvinculado', { numeroId: d.numeroId, descricao: r.valor.numero.apelido }));
  avisarPessoa(d.usuarioId, `Você não atende mais pelo número ${r.valor.numero.apelido}`, 'Fale com a gestora se tiver dúvidas.');
  atualizar();
  return { ok: true, aviso: r.valor.pendenteDesconectar ? AVISO_DESCONECTAR : undefined };
}

export async function moverPessoa(origemId: number, destinoId: number, usuarioId: string): Promise<ResultadoNumero> {
  const u = await exigirPapel(['gestor']);
  if (!id.safeParse(origemId).success || !id.safeParse(destinoId).success || !pessoa.safeParse(usuarioId).success) return ENTRADA_INVALIDA;
  const r = await gravar(() => numeros.mover({ origemId, destinoId, usuarioId, porId: u.id }));
  if (!r.ok) return { ok: false, erro: r.erro };
  after(async () => {
    await registrarAcao(u.id, 'numero_desvinculado', { numeroId: origemId, descricao: `Mudou para ${r.valor.destino.apelido}` });
    await registrarAcao(u.id, 'numero_vinculado', { numeroId: destinoId, descricao: r.valor.destino.apelido });
  });
  avisarPessoa(usuarioId, `Você agora atende pelo número ${r.valor.destino.apelido}`, formatarTelefone(r.valor.destino.telefone));
  atualizar();
  return { ok: true, aviso: r.valor.pendenteDesconectar ? AVISO_DESCONECTAR : undefined };
}

export async function tornarPrincipal(numeroId: number, usuarioId: string): Promise<ResultadoNumero> {
  await exigirPapel(['gestor']);
  if (!id.safeParse(numeroId).success || !pessoa.safeParse(usuarioId).success) return ENTRADA_INVALIDA;
  const r = await gravar(() => numeros.definirPrincipal(numeroId, usuarioId));
  if (!r.ok) return { ok: false, erro: r.erro };
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function marcarConectada(vinculoId: number): Promise<ResultadoNumero> {
  await exigirPapel(['gestor']);
  if (!id.safeParse(vinculoId).success) return ENTRADA_INVALIDA;
  const r = await gravar(() => numeros.confirmarConexao(vinculoId));
  if (!r.ok) return { ok: false, erro: r.erro };
  atualizar();
  return { ok: true };
}

export async function marcarDesconectada(vinculoId: number): Promise<ResultadoNumero> {
  await exigirPapel(['gestor']);
  if (!id.safeParse(vinculoId).success) return ENTRADA_INVALIDA;
  const r = await gravar(() => numeros.confirmarDesconexao(vinculoId));
  if (!r.ok) return { ok: false, erro: r.erro };
  atualizar();
  return { ok: true };
}

export async function mudarStatusDoNumero(numeroId: number, status: 'ativo' | 'pausado' | 'desativado'): Promise<ResultadoNumero> {
  const u = await exigirPapel(['gestor']);
  if (!id.safeParse(numeroId).success || !['ativo', 'pausado', 'desativado'].includes(status)) return ENTRADA_INVALIDA;
  const r = await gravar(() => numeros.mudarStatus(numeroId, status, u.id));
  if (!r.ok) return { ok: false, erro: r.erro };
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function tornarPadrao(numeroId: number): Promise<ResultadoNumero> {
  await exigirPapel(['gestor']);
  if (!id.safeParse(numeroId).success) return ENTRADA_INVALIDA;
  const r = await gravar(() => numeros.definirPadrao(numeroId));
  if (!r.ok) return { ok: false, erro: r.erro };
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** O que muda ao tirar a pessoa do número: a tela mostra antes de confirmar. */
export async function verImpacto(numeroId: number, usuarioId: string) {
  const u = await exigirPapel(['gestor']);
  if (!id.safeParse(numeroId).success || !pessoa.safeParse(usuarioId).success) return null;
  return impactoDaRemocao(u, numeroId, usuarioId);
}
