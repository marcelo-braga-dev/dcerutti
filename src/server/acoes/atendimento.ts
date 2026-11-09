'use server';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import * as atendimento from '../atendimento';
import { gravar } from '../erros';
import { registrarAcao } from '../equipe';
import { bloqueio, CONTATO_ALHEIO_POR_EQUIPE, registrarFalha } from '../limite';
import { notificar } from '../notificacoes';
import { EQUIPE, exigirPapel } from '../permissoes';
import { ehCanal, ehEtapa, MOTIVOS_PERDA, normalizarInstagram, variaveisDesconhecidas, VARIAVEIS_RESPOSTA } from '@/lib/atendimento';
import { dataDoFormulario, diaDe } from '@/lib/datas';
import { errosDoZod, falha, type EstadoForm } from '@/lib/formulario';
import { celularValido, somenteDigitos } from '@/lib/telefone';
import { linkWhatsApp, mensagemDoVendedor } from '@/lib/whatsapp';

export type ResultadoAtendimento = { ok: boolean; erro?: string };

const atualizar = () => revalidatePath('/painel', 'layout');

const avisarResponsavel = (responsavelId: string | null | undefined, feitoPor: string, id: string, codigo: string, nome: string) => {
  if (responsavelId && responsavelId !== feitoPor)
    after(() => notificar([responsavelId], { tipo: 'atendimento_novo', titulo: `Atendimento para você: ${nome}`, texto: `${codigo}. Veja a nota e chame a cliente.`, link: `/painel/atendimento/${id}`, chave: `atendimento:${id}:${responsavelId}` }));
};

/** WhatsApp opcional, mas válido se vier; @ opcional, mas válido se vier. */
const campoTelefone = z.string().optional().refine(v => !v?.trim() || celularValido(v), 'Informe o WhatsApp com DDD e 9 dígitos.').transform(v => (v?.trim() ? somenteDigitos(v) : null));
const campoInstagram = z.string().optional().refine(v => !v?.trim() || !!normalizarInstagram(v), 'Informe um @ válido do Instagram.').transform(v => (v?.trim() ? normalizarInstagram(v) : null));

const esquemaNovo = z.object({
  nome: z.string().trim().min(2, 'Informe o nome.').max(120),
  telefone: campoTelefone,
  instagram: campoInstagram,
  canal: z.string().refine(ehCanal, 'Escolha o canal.'),
  nota: z.string().trim().max(2000).optional(),
  responsavelId: z.string().max(40).optional(),
});

export async function novoAtendimento(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const u = await exigirPapel(EQUIPE);
  const r = esquemaNovo.safeParse(Object.fromEntries(fd));
  if (!r.success) return falha(fd, errosDoZod(r.error));
  const d = r.data;
  if (!d.telefone && !d.instagram) return falha(fd, { telefone: 'Informe o WhatsApp ou o @ do Instagram.' });
  // A resposta diz de quem é o contato: sem limite, serviria para varrer a carteira das outras vendedoras.
  const chave = `contato-alheio:${u.id}`;
  const minutos = bloqueio(chave, CONTATO_ALHEIO_POR_EQUIPE);
  if (minutos) return falha(fd, {}, `Muitos contatos de outras carteiras. Tente de novo em ${minutos} min.`);

  const salvo = await gravar(() => atendimento.criarAtendimento(u, { ...d, canal: d.canal as never, responsavelId: u.papel === 'gestor' ? d.responsavelId : null }));
  if (!salvo.ok) return falha(fd, {}, salvo.erro);
  const a = salvo.valor;
  atualizar();
  if (a.tipo === 'encaminhado') {
    registrarFalha(chave, CONTATO_ALHEIO_POR_EQUIPE);
    after(() => registrarAcao(u.id, 'atendimento_encaminhado', { descricao: `${a.codigo} · para ${a.para}` }));
    avisarResponsavel(a.responsavelId, u.id, a.id, a.codigo, d.nome);
    return { ok: true, mensagem: `Este contato é de ${a.para}. O atendimento ${a.codigo} foi encaminhado, com a sua nota.` };
  }
  if (a.tipo === 'criado') {
    after(() => registrarAcao(u.id, 'atendimento_criado', { clienteId: a.clienteId, descricao: `${a.codigo} · ${d.nome}` }));
    if (a.fichaCriada) after(() => registrarAcao(u.id, 'cliente_cadastrado', { clienteId: a.clienteId, descricao: d.nome }));
    avisarResponsavel(a.responsavelId, u.id, a.id, a.codigo, d.nome);
  }
  redirect(`/painel/atendimento/${a.id}`);
}

const campoData = z.string().optional().transform(v => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null));

