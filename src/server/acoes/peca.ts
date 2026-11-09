'use server';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { registrarEnvioDePeca, registrarInteressePublico } from '../atendimento';
import { produtoPorReferencia } from '../catalogo';
import { pecaPublica } from '../consultas/peca-publica';
import { gravar } from '../erros';
import { registrarAcao } from '../equipe';
import { linkDaPeca } from '../link-pedido';
import { barrarInteresse, campoContatoPublico } from '../interesse';
import { notificar } from '../notificacoes';
import { EQUIPE, exigirPapel } from '../permissoes';
import { urlDoSite } from '../site';
import { brl } from '@/lib/dinheiro';
import { linkWhatsApp } from '@/lib/whatsapp';

export type EnvioDePeca = {
  ok: true; referencia: string; produtoId: number; nome: string; preco: number; link: string; texto: string; fotos: string[]; videos: string[]; semEstoque: boolean;
} | { ok: false; erro: string };

/** Painel: o link assinado de quem está enviando, o texto pronto e os arquivos para compartilhar. */
export async function prepararEnvioDaPeca(referencia: string): Promise<EnvioDePeca> {
  const u = await exigirPapel(EQUIPE);
  const p = await produtoPorReferencia(String(referencia).slice(0, 20));
  if (!p) return { ok: false, erro: 'Peça não encontrada no catálogo.' };
  const link = linkDaPeca(await urlDoSite(), p.referencia, u.id);
  const tamanhos = p.variantes.filter(v => v.disponivel > 0).map(v => v.tamanho);
  const texto = [`*${p.nome}*`, brl(p.preco), tamanhos.length ? `Tamanhos: ${tamanhos.join(', ')}` : null, `Veja as fotos: ${link}`].filter(Boolean).join('\n');
  return { ok: true, referencia: p.referencia, produtoId: p.id, nome: p.nome, preco: p.preco, link, texto, fotos: p.imagens, videos: p.videos.map(v => v.url), semEstoque: !tamanhos.length };
}

/** Painel: a peça foi enviada (link, texto ou arquivo). Sem API, é o que dá para medir. */
export async function avisarPecaEnviada(referencia: string, atendimentoId?: string): Promise<void> {
  const u = await exigirPapel(EQUIPE);
  const p = await produtoPorReferencia(String(referencia).slice(0, 20));
  if (!p) return;
  if (atendimentoId) {
    const r = await gravar(() => registrarEnvioDePeca(u, String(atendimentoId), p.nome));
    if (r.ok) revalidatePath(`/painel/atendimento/${atendimentoId}`);
  }
  after(() => registrarAcao(u.id, 'peca_enviada', { descricao: `${p.nome} · ${p.referencia}` }));
}

const esquemaInteresse = campoContatoPublico.extend({ varianteId: z.number().int().positive() });

export type ResultadoInteresse = { ok: true; url: string; destinatario: string } | { ok: false; erro: string };

const mensagem = (quem: string | null, descricao: string, codigo: string | null) =>
  `Oi${quem ? `, ${quem}` : ''}! Quero esta peça: ${descricao}.${codigo ? ` (${codigo})` : ''}`;

/**
 * Formulário público da peça ("Quero esta peça"). Sem login: a chave assinada autoriza. Só registra um atendimento,
 * e a resposta é a mesma para qualquer telefone: o WhatsApp que abre é sempre o de quem enviou o link.
 */
export async function registrarInteresse(chave: string, entrada: { varianteId: number; nome: string; telefone: string; aceite: boolean; site?: string; ofertas?: boolean }): Promise<ResultadoInteresse> {
  const p = await pecaPublica(String(chave));
  if (!p) return { ok: false, erro: 'Esta peça não está mais disponível.' };
  const r = esquemaInteresse.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0].message };
  const d = r.data;
  const destinatario = p.contato.nome ?? 'a loja';
  const variante = p.variantes.find(v => v.id === d.varianteId);
  if (!variante) return { ok: false, erro: 'Este tamanho acabou. Escolha outro.' };
  const descricao = `${p.nome}, tam. ${variante.tamanho}`;

  // Campo invisível preenchido: robô. Responde igual a um envio normal, sem gravar nada.
  if (entrada.site) return { ok: true, url: linkWhatsApp(p.contato.telefone, mensagem(p.contato.nome, descricao, null)), destinatario };

  const bloqueado = await barrarInteresse(d.telefone);
  if (bloqueado) return { ok: false, erro: bloqueado };

  const salvo = await gravar(() => registrarInteressePublico({ nome: d.nome, telefone: d.telefone, itens: [{ varianteId: d.varianteId, produtoId: p.produtoId, descricao }], canal: 'link_peca', origemId: p.vendedorId, ofertas: entrada.ofertas === true }));
  if (!salvo.ok) return { ok: false, erro: 'Não foi possível registrar. Tente de novo.' };
  const a = salvo.valor;
  // Mesma pessoa no mesmo atendimento: cada pedido público pode avisar de novo, com a peça no título.
  if (a.responsavelId)
    after(() => notificar([a.responsavelId!], { tipo: 'atendimento_novo', titulo: `Pedido pelo link: ${p.nome}`, texto: `${a.codigo}. Chame a cliente pelo WhatsApp.`, link: `/painel/atendimento/${a.id}`, chave: `quero:${a.id}:${d.varianteId}` }));
  revalidatePath('/painel', 'layout');
  return { ok: true, url: linkWhatsApp(p.contato.telefone, mensagem(p.contato.nome, descricao, a.codigo)), destinatario };
}
