import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from './db';
import { enviarEmail } from './email';
import { lerConfig } from './config';
import { diaDe, intervaloDoMes, mesDe } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { lerPreferencias, MESES_RETENCAO_NOTIFICACOES, quer, type TipoNotificacao } from '@/lib/notificacoes';
import { expiraEm } from '@/lib/pedido';

/**
 * Notificações da equipe (D-28): grava no painel (sino e página) e manda e-mail a quem quer, conforme as preferências
 * de cada um. Nunca derruba quem chama: os erros só vão para o log.
 */

export type NovaNotificacao = {
  tipo: TipoNotificacao;
  titulo: string;
  texto?: string | null;
  link?: string | null;
  /** Mesma chave para a mesma pessoa não grava de novo. */
  chave?: string | null;
  /** Conteúdo do e-mail; só vai para quem está em `emailPara` e quer este tipo por e-mail. */
  email?: { assunto: string; texto: string };
};

/** Avisa estas pessoas. `emailPara`: quem pode receber por e-mail (padrão: todos os destinatários). */
export async function notificar(usuarioIds: string[], n: NovaNotificacao, emailPara: string[] = usuarioIds) {
  const ids = [...new Set(usuarioIds.filter(Boolean))];
  if (!ids.length) return;
  try {
    const pessoas = await db.user.findMany({ where: { id: { in: ids }, ativo: true }, select: { id: true, email: true, preferenciasNotificacao: true } });
    const painel = pessoas.filter(p => quer(lerPreferencias(p.preferenciasNotificacao), n.tipo, 'painel'));
    if (painel.length)
      await db.notificacao.createMany({
        data: painel.map(p => ({ usuarioId: p.id, tipo: n.tipo, titulo: n.titulo.slice(0, 140), texto: n.texto?.slice(0, 300) ?? null, link: n.link ?? null, chave: n.chave ?? null })),
        skipDuplicates: true,
      });
    if (n.email) {
      for (const p of pessoas.filter(x => emailPara.includes(x.id) && quer(lerPreferencias(x.preferenciasNotificacao), n.tipo, 'email')))
        await enviarEmail({ para: p.email, assunto: n.email.assunto, texto: n.email.texto }).catch(e => console.error('Falha no e-mail da notificação', n.tipo, e));
    }
  } catch (e) {
    console.error('Falha ao notificar', n.tipo, e);
  }
}

export const gestoresAtivos = async () => (await db.user.findMany({ where: { papel: 'gestor', ativo: true }, select: { id: true } })).map(g => g.id);

/** Quem cuida da cliente: o vendedor dela, ou os gestores se ele estiver inativo (RN-03). */
export async function responsaveis(vendedorId: string) {
  const v = await db.user.findUnique({ where: { id: vendedorId }, select: { id: true, ativo: true } });
  return v?.ativo ? [v.id] : gestoresAtivos();
}

// ---------- Verificações periódicas (manutenção a cada hora) ----------

/** Pedidos em aberto que vencem nas próximas 24 horas: avisa o vendedor uma vez por pedido. */
async function prazosVencendo(agora: Date) {
  const dias = (await lerConfig()).diasExpiracao;
  if (!dias) return;
  const limite = new Date(agora.getTime() - (dias - 1) * 86_400_000);
  const pedidos = await db.pedido.findMany({
    where: { status: 'pendente', criadoEm: { lte: limite, gt: new Date(agora.getTime() - dias * 86_400_000) } },
    select: { id: true, codigo: true, nomeCliente: true, vendedorId: true, criadoEm: true },
    take: 200,
  });
  for (const p of pedidos) {
    const fim = expiraEm(p.criadoEm, dias)!;
    await notificar(await responsaveis(p.vendedorId), {
      tipo: 'prazo_vencendo', titulo: `${p.codigo} vence ${fim.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', hour: '2-digit', minute: '2-digit' })}`,
      texto: `${p.nomeCliente}: confirme ou cancele antes de vencer.`, link: `/painel/pedidos/${p.id}`, chave: `prazo:${p.codigo}`,
    });
  }
}

/** Tamanhos que zeraram o estoque por venda nas últimas 2 horas: avisa os gestores uma vez por tamanho e dia. */
async function pecasEsgotadas(agora: Date) {
  const vendas = await db.movimentoEstoque.findMany({
    where: { motivo: 'venda', criadoEm: { gte: new Date(agora.getTime() - 2 * 3600_000) } },
    select: { varianteId: true }, distinct: ['varianteId'], take: 200,
  });
  if (!vendas.length) return;
  const zeradas = await db.variante.findMany({
    where: { id: { in: vendas.map(v => v.varianteId) }, produto: { ativo: true } },
    select: { id: true, tamanho: true, estoque: true, reservado: true, produto: { select: { id: true, nome: true, referencia: true } } },
  });
  const gestores = await gestoresAtivos();
  for (const v of zeradas.filter(x => x.estoque - x.reservado <= 0))
    await notificar(gestores, {
      tipo: 'peca_esgotada', titulo: `Esgotou: ${v.produto.nome} · tam. ${v.tamanho}`, texto: `Ref. ${v.produto.referencia}. Reponha ou desative o tamanho.`,
      link: `/painel/produtos/${v.produto.id}`, chave: `esgotou:${v.id}:${diaDe(agora)}`,
    });
}

