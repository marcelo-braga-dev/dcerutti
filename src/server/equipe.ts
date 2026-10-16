import 'server-only';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from './db';
import { escopoVendedor, podeAcessar, type Usuario } from './permissoes';
import { formatarTelefone, somenteDigitos } from '@/lib/telefone';
import { aparelhoDe } from '@/lib/atividade';
import { MESES_RETENCAO_EQUIPE, MINUTOS_SESSAO, type Acao } from '@/lib/equipe';

/**
 * Acompanhamento da equipe (D-26): login, presença (sessões com o painel ou o caixa aberto) e histórico de ações dos
 * vendedores e gestores. Nada aqui pode impedir o trabalho: quem chama não espera o erro (registrar nunca lança).
 */

type Extra = { clienteId?: string | null; pedidoId?: string | null; valor?: number | Prisma.Decimal | null; descricao?: string | null; aparelho?: string | null };

/** Grava uma ação. Nunca lança: falhar aqui não pode desfazer o que a pessoa acabou de fazer. */
export async function registrarAcao(usuarioId: string | null | undefined, tipo: Acao, extra: Extra = {}, agora = new Date()) {
  if (!usuarioId) return;
  try {
    await db.atividadeEquipe.create({
      data: {
        usuarioId, tipo, criadoEm: agora,
        clienteId: extra.clienteId ?? null, pedidoId: extra.pedidoId ?? null,
        valor: extra.valor == null ? null : Number(extra.valor),
        descricao: extra.descricao ? extra.descricao.slice(0, 200) : null, aparelho: extra.aparelho ?? null,
      },
    });
  } catch (e) {
    console.error('Falha ao registrar a ação da equipe', tipo, e);
  }
}

/** Login (gancho do Better Auth): só equipe. */
export async function registrarLoginEquipe(userId: string, userAgent: string | null | undefined, agora = new Date()) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { papel: true } });
  if (u?.papel !== 'vendedor' && u?.papel !== 'gestor') return;
  await db.user.update({ where: { id: userId }, data: { ultimoLoginEm: agora } });
  await registrarAcao(userId, 'login', { aparelho: aparelhoDe(userAgent) }, agora);
}

/**
 * Sinal do painel ou do caixa aberto (a cada minuto, e ao esconder a aba): soma o tempo visível à sessão em curso,
 * ou começa outra se o último sinal tem mais de MINUTOS_SESSAO.
 */
export async function registrarPresenca(usuarioId: string, segundos: number, userAgent: string | null, agora = new Date()) {
  const seg = Math.max(0, Math.min(Math.round(segundos), 600));
  const corte = new Date(agora.getTime() - MINUTOS_SESSAO * 60_000);
  const atual = await db.sessaoEquipe.findFirst({ where: { usuarioId, fimEm: { gte: corte } }, orderBy: { fimEm: 'desc' }, select: { id: true } });
  await db.$transaction([
    atual
      ? db.sessaoEquipe.update({ where: { id: atual.id }, data: { fimEm: agora, segundos: { increment: seg } } })
      : db.sessaoEquipe.create({ data: { usuarioId, inicioEm: new Date(agora.getTime() - seg * 1000), fimEm: agora, segundos: seg, aparelho: aparelhoDe(userAgent) } }),
    db.user.update({ where: { id: usuarioId }, data: { ultimoAcessoEm: agora } }),
  ]);
}

/** Retenção: sessões e ações com mais de MESES_RETENCAO_EQUIPE meses saem (chamado pela manutenção diária). */
export async function limparAcompanhamento(agora = new Date()) {
  const corte = new Date(agora);
  corte.setMonth(corte.getMonth() - MESES_RETENCAO_EQUIPE);
  await db.$transaction([db.sessaoEquipe.deleteMany({ where: { fimEm: { lt: corte } } }), db.atividadeEquipe.deleteMany({ where: { criadoEm: { lt: corte } } })]);
}

/** Envios pelo WhatsApp que o navegador conta (o clique no link ou o compartilhar do celular). */
export const esquemaSinal = z.object({
  seg: z.number().int().min(0).max(600).optional(),
  envios: z.array(z.object({
    acao: z.enum(['oferta', 'cupom', 'convite', 'pedido', 'comprovante', 'fechamento', 'contato']),
    telefone: z.string().regex(/^\d{8,13}$/).optional(),
    pedidoId: z.string().max(40).optional(),
    caminho: z.string().max(300).optional(),
  })).max(10).optional(),
});
type Envio = NonNullable<z.infer<typeof esquemaSinal>['envios']>[number];

const TIPO_DO_ENVIO: Record<Envio['acao'], Acao> = { oferta: 'oferta_enviada', cupom: 'cupom_enviado', convite: 'convite_enviado', pedido: 'whatsapp', comprovante: 'whatsapp', fechamento: 'whatsapp', contato: 'whatsapp' };
const TEXTO_DO_ENVIO: Partial<Record<Envio['acao'], string>> = { pedido: 'Pedido atualizado', comprovante: 'Comprovante do caixa', fechamento: 'Fechamento do caixa' };

/** Grava um envio pelo WhatsApp, ligando à cliente (pelo número) e ao pedido quando a pessoa pode vê-los. */
export async function registrarEnvio(u: Usuario, e: Envio, userAgent: string | null, agora = new Date()) {
  const pedido = e.pedidoId ? await db.pedido.findUnique({ where: { id: e.pedidoId }, select: { id: true, codigo: true, vendedorId: true, clienteId: true, nomeCliente: true, total: true } }) : null;
  const pedidoOk = pedido && podeAcessar(u, pedido) ? pedido : null;
  const digitos = e.telefone ? somenteDigitos(e.telefone).slice(-11) : '';
  const cliente = !pedidoOk && digitos.length === 11
    ? await db.cliente.findFirst({ where: { ...escopoVendedor(u), telefone: { in: [formatarTelefone(digitos), digitos] } }, select: { id: true, nome: true } })
    : null;
  const quem = pedidoOk?.nomeCliente ?? cliente?.nome ?? null;
  await registrarAcao(u.id, TIPO_DO_ENVIO[e.acao], {
    clienteId: pedidoOk?.clienteId ?? cliente?.id, pedidoId: pedidoOk?.id, valor: e.acao === 'oferta' ? pedidoOk?.total : null,
    descricao: [TEXTO_DO_ENVIO[e.acao], quem, pedidoOk?.codigo].filter(Boolean).join(' · ') || null,
    aparelho: aparelhoDe(userAgent),
  }, agora);
}
