import 'server-only';
import { cache } from 'react';
import { db } from '../db';
import { catalogo } from '../catalogo';
import { lerConfig } from '../config';
import { podeAtender, type Usuario } from '../permissoes';
import { conferirVitrine, ofertaVale, type TipoVitrine } from '@/lib/vitrines';
import { precoQueVale } from '@/lib/sugestoes';
import { contatoDe, VENDEDOR_CONTATO } from '@/lib/numeros';
import { descontoPct } from '@/lib/dinheiro';

/** Vitrines (docs/26). As leituras públicas usam lista branca de campos: nunca custo, estoque exato ou dados de cliente. */

export const vitrinesLigadas = async () => (await lerConfig()).vitrines.ligadas;

export async function listarVitrines(u: Usuario, f: { status?: string | null }) {
  const escopo = u.papel === 'gestor' ? {} : { responsavelId: u.id };
  const [lista, porStatus] = await Promise.all([
    db.vitrine.findMany({
      where: { ...escopo, ...(f.status ? { status: f.status as never } : { NOT: { status: 'arquivada' } }) },
      orderBy: [{ criadoEm: 'desc' }], take: 100,
      select: {
        id: true, slug: true, tipo: true, status: true, titulo: true, inicioPrevisto: true, ofertaAte: true, visitas: true, criadoEm: true,
        responsavel: { select: { name: true } }, _count: { select: { pecas: true, atendimentos: true, pedidos: true } },
        pecas: { orderBy: [{ ordem: 'asc' }, { id: 'asc' }], take: 6, select: { produtoId: true } },
      },
    }),
    db.vitrine.groupBy({ by: ['status'], where: escopo, _count: true }),
  ]);
  // Capa (até 3 fotos das peças) e o vendido de cada uma, numa consulta só.
  const fotos = new Map((await catalogo()).map(p => [p.id, p.imagens[0] ?? null]));
  const vendido = new Map((await db.pedido.groupBy({ by: ['vitrineId'], where: { vitrineId: { in: lista.map(v => v.id) }, status: 'confirmado' }, _sum: { total: true } }))
    .map(g => [g.vitrineId, Number(g._sum.total ?? 0)]));
  const contagem = Object.fromEntries(porStatus.map(g => [g.status, g._count])) as Record<string, number>;
  return {
    lista: lista.map(v => ({ ...v, imagens: v.pecas.map(p => fotos.get(p.produtoId)).filter((x): x is string => !!x).slice(0, 3), vendido: vendido.get(v.id) ?? 0 })),
    contagem,
    emUso: Object.entries(contagem).filter(([st]) => st !== 'arquivada').reduce((a, [, n]) => a + n, 0),
  };
}

const pouco = 2;

/** A vitrine no painel: dados, peças com o que há no catálogo agora e a conferência. Sem permissão, `null`. */
export async function vitrineParaEdicao(u: Usuario, id: string) {
  const v = await db.vitrine.findUnique({ where: { id }, include: { pecas: { orderBy: [{ ordem: 'asc' }, { id: 'asc' }], select: { id: true, produtoId: true, precoOferta: true } }, responsavel: { select: { name: true } } } });
  if (!v || !podeAtender(u, { responsavelId: v.responsavelId })) return null;
  const lista = await catalogo();
  const porId = new Map(lista.map(p => [p.id, p]));
  const faltantes = v.pecas.filter(p => !porId.has(p.produtoId)).map(p => p.produtoId);
  const fora = new Map((await db.produto.findMany({ where: { id: { in: faltantes } }, select: { id: true, nome: true, preco: true } })).map(p => [p.id, p]));
  const pecas = v.pecas.map(p => {
    const c = porId.get(p.produtoId);
    return {
      id: p.id, produtoId: p.produtoId, ativa: !!c, nome: c?.nome ?? fora.get(p.produtoId)?.nome ?? 'Peça removida', referencia: c?.referencia ?? '', imagem: c?.imagens[0] ?? null,
      preco: c?.preco ?? Number(fora.get(p.produtoId)?.preco ?? 0), oferta: p.precoOferta == null ? null : Number(p.precoOferta),
      imagens: c?.imagens.length ?? 0, videos: c?.videos.length ?? 0, tamanhos: c?.variantes.filter(x => x.disponivel > 0).map(x => x.tamanho) ?? [],
    };
  });
  return {
    ...v, pecas,
    avisos: conferirVitrine({ tipo: v.tipo as TipoVitrine, urlInstagram: v.urlInstagram, inicioPrevisto: v.inicioPrevisto, legenda: v.legenda, pecas: pecas.map(p => ({ nome: p.nome, imagens: p.imagens, videos: p.videos, tamanhos: p.tamanhos.length, ativa: p.ativa })) }),
  };
}

