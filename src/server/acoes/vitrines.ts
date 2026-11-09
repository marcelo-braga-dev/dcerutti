'use server';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { registrarInteressePublico } from '../atendimento';
import { vitrinePublica } from '../consultas/vitrines';
import { gravar } from '../erros';
import { barrarInteresse, campoContatoPublico } from '../interesse';
import { notificar } from '../notificacoes';
import { EQUIPE, exigirPapel } from '../permissoes';
import * as vitrines from '../vitrines';
import { dataHoraDoFormulario } from '@/lib/datas';
import { lerValor } from '@/lib/dinheiro';
import { errosDoZod, falha, type EstadoForm } from '@/lib/formulario';
import { ehStatusVitrine, ehTipoVitrine, urlInstagramValida } from '@/lib/vitrines';
import { linkWhatsApp } from '@/lib/whatsapp';

export type ResultadoVitrine = { ok: boolean; erro?: string };

const atualizar = (id: string, slug?: string) => {
  revalidatePath(`/painel/vitrines/${id}`);
  revalidatePath('/painel/vitrines');
  revalidatePath('/vitrines');
  if (slug) revalidatePath(`/vitrine/${slug}`);
};

const campoDataHora = z.string().optional().refine(v => !v || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v), 'Data inválida.').transform(v => (v ? dataHoraDoFormulario(v) : null));

const esquema = z.object({
  id: z.string().max(40).optional(),
  tipo: z.string().refine(ehTipoVitrine, 'Escolha o tipo.'),
  titulo: z.string().trim().min(3, 'Informe o título.').max(120, 'No máximo 120 caracteres.'),
  descricao: z.string().trim().max(2000).optional().transform(v => v || null),
  urlInstagram: z.string().optional().refine(v => !v?.trim() || !!urlInstagramValida(v), 'Use um link do Instagram, começando com https://www.instagram.com/').transform(v => (v?.trim() ? urlInstagramValida(v) : null)),
  legenda: z.string().trim().max(2200, 'O Instagram aceita até 2.200 caracteres.').optional().transform(v => v || null),
  inicioPrevisto: campoDataHora,
  ofertaAte: campoDataHora,
  responsavelId: z.string().max(40).optional(),
});

export async function salvarVitrine(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const u = await exigirPapel(EQUIPE);
  const r = esquema.safeParse(Object.fromEntries(fd));
  if (!r.success) return falha(fd, errosDoZod(r.error));
  const { id, ...d } = r.data;
  const dados = { ...d, tipo: d.tipo as never };
  if (!id) {
    const salvo = await gravar(() => vitrines.criarVitrine(u, dados));
    if (!salvo.ok) return falha(fd, salvo.erro.includes('responsável') ? { responsavelId: salvo.erro } : {}, salvo.erro);
    redirect(`/painel/vitrines/${salvo.valor.id}`);
  }
  const salvo = await gravar(() => vitrines.atualizarVitrine(u, id, dados));
  if (!salvo.ok) return falha(fd, {}, salvo.erro);
  atualizar(id);
  return { ok: true, mensagem: 'Vitrine salva.' };
}

const executar = async (id: string, fn: () => Promise<unknown>): Promise<ResultadoVitrine> => {
  const r = await gravar(fn);
  if (!r.ok) return { ok: false, erro: r.erro };
  atualizar(id);
  return { ok: true };
};

export async function incluirPecaNaVitrine(id: string, produtoId: number): Promise<ResultadoVitrine> {
  const u = await exigirPapel(EQUIPE);
  if (!Number.isInteger(produtoId)) return { ok: false, erro: 'Peça inválida.' };
  return executar(String(id), () => vitrines.adicionarPecaNaVitrine(u, String(id), produtoId));
}

export async function tirarPecaDaVitrine(id: string, pecaId: number): Promise<ResultadoVitrine> {
  const u = await exigirPapel(EQUIPE);
  return executar(String(id), () => vitrines.removerPecaDaVitrine(u, String(id), Number(pecaId)));
}

export async function moverPeca(id: string, pecaId: number, direcao: -1 | 1): Promise<ResultadoVitrine> {
  const u = await exigirPapel(EQUIPE);
  return executar(String(id), () => vitrines.moverPecaNaVitrine(u, String(id), Number(pecaId), direcao === -1 ? -1 : 1));
}

