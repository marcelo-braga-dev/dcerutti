import 'server-only';
import type { Prisma, TipoAtividade } from '@prisma/client';
import { z } from 'zod';
import { db } from './db';
import { catalogo } from './catalogo';
import { lerConfig } from './config';
import { enviarEmail } from './email';
import { aparelhoDe, caminhoValido, classificarCaminho, lerItensSacola, MESES_RETENCAO, MINUTOS_VISITA, type ItemSacolaGuardada } from '@/lib/atividade';
import { filtrarCatalogo } from '@/lib/catalogo';
import { brl } from '@/lib/dinheiro';
import { plural } from '@/lib/pedido';
import { limparAcompanhamento } from './equipe';

/**
 * Histórico do cliente (docs/21-historico-do-cliente.md): grava a navegação da cliente na loja para o vendedor e o gestor.
 * Só clientes com ficha; equipe e visitantes não são registrados. Sem IP (D-18). Nada aqui pode derrubar a loja:
 * quem chama trata o erro.
 */

const ref = z.string().regex(/^[A-Za-z0-9_-]{6,16}$/);
const id = z.number().int().positive();

/** Eventos que o navegador manda (components/loja/rastreador.tsx). Produto, busca e filtro saem do caminho, no servidor. */
export const esquemaEventos = z.array(z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('pagina'), ref, caminho: z.string().refine(caminhoValido) }),
  z.object({ tipo: z.literal('duracao'), ref, seg: z.number().int().min(1).max(3600) }),
  z.object({ tipo: z.literal('tamanho'), varianteId: id }),
  z.object({ tipo: z.literal('sacola'), varianteId: id, delta: z.number().int().min(-20).max(20).refine(n => n !== 0) }),
  z.object({ tipo: z.literal('whatsapp'), caminho: z.string().refine(caminhoValido) }),
  z.object({ tipo: z.literal('carrinho'), itens: z.array(z.object({ varianteId: id, quantidade: z.number().int().min(1).max(20) })).max(60) }),
])).max(40);

export type EventoNavegador = z.infer<typeof esquemaEventos>[number];

/** Mesmo produto, busca ou página aberto de novo nesse tempo (recarregar) não conta outra vez. */
const REPETICAO_MS = 10_000;

/** Cliente da conta logada, ou null quando não há ficha ou o histórico está desligado. */
async function clienteParaRegistrar(userId: string) {
  if (!(await lerConfig()).historico.ligado) return null;
  return db.cliente.findUnique({ where: { userId }, select: { id: true, ultimoAcessoEm: true } });
}

/** Login com senha (hook do Better Auth). Só clientes. */
export async function registrarLogin(userId: string, userAgent: string | null | undefined, agora = new Date()) {
  const cliente = await clienteParaRegistrar(userId);
  if (!cliente) return;
  await db.$transaction([
    db.atividade.create({ data: { clienteId: cliente.id, tipo: 'login', aparelho: aparelhoDe(userAgent), criadoEm: agora } }),
    db.cliente.update({ where: { id: cliente.id }, data: { ultimoLoginEm: agora } }),
  ]);
}