/** Resultado da vitrine. O valor vendido vem da tabela `venda`, a mesma das metas. */
export async function resultadoDaVitrine(u: Usuario, id: string) {
  const v = await db.vitrine.findUnique({ where: { id }, select: { id: true, visitas: true, responsavelId: true, pecas: { select: { produtoId: true, produto: { select: { nome: true } } } } } });
  if (!v || !podeAtender(u, { responsavelId: v.responsavelId })) return null;
  const [atendimentos, ganhos, perdidos, pedidos, abertos, vendas, pedidas, vendidas] = await Promise.all([
    db.atendimento.count({ where: { vitrineId: id } }),
    db.atendimento.count({ where: { vitrineId: id, etapa: 'ganho' } }),
    db.atendimento.count({ where: { vitrineId: id, etapa: 'perdido' } }),
    db.pedido.count({ where: { vitrineId: id } }),
    db.pedido.aggregate({ where: { vitrineId: id, status: 'pendente' }, _sum: { total: true } }),
    db.venda.aggregate({ where: { pedido: { vitrineId: id } }, _sum: { valor: true }, _count: true }),
    db.atendimentoItem.groupBy({ by: ['produtoId'], where: { atendimento: { vitrineId: id } }, _sum: { quantidade: true } }),
    db.pedidoItem.groupBy({ by: ['produtoId'], where: { situacao: 'vendido', pedido: { vitrineId: id } }, _sum: { quantidade: true } }),
  ]);
  const pedidasPor = new Map(pedidas.map(p => [p.produtoId, p._sum.quantidade ?? 0]));
  const vendidasPor = new Map(vendidas.map(p => [p.produtoId, p._sum.quantidade ?? 0]));
  return {
    visitas: v.visitas, atendimentos, ganhos, perdidos, pedidos, vendas: vendas._count,
    valorAberto: Number(abertos._sum.total ?? 0), valorVendido: Number(vendas._sum.valor ?? 0),
    conversao: atendimentos ? Math.round((ganhos / atendimentos) * 100) : 0,
    pecas: v.pecas.map(p => ({ produtoId: p.produtoId, nome: p.produto.nome, pedidas: pedidasPor.get(p.produtoId) ?? 0, vendidas: vendidasPor.get(p.produtoId) ?? 0 })).sort((a, b) => b.pedidas - a.pedidas || b.vendidas - a.vendidas),
  };
}

// ---------- Público ----------

/** A vitrine como o público vê. Rascunho só a equipe abre, para conferir; arquivada não abre. */
export const vitrinePublica = cache(async (slug: string, equipe = false) => {
  const v = await db.vitrine.findUnique({
    where: { slug },
    select: {
      id: true, slug: true, tipo: true, status: true, titulo: true, descricao: true, urlInstagram: true, inicioPrevisto: true, ofertaAte: true, responsavelId: true,
      pecas: { orderBy: [{ ordem: 'asc' }, { id: 'asc' }], select: { produtoId: true, precoOferta: true } },
      responsavel: { select: VENDEDOR_CONTATO },
    },
  });
  if (!v || v.status === 'arquivada' || (v.status === 'rascunho' && !equipe)) return null;
  const [lista, cfg, pedidosRecebidos] = await Promise.all([catalogo(), lerConfig(), db.atendimento.count({ where: { vitrineId: v.id } })]);
  const porId = new Map(lista.map(p => [p.id, p]));
  const vale = ofertaVale(v);
  const contato = contatoDe(v.responsavel, cfg.whatsappLoja);
  return {
    id: v.id, slug: v.slug, tipo: v.tipo as TipoVitrine, status: v.status, titulo: v.titulo, descricao: v.descricao, urlInstagram: v.urlInstagram,
    inicioPrevisto: v.inicioPrevisto, ofertaAte: vale ? v.ofertaAte : null, responsavelId: v.responsavelId,
    contato: { telefone: contato.telefone, nome: contato.nome?.split(' ')[0] ?? null },
    /** Prova social verdadeira: quantos pedidos a vitrine já recebeu (a página só mostra a partir de 3). */
    pedidosRecebidos,
    pecas: v.pecas.flatMap(x => {
      const p = porId.get(x.produtoId);
      if (!p) return [];
      const preco = precoQueVale(p.preco, x.precoOferta == null ? null : Number(x.precoOferta), !vale);
      const precoCheio = Math.max(p.precoCheio, p.preco);
      const variantes = p.variantes.filter(t => t.disponivel > 0).map(t => ({ id: t.id, tamanho: t.tamanho, ultimas: t.disponivel <= pouco }));
      return [{
        produtoId: p.id, nome: p.nome, marca: p.marca, cor: p.corNome ?? p.cor, categoria: p.categoria,
        // Até 6 fotos: o cartão desliza entre elas e os detalhes mostram todas.
        imagem: p.imagens[0] ?? null, imagens: p.imagens.slice(0, 6),
        // Detalhes da peça (D-36): o que a cliente quer saber antes de pedir.
        descricao: p.descricao, composicao: p.composicao, destaques: p.destaques.slice(0, 6),
        video: p.videos[0] ? { url: p.videos[0].url, capa: p.videos[0].capa } : null,
        preco, precoCheio, desconto: descontoPct(preco, precoCheio), especial: preco < p.preco,
        variantes,
        // Todos os tamanhos do modelo (os esgotados aparecem riscados), na ordem do catálogo.
        tamanhos: p.variantes.map(t => ({ tamanho: t.tamanho, livre: t.disponivel > 0 })),
        ultimas: variantes.length > 0 && variantes.every(t => t.ultimas),
      }];
    }),
  };
});