/** `texto` em branco tira o preço especial. */
export async function salvarOferta(id: string, pecaId: number, texto: string): Promise<ResultadoVitrine> {
  const u = await exigirPapel(EQUIPE);
  const preco = String(texto ?? '').trim() ? lerValor(texto) : null;
  if (preco !== null && !Number.isFinite(preco)) return { ok: false, erro: 'Informe o preço em reais.' };
  return executar(String(id), () => vitrines.definirOferta(u, String(id), Number(pecaId), preco));
}

export async function mudarStatus(id: string, novo: string): Promise<ResultadoVitrine> {
  const u = await exigirPapel(EQUIPE);
  if (!ehStatusVitrine(novo)) return { ok: false, erro: 'Situação inválida.' };
  return executar(String(id), () => vitrines.mudarStatusDaVitrine(u, String(id), novo));
}

export async function duplicar(id: string): Promise<ResultadoVitrine> {
  const u = await exigirPapel(EQUIPE);
  const r = await gravar(() => vitrines.duplicarVitrine(u, String(id)));
  if (!r.ok) return { ok: false, erro: r.erro };
  redirect(`/painel/vitrines/${r.valor.id}`);
}

// ---------- Público ----------

const esquemaInteresse = campoContatoPublico.extend({ variantes: z.array(z.number().int().positive()).min(1, 'Escolha pelo menos uma peça.').max(20, 'Peças demais de uma vez.') });

export type ResultadoInteresseVitrine = { ok: true; url: string; destinatario: string } | { ok: false; erro: string };

/**
 * Formulário público da vitrine. Só registra um atendimento: nunca pedido nem reserva. As peças e os preços vêm do
 * servidor, e a resposta é a mesma para qualquer telefone: o WhatsApp que abre é sempre o da responsável pela vitrine.
 */
export async function registrarInteresseVitrine(slug: string, entrada: { variantes: number[]; nome: string; telefone: string; aceite: boolean; site?: string; ofertas?: boolean }): Promise<ResultadoInteresseVitrine> {
  const v = await vitrinePublica(String(slug));
  if (!v || !['agendada', 'no_ar', 'publicada'].includes(v.status)) return { ok: false, erro: 'Esta vitrine não está mais aberta. Fale com a loja.' };
  const r = esquemaInteresse.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0].message };
  const d = r.data;
  const itens = [...new Set(d.variantes)].flatMap(varianteId => {
    for (const p of v.pecas) {
      const t = p.variantes.find(x => x.id === varianteId);
      if (t) return [{ varianteId, produtoId: p.produtoId, descricao: `${p.nome}, tam. ${t.tamanho}` }];
    }
    return [];
  });
  if (!itens.length || itens.length !== new Set(d.variantes).size) return { ok: false, erro: 'Uma das peças acabou. Confira e tente de novo.' };
  const destinatario = v.contato.nome ?? 'a loja';
  const texto = (codigo: string | null) => `Oi${v.contato.nome ? `, ${v.contato.nome}` : ''}! Vi "${v.titulo}" e quero: ${itens.map(i => i.descricao).join('; ')}.${codigo ? ` (${codigo})` : ''}`;

  // Campo invisível preenchido: robô. Responde igual a um envio normal, sem gravar nada.
  if (entrada.site) return { ok: true, url: linkWhatsApp(v.contato.telefone, texto(null)), destinatario };
  const bloqueado = await barrarInteresse(d.telefone);
  if (bloqueado) return { ok: false, erro: bloqueado };

  const salvo = await gravar(() => registrarInteressePublico({ nome: d.nome, telefone: d.telefone, itens, canal: v.tipo === 'live' ? 'live' : 'vitrine', vitrineId: v.id, origemId: v.responsavelId, ofertas: entrada.ofertas === true }));
  if (!salvo.ok) return { ok: false, erro: 'Não foi possível registrar. Tente de novo.' };
  const a = salvo.valor;
  if (a.responsavelId)
    after(() => notificar([a.responsavelId!], { tipo: 'atendimento_novo', titulo: `Pedido pela vitrine: ${v.titulo}`.slice(0, 140), texto: `${a.codigo}. Chame a cliente pelo WhatsApp.`, link: `/painel/atendimento/${a.id}`, chave: `vitrine:${a.id}:${itens.map(i => i.varianteId).join('-')}`.slice(0, 100) }));
  revalidatePath('/painel', 'layout');
  return { ok: true, url: linkWhatsApp(v.contato.telefone, texto(a.codigo)), destinatario };
}