/** Grava um lote de eventos do navegador. Devolve quantos foram gravados. */
export async function registrarEventos(userId: string, eventos: EventoNavegador[], userAgent: string | null, agora = new Date()) {
  const cliente = await clienteParaRegistrar(userId);
  if (!cliente) return 0;
  const clienteId = cliente.id;
  const aparelho = aparelhoDe(userAgent);
  let gravados = 0;

  const recente = (where: Prisma.AtividadeWhereInput) =>
    db.atividade.findFirst({ where: { clienteId, criadoEm: { gte: new Date(agora.getTime() - REPETICAO_MS) }, ...where }, select: { id: true } });
  const criar = async (data: Omit<Prisma.AtividadeUncheckedCreateInput, 'clienteId'>) => {
    await db.atividade.create({ data: { clienteId, aparelho, criadoEm: agora, ...data } });
    gravados++;
  };

  // Primeira página depois de 30 min parada: começa uma visita.
  const primeira = eventos.find(e => e.tipo === 'pagina');
  const novaVisita = !cliente.ultimoAcessoEm || agora.getTime() - cliente.ultimoAcessoEm.getTime() > MINUTOS_VISITA * 60_000;
  if (primeira && novaVisita) await criar({ tipo: 'acesso', caminho: primeira.caminho });

  const variantes = new Map(
    (await db.variante.findMany({
      where: { id: { in: eventos.flatMap(e => ('varianteId' in e ? [e.varianteId] : e.tipo === 'carrinho' ? e.itens.map(i => i.varianteId) : [])) } },
      select: { id: true, tamanho: true, produtoId: true },
    })).map(v => [v.id, v]),
  );

  for (const e of eventos) {
    switch (e.tipo) {
      case 'pagina': {
        const c = classificarCaminho(e.caminho);
        if (c.tipo === 'produto') {
          const lista = await catalogo();
          const p = lista.find(x => x.referencia.toLowerCase() === c.referencia.toLowerCase())
            ?? await db.produto.findUnique({ where: { referencia: c.referencia }, select: { id: true } });
          if (p) {
            if (!(await recente({ tipo: 'produto', produtoId: p.id }))) await criar({ tipo: 'produto', caminho: e.caminho, produtoId: p.id, ref: e.ref, duracaoSeg: 0 });
            break;
          }
        }
        if (await recente({ caminho: e.caminho, tipo: { in: ['pagina', 'busca', 'filtro', 'produto'] } })) break;
        if (c.tipo === 'busca') {
          const resultados = filtrarCatalogo(await catalogo(), { ...c.filtrosCatalogo, pagina: 1 }).total;
          await criar({ tipo: 'busca', caminho: e.caminho, termo: c.termo, dados: { filtros: c.filtros, resultados }, ref: e.ref, duracaoSeg: 0 });
        } else if (c.tipo === 'filtro') {
          await criar({ tipo: 'filtro', caminho: e.caminho, dados: { filtros: c.filtros }, ref: e.ref, duracaoSeg: 0 });
        } else await criar({ tipo: 'pagina', caminho: e.caminho, ref: e.ref, duracaoSeg: 0 });
        break;
      }
      case 'duracao': {
        // Soma o tempo na página aberta nas últimas 6 horas com essa referência.
        const r = await db.atividade.updateMany({
          where: { clienteId, ref: e.ref, criadoEm: { gte: new Date(agora.getTime() - 6 * 3600_000) } },
          data: { duracaoSeg: { increment: e.seg } },
        });
        gravados += r.count;
        break;
      }
      case 'tamanho': {
        const v = variantes.get(e.varianteId);
        if (v && !(await recente({ tipo: 'tamanho', varianteId: v.id }))) await criar({ tipo: 'tamanho', produtoId: v.produtoId, varianteId: v.id, termo: v.tamanho });
        break;
      }
      case 'sacola': {
        const v = variantes.get(e.varianteId);
        if (v) await criar({ tipo: 'sacola', produtoId: v.produtoId, varianteId: v.id, termo: v.tamanho, dados: { delta: e.delta } });
        break;
      }
      case 'whatsapp':
        await criar({ tipo: 'whatsapp', caminho: e.caminho });
        break;
      case 'carrinho':
        await guardarSacola(clienteId, e.itens.filter(i => variantes.has(i.varianteId)));
        gravados++;
        break;
    }
  }

  // Último acesso: no máximo uma escrita por minuto.
  if (!cliente.ultimoAcessoEm || agora.getTime() - cliente.ultimoAcessoEm.getTime() > 60_000)
    await db.cliente.update({ where: { id: clienteId }, data: { ultimoAcessoEm: agora } });
  return gravados;
}

/** Cópia da sacola do navegador. Vazia, apaga. Mudou, o aviso de sacola parada pode sair de novo. */
export async function guardarSacola(clienteId: string, itens: ItemSacolaGuardada[]) {
  if (!itens.length) {
    await db.sacolaCliente.deleteMany({ where: { clienteId } });
    return;
  }
  const json = itens.map(i => ({ varianteId: i.varianteId, quantidade: i.quantidade }));
  await db.sacolaCliente.upsert({ where: { clienteId }, create: { clienteId, itens: json }, update: { itens: json, avisadoEm: null } });
}

/** Tentativa de cupom na sacola. A prévia roda de novo a cada mudança: o mesmo código só conta uma vez a cada 30 min. */
export async function registrarCupom(clienteId: string, codigo: string, resultado: { ok: boolean; erro?: string }, agora = new Date()) {
  if (!(await lerConfig()).historico.ligado) return;
  const termo = codigo.trim().toUpperCase().slice(0, 100);
  if (!termo) return;
  const ja = await db.atividade.findFirst({ where: { clienteId, tipo: 'cupom', termo, criadoEm: { gte: new Date(agora.getTime() - 30 * 60_000) } }, select: { id: true } });
  if (ja) return;
  await db.atividade.create({ data: { clienteId, tipo: 'cupom', termo, dados: resultado.ok ? { ok: true } : { ok: false, erro: resultado.erro ?? '' }, criadoEm: agora } });
}

/** LGPD: apaga o histórico, a sacola guardada e os favoritos da cliente (exclusão da conta). */
export function apagarHistorico(clienteId: string) {
  return [db.atividade.deleteMany({ where: { clienteId } }), db.sacolaCliente.deleteMany({ where: { clienteId } }), db.favorito.deleteMany({ where: { clienteId } })];
}