export type VitrinePublica = NonNullable<Awaited<ReturnType<typeof vitrinePublica>>>;

/** A página da bio: a live no ar ou a próxima, e as publicações ativas. */
export async function vitrinesPublicas() {
  const lista = await db.vitrine.findMany({
    where: { status: { in: ['agendada', 'no_ar', 'publicada'] } }, orderBy: [{ inicioPrevisto: 'asc' }, { criadoEm: 'desc' }], take: 50,
    select: {
      slug: true, tipo: true, status: true, titulo: true, descricao: true, inicioPrevisto: true, urlInstagram: true, ofertaAte: true,
      pecas: { orderBy: [{ ordem: 'asc' }, { id: 'asc' }], select: { produtoId: true, precoOferta: true } },
    },
  });
  const porId = new Map((await catalogo()).map(p => [p.id, p]));
  const comFoto = lista.map(v => {
    const pecas = v.pecas.flatMap(p => { const c = porId.get(p.produtoId); return c ? [{ c, oferta: p.precoOferta == null ? null : Number(p.precoOferta) }] : []; });
    const vale = ofertaVale(v);
    const precos = pecas.map(({ c, oferta }) => ({ preco: precoQueVale(c.preco, oferta, !vale), cheio: Math.max(c.precoCheio, c.preco) }));
    const fotos = pecas.flatMap(({ c }) => c.imagens.slice(0, 1));
    return {
      slug: v.slug, tipo: v.tipo as TipoVitrine, status: v.status, titulo: v.titulo, descricao: v.descricao, inicioPrevisto: v.inicioPrevisto, urlInstagram: v.urlInstagram,
      ofertaAte: vale ? v.ofertaAte : null, pecas: pecas.length, imagem: fotos[0] ?? null, imagens: fotos.slice(0, 3),
      aPartirDe: precos.length ? Math.min(...precos.map(p => p.preco)) : null,
      descontoMax: precos.reduce((m, p) => Math.max(m, descontoPct(p.preco, p.cheio)), 0),
    };
  }).filter(v => v.pecas > 0);
  return {
    noAr: comFoto.find(v => v.status === 'no_ar') ?? null,
    proximas: comFoto.filter(v => v.status === 'agendada'),
    publicadas: comFoto.filter(v => v.status === 'publicada'),
  };
}

/** Para onde /live leva: a live no ar; senão, a próxima agendada; senão, /vitrines. */
export async function destinoDaLive() {
  const v = (await db.vitrine.findFirst({ where: { tipo: 'live', status: 'no_ar' }, select: { slug: true } }))
    ?? (await db.vitrine.findFirst({ where: { tipo: 'live', status: 'agendada' }, orderBy: { inicioPrevisto: 'asc' }, select: { slug: true } }));
  return v ? `/vitrine/${encodeURIComponent(v.slug)}` : '/vitrines';
}