const esquemaEtapa = z.object({
  id: z.string().max(40),
  etapa: z.string().refine(ehEtapa, 'Escolha a etapa.'),
  proximoContato: campoData,
  motivoPerda: z.string().optional().refine(v => !v || v in MOTIVOS_PERDA, 'Escolha o motivo.'),
});

export async function salvarEtapa(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const u = await exigirPapel(EQUIPE);
  const r = esquemaEtapa.safeParse(Object.fromEntries(fd));
  if (!r.success) return falha(fd, errosDoZod(r.error));
  const d = r.data;
  if (d.etapa !== 'perdido' && !d.proximoContato) return falha(fd, { proximoContato: 'Marque a data do próximo contato.' });
  if (d.etapa !== 'perdido' && d.proximoContato! < diaDe()) return falha(fd, { proximoContato: 'A data não pode estar no passado.' });
  if (d.etapa === 'perdido' && !d.motivoPerda) return falha(fd, { motivoPerda: 'Escolha o motivo.' });
  const salvo = await gravar(() => atendimento.mudarEtapa(u, d.id, { etapa: d.etapa as never, proximoContatoEm: d.proximoContato ? dataDoFormulario(d.proximoContato) : null, motivoPerda: d.motivoPerda }));
  if (!salvo.ok) return falha(fd, {}, salvo.erro);
  if (salvo.valor.fechou) after(() => registrarAcao(u.id, 'atendimento_fechado', { clienteId: salvo.valor.a.clienteId, descricao: `${salvo.valor.a.codigo} · perdido` }));
  atualizar();
  return { ok: true, mensagem: 'Atendimento atualizado.' };
}

/** "Amanhã", na fila: adia sem abrir o atendimento. */
export async function adiarAtendimento(id: string, dias = 1): Promise<ResultadoAtendimento> {
  const u = await exigirPapel(EQUIPE);
  const r = await gravar(() => atendimento.reagendar(u, String(id), dataDoFormulario(diaDe(new Date(Date.now() + Math.min(Math.max(dias, 1), 30) * 86_400_000)))));
  if (!r.ok) return { ok: false, erro: r.erro };
  atualizar();
  return { ok: true };
}

export async function salvarNota(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const u = await exigirPapel(EQUIPE);
  const texto = String(fd.get('texto') ?? '').trim().slice(0, 2000);
  if (!texto) return falha(fd, { texto: 'Escreva a nota.' });
  const r = await gravar(() => atendimento.adicionarNota(u, String(fd.get('id')), texto));
  if (!r.ok) return falha(fd, {}, r.erro);
  atualizar();
  return { ok: true };
}

export async function marcarContato(id: string, canal: 'whatsapp' | 'instagram'): Promise<ResultadoAtendimento> {
  const u = await exigirPapel(EQUIPE);
  if (canal !== 'whatsapp' && canal !== 'instagram') return { ok: false, erro: 'Canal inválido.' };
  const r = await gravar(() => atendimento.registrarContato(u, String(id), canal));
  if (!r.ok) return { ok: false, erro: r.erro };
  after(() => registrarAcao(u.id, 'atendimento_contato', { numeroId: r.valor.numeroId, descricao: `${r.valor.codigo} · ${canal === 'whatsapp' ? 'WhatsApp' : 'Direct'}` }));
  atualizar();
  return { ok: true };
}

const esquemaContato = z.object({ id: z.string().max(40), telefone: campoTelefone, instagram: campoInstagram });

export async function salvarContato(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const u = await exigirPapel(EQUIPE);
  const r = esquemaContato.safeParse(Object.fromEntries(fd));
  if (!r.success) return falha(fd, errosDoZod(r.error));
  const d = r.data;
  if (!d.telefone && !d.instagram) return falha(fd, { telefone: 'Informe o WhatsApp ou o @.' });
  const chave = `contato-alheio:${u.id}`;
  const minutos = bloqueio(chave, CONTATO_ALHEIO_POR_EQUIPE);
  if (minutos) return falha(fd, {}, `Muitos contatos de outras carteiras. Tente de novo em ${minutos} min.`);
  const salvo = await gravar(() => atendimento.informarContato(u, d.id, { telefone: d.telefone, instagram: d.instagram }));
  if (!salvo.ok) return falha(fd, {}, salvo.erro);
  atualizar();
  if (salvo.valor.encaminhadoPara) {
    registrarFalha(chave, CONTATO_ALHEIO_POR_EQUIPE);
    after(() => registrarAcao(u.id, 'atendimento_encaminhado', { descricao: `Para ${salvo.valor.encaminhadoPara}` }));
    avisarResponsavel(salvo.valor.responsavelId, u.id, d.id, 'Contato com ficha', 'cliente da sua carteira');
    if (u.papel === 'gestor') return { ok: true, mensagem: `Este WhatsApp já tem ficha: o atendimento foi para ${salvo.valor.encaminhadoPara}.` };
    redirect('/painel/atendimento');
  }
  return { ok: true, mensagem: 'Contato salvo.' };
}