const site = () => (process.env.NEXT_PUBLIC_SITE_URL || process.env.BETTER_AUTH_URL || '').replace(/\/$/, '');

/**
 * Manutenção: apaga o histórico com mais de 12 meses e avisa o vendedor das sacolas paradas (D-18).
 * Roda sozinha no máximo uma vez por hora (talvezManutencao) e pelo cron (scripts/manutencao-historico-cliente.ts).
 */
export async function manutencaoHistorico(agora = new Date()) {
  const limite = new Date(agora);
  limite.setMonth(limite.getMonth() - MESES_RETENCAO);
  const apagados = (await db.atividade.deleteMany({ where: { criadoEm: { lt: limite } } })).count;
  const avisos = await avisarSacolasParadas(agora);
  return { apagados, avisos };
}

/** Sacolas com peças, paradas há `horasSacola` (até 7 dias), sem pedido depois e ainda não avisadas. */
export async function avisarSacolasParadas(agora = new Date()) {
  const cfg = (await lerConfig()).historico;
  if (!cfg.ligado || !cfg.avisarSacola) return 0;
  const sacolas = await db.sacolaCliente.findMany({
    where: { avisadoEm: null, atualizadoEm: { lte: new Date(agora.getTime() - cfg.horasSacola * 3600_000), gte: new Date(agora.getTime() - 7 * 86_400_000) } },
    include: { cliente: { select: { id: true, nome: true, telefone: true, vendedor: { select: { email: true, ativo: true } } } } },
    take: 100,
  });
  let enviados = 0;
  for (const s of sacolas) {
    // Marca antes de enviar: com dois processos, um só avisa.
    const marcado = await db.sacolaCliente.updateMany({ where: { clienteId: s.clienteId, avisadoEm: null, atualizadoEm: s.atualizadoEm }, data: { avisadoEm: agora } });
    if (!marcado.count) continue;
    const enviouPedido = await db.pedido.count({ where: { clienteId: s.clienteId, criadoEm: { gte: s.atualizadoEm } } });
    const itens = lerItensSacola(s.itens);
    if (enviouPedido || !itens.length || !s.cliente.telefone) continue;
    const variantes = await db.variante.findMany({
      where: { id: { in: itens.map(i => i.varianteId) } },
      select: { id: true, tamanho: true, produto: { select: { nome: true, referencia: true, preco: true } } },
    });
    const porId = new Map(variantes.map(v => [v.id, v]));
    const linhas = itens.flatMap(i => {
      const v = porId.get(i.varianteId);
      return v ? [`- ${i.quantidade}× ${v.produto.nome} (Ref. ${v.produto.referencia}, tam. ${v.tamanho}) · ${brl(Number(v.produto.preco) * i.quantidade)}`] : [];
    });
    if (!linhas.length) continue;
    const total = itens.reduce((a, i) => a + Number(porId.get(i.varianteId)?.produto.preco ?? 0) * i.quantidade, 0);
    const para = s.cliente.vendedor.ativo
      ? [s.cliente.vendedor.email]
      : (await db.user.findMany({ where: { papel: 'gestor', ativo: true }, select: { email: true } })).map(g => g.email);
    const pecas = itens.reduce((a, i) => a + i.quantidade, 0);
    const texto = [
      `${s.cliente.nome} separou ${plural(pecas, 'peça', 'peças')} na sacola (${brl(total)}) e não enviou o pedido:`,
      '',
      ...linhas,
      '',
      `Ficha e histórico: ${site()}/painel/clientes/${s.clienteId}`,
      '',
      'Que tal chamar a cliente no WhatsApp para ajudar a fechar?',
    ].join('\n');
    try {
      for (const email of para) await enviarEmail({ para: email, assunto: `Sacola parada · ${s.cliente.nome}`, texto });
      enviados++;
    } catch (e) {
      console.error('Falha ao avisar a sacola parada de', s.clienteId, e);
    }
  }
  return enviados;
}

const g = globalThis as unknown as { __manutencaoHistorico?: number };

/** Chamada depois das respostas da loja e do painel: roda a manutenção se a última foi há mais de uma hora. */
export async function talvezManutencao(agora = Date.now()) {
  if (g.__manutencaoHistorico && agora - g.__manutencaoHistorico < 3600_000) return;
  g.__manutencaoHistorico = agora;
  try {
    await manutencaoHistorico(new Date(agora));
  } catch (e) {
    console.error('Falha na manutenção do histórico', e);
  }
  // D-26: retenção do acompanhamento da equipe (não depende do histórico das clientes estar ligado).
  await limparAcompanhamento(new Date(agora)).catch(e => console.error('Falha na limpeza do acompanhamento da equipe', e));
}

export type { TipoAtividade };