/** Vendedor que alcançou a meta do mês: avisa ele e os gestores uma vez por mês. */
async function metasBatidas(agora: Date) {
  const mes = mesDe(agora);
  const [vendedores, vendido] = await Promise.all([
    db.user.findMany({ where: { papel: 'vendedor', ativo: true }, select: { id: true, name: true } }),
    db.venda.groupBy({ by: ['vendedorId'], where: { data: intervaloDoMes(mes) }, _sum: { valor: true } }),
  ]);
  const total = new Map(vendido.map(v => [v.vendedorId, Number(v._sum.valor ?? 0)]));
  const metas = await db.meta.findMany({ where: { vendedorId: { in: vendedores.map(v => v.id) }, mes: { lte: mes } }, orderBy: { mes: 'desc' } });
  const metaDe = new Map<string, number>();
  for (const m of metas) if (!metaDe.has(m.vendedorId)) metaDe.set(m.vendedorId, Number(m.valor));
  const gestores = await gestoresAtivos();
  for (const v of vendedores) {
    const meta = metaDe.get(v.id) ?? 0, feito = total.get(v.id) ?? 0;
    if (meta > 0 && feito >= meta)
      await notificar([v.id, ...gestores], {
        tipo: 'meta_batida', titulo: `${v.name.split(' ')[0]} bateu a meta do mês! 🎉`, texto: `${brl(feito)} de ${brl(meta)}.`,
        link: `/painel/vendedores/${v.id}`, chave: `meta:${v.id}:${mes}`,
      });
  }
}

/** Sugestões enviadas que vencem nas próximas 24 horas sem virar pedido: avisa quem enviou, uma vez por sugestão. */
async function sugestoesVencendo(agora: Date) {
  const lista = await db.sugestao.findMany({
    where: { status: { in: ['enviada', 'vista', 'respondida'] }, enviadaEm: { not: null }, validaAte: { gt: agora, lte: new Date(agora.getTime() + 86_400_000) } },
    select: { id: true, codigo: true, vendedorId: true, vistaEm: true, cliente: { select: { nome: true } } }, take: 200,
  });
  for (const s of lista)
    await notificar(await responsaveis(s.vendedorId), {
      tipo: 'carrinho_vencendo', titulo: `Sugestão ${s.codigo} de ${s.cliente.nome} vence nas próximas 24 h`,
      texto: s.vistaEm ? 'Ela viu e ainda não pediu: vale um lembrete.' : 'Ela ainda não abriu: vale um lembrete ou renovar.',
      link: `/painel/sugestoes/${s.id}`, chave: `carrinho-vence:${s.codigo}`,
    });
}

/** Chamado pela manutenção (a cada hora, no máximo): verificações e a retenção de 6 meses. */
export async function verificarNotificacoes(agora = new Date()) {
  for (const f of [prazosVencendo, pecasEsgotadas, metasBatidas, sugestoesVencendo]) await f(agora).catch(e => console.error('Falha na verificação de notificações', f.name, e));
  const corte = new Date(agora);
  corte.setMonth(corte.getMonth() - MESES_RETENCAO_NOTIFICACOES);
  await db.notificacao.deleteMany({ where: { criadaEm: { lt: corte } } }).catch(() => {});
}

// ---------- Leitura (sino e página) ----------

export async function resumoNotificacoes(usuarioId: string) {
  const [naoLidas, ultimas] = await Promise.all([
    db.notificacao.count({ where: { usuarioId, lidaEm: null } }),
    db.notificacao.findMany({ where: { usuarioId }, orderBy: [{ criadaEm: 'desc' }, { id: 'desc' }], take: 12 }),
  ]);
  return { naoLidas, ultimas: ultimas.map(n => ({ ...n, id: String(n.id) })) };
}

export async function listarNotificacoes(usuarioId: string, f: { tipo?: TipoNotificacao | null; naoLidas?: boolean; pagina: number }) {
  const where: Prisma.NotificacaoWhereInput = { usuarioId, ...(f.tipo ? { tipo: f.tipo } : {}), ...(f.naoLidas ? { lidaEm: null } : {}) };
  const [lista, total, naoLidas] = await Promise.all([
    db.notificacao.findMany({ where, orderBy: [{ criadaEm: 'desc' }, { id: 'desc' }], take: 50 * f.pagina }),
    db.notificacao.count({ where }),
    db.notificacao.count({ where: { usuarioId, lidaEm: null } }),
  ]);
  return { lista: lista.map(n => ({ ...n, id: String(n.id) })), total, naoLidas };
}

export async function marcarLidas(usuarioId: string, id?: string) {
  await db.notificacao.updateMany({ where: { usuarioId, lidaEm: null, ...(id ? { id: BigInt(id) } : {}) }, data: { lidaEm: new Date() } });
}

export async function preferenciasDe(usuarioId: string) {
  const u = await db.user.findUnique({ where: { id: usuarioId }, select: { preferenciasNotificacao: true } });
  return lerPreferencias(u?.preferenciasNotificacao);
}

export async function salvarPreferencias(usuarioId: string, prefs: { painel: TipoNotificacao[]; email: TipoNotificacao[] }) {
  await db.user.update({ where: { id: usuarioId }, data: { preferenciasNotificacao: lerPreferencias(prefs) } });
}