export async function passarAtendimento(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const u = await exigirPapel(['gestor']);
  const id = String(fd.get('id')), para = String(fd.get('para') ?? '');
  if (!para) return falha(fd, { para: 'Escolha a vendedora.' });
  const r = await gravar(() => atendimento.transferirAtendimento(u, id, para));
  if (!r.ok) return falha(fd, {}, r.erro);
  avisarResponsavel(para, u.id, id, 'Transferido pela gestão', 'atendimento transferido');
  atualizar();
  return { ok: true, mensagem: `Passado para ${r.valor.name}.` };
}

export async function incluirPeca(id: string, varianteId: number): Promise<ResultadoAtendimento> {
  const u = await exigirPapel(EQUIPE);
  if (!Number.isInteger(varianteId) || varianteId <= 0) return { ok: false, erro: 'Peça inválida.' };
  const r = await gravar(() => atendimento.adicionarPeca(u, String(id), varianteId));
  if (!r.ok) return { ok: false, erro: r.erro };
  atualizar();
  return { ok: true };
}

export async function retirarPeca(id: string, itemId: number): Promise<ResultadoAtendimento> {
  const u = await exigirPapel(EQUIPE);
  if (!Number.isInteger(itemId)) return { ok: false, erro: 'Peça inválida.' };
  const r = await gravar(() => atendimento.removerPeca(u, String(id), itemId));
  if (!r.ok) return { ok: false, erro: r.erro };
  atualizar();
  return { ok: true };
}

export async function criarPedidoDoAtendimento(id: string, tipo: 'compra' | 'condicional'): Promise<ResultadoAtendimento & { pedidoId?: string; codigo?: string; url?: string }> {
  const u = await exigirPapel(EQUIPE);
  if (tipo !== 'compra' && tipo !== 'condicional') return { ok: false, erro: 'Escolha o tipo do pedido.' };
  const r = await gravar(() => atendimento.converterEmPedido(u, String(id), tipo));
  if (!r.ok) return { ok: false, erro: r.erro };
  const { pedido, cliente, nomeVendedor } = r.valor;
  const pecas = pedido.itens.reduce((a, i) => a + i.quantidade, 0);
  after(() => registrarAcao(u.id, 'pedido_criado', { clienteId: cliente.id, pedidoId: pedido.id, valor: pedido.total, descricao: `${cliente.nome} · ${pedido.codigo} · ${pecas} ${pecas === 1 ? 'peça' : 'peças'}` }));
  atualizar();
  const texto = mensagemDoVendedor({ codigo: pedido.codigo, itens: pedido.itens, nomeCliente: cliente.nome, nomeVendedor, condicional: tipo === 'condicional', cupom: pedido.cupom });
  return { ok: true, pedidoId: pedido.id, codigo: pedido.codigo, url: linkWhatsApp(cliente.telefone, texto) };
}

export async function apagarDadosDoContato(id: string): Promise<ResultadoAtendimento> {
  const u = await exigirPapel(['gestor']);
  const r = await gravar(() => atendimento.apagarContato(u, String(id)));
  if (!r.ok) return { ok: false, erro: r.erro };
  atualizar();
  return { ok: true };
}

const esquemaResposta = z.object({
  id: z.coerce.number().int().positive().optional(),
  titulo: z.string().trim().min(2, 'Dê um título.').max(80, 'No máximo 80 caracteres.'),
  texto: z.string().trim().min(2, 'Escreva o texto.').max(2000, 'No máximo 2.000 caracteres.'),
});

export async function gravarResposta(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const u = await exigirPapel(EQUIPE);
  const r = esquemaResposta.safeParse(Object.fromEntries(fd));
  if (!r.success) return falha(fd, errosDoZod(r.error));
  const erradas = variaveisDesconhecidas(r.data.texto);
  if (erradas.length) return falha(fd, { texto: `Não existe {${erradas[0]}}. Use: ${VARIAVEIS_RESPOSTA.map(v => `{${v}}`).join(', ')}.` });
  const salvo = await gravar(() => atendimento.salvarResposta(u, { ...r.data, daLoja: fd.get('daLoja') === 'on' }));
  if (!salvo.ok) return falha(fd, {}, salvo.erro);
  revalidatePath('/painel/atendimento', 'layout');
  return { ok: true, mensagem: 'Resposta salva.' };
}

export async function apagarResposta(id: number): Promise<ResultadoAtendimento> {
  const u = await exigirPapel(EQUIPE);
  const r = await gravar(() => atendimento.excluirResposta(u, Number(id)));
  if (!r.ok) return { ok: false, erro: r.erro };
  revalidatePath('/painel/atendimento', 'layout');
  return { ok: true };
}
