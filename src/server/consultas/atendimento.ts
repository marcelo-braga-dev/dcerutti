import 'server-only';
import type { EtapaAtendimento, Prisma } from '@prisma/client';
import { db } from '../db';
import { lerConfig } from '../config';
import { listarSugestoes } from '../sugestoes';
import { escopoAtendimento, escopoVendedor, podeAcessar, podeAtender, type Usuario } from '../permissoes';
import { interessadosAgora } from './navegacao';
import { ATENCAO, precoQueVale, type Atencao } from '@/lib/sugestoes';
import { ofertaVale } from '@/lib/vitrines';
import { diaDe, fimDoDia } from '@/lib/datas';

/** Atendimento online (docs/26): leituras com o escopo de quem está vendo. */

const LIMITE_POR_GRUPO = 30;

const CAMPOS_LISTA = {
  id: true, codigo: true, canal: true, etapa: true, proximoContatoEm: true, criadoEm: true, ultimoContatoEm: true, primeiroContatoEm: true, fechadoEm: true, motivoPerda: true,
  contatoNome: true, contatoTelefone: true, contatoInstagram: true, responsavelId: true, pedidoId: true,
  cliente: { select: { id: true, nome: true, telefone: true, instagram: true } },
  responsavel: { select: { name: true } },
  vitrine: { select: { id: true, titulo: true } },
} satisfies Prisma.AtendimentoSelect;

type Linha = Prisma.AtendimentoGetPayload<{ select: typeof CAMPOS_LISTA }>;

/** O contato como a tela mostra: da ficha, se houver; senão, o que foi digitado. */
const comContato = <T extends Linha>(a: T) => ({
  ...a,
  nome: a.cliente?.nome ?? a.contatoNome ?? 'Sem nome',
  telefone: a.cliente?.telefone || a.contatoTelefone || null,
  instagram: a.cliente?.instagram ?? a.contatoInstagram ?? null,
});

export type AtendimentoDaLista = ReturnType<typeof comContato<Linha>>;

const whereNovos = (u: Usuario): Prisma.AtendimentoWhereInput => ({ ...escopoAtendimento(u), fechadoEm: null, etapa: 'novo', primeiroContatoEm: null });
const whereRetornos = (u: Usuario, agora: Date): Prisma.AtendimentoWhereInput => ({
  ...escopoAtendimento(u), fechadoEm: null, NOT: { etapa: 'novo', primeiroContatoEm: null }, proximoContatoEm: { lte: fimDoDia(diaDe(agora)) },
});

/** Pós-venda que venceu, da carteira de quem vê. Oferta só para quem aceitou, conferido agora: ela pode ter mudado de ideia. */
const wherePosVenda = (u: Usuario, agora: Date): Prisma.PosVendaContatoWhereInput => ({
  feitoEm: null, venceEm: { lte: fimDoDia(diaDe(agora)) },
  cliente: { ...escopoVendedor(u), NOT: { telefone: '' } },
  OR: [{ tipo: { in: ['entrega', 'satisfacao'] } }, { cliente: { aceitaOfertasEm: { not: null }, descadastradaEm: null } }],
});

/** Desligado nas Configurações, as páginas de atendimento não existem. */
export const atendimentoLigado = async () => (await lerConfig()).atendimento.ligado;

/** O número no menu: novos e retornos de hoje. */
export async function contarFila(u: Usuario, agora = new Date()) {
  const [novos, retornos, posVenda] = await Promise.all([db.atendimento.count({ where: whereNovos(u) }), db.atendimento.count({ where: whereRetornos(u, agora) }), db.posVendaContato.count({ where: wherePosVenda(u, agora) })]);
  return novos + retornos + posVenda;
}

/** A fila "Hoje": em ordem de urgência. Junta as fontes na hora, sem gravar uma cópia. */
export async function filaDeHoje(u: Usuario, agora = new Date()) {
  const cfg = await lerConfig();
  const [novos, retornos, pedidos, interessados, sugestoes, posVenda] = await Promise.all([
    db.atendimento.findMany({ where: whereNovos(u), select: CAMPOS_LISTA, orderBy: { criadoEm: 'asc' }, take: LIMITE_POR_GRUPO }),
    db.atendimento.findMany({ where: whereRetornos(u, agora), select: CAMPOS_LISTA, orderBy: { proximoContatoEm: 'asc' }, take: LIMITE_POR_GRUPO }),
    db.pedido.findMany({
      where: { ...escopoVendedor(u), status: 'pendente', origem: { not: 'balcao' } }, orderBy: { criadoEm: 'asc' }, take: LIMITE_POR_GRUPO,
      select: { id: true, codigo: true, tipo: true, nomeCliente: true, telefoneCliente: true, total: true, criadoEm: true, pagamentoSituacao: true, vendedor: { select: { name: true } } },
    }),
    cfg.historico.ligado ? interessadosAgora(u, agora) : Promise.resolve([]),
    listarSugestoes(u, { pagina: 1 }),
    db.posVendaContato.findMany({
      where: wherePosVenda(u, agora), orderBy: { venceEm: 'asc' }, take: LIMITE_POR_GRUPO,
      select: { id: true, tipo: true, venceEm: true, pedidoId: true, cliente: { select: { id: true, nome: true, telefone: true, vendedor: { select: { name: true } } } }, pedido: { select: { codigo: true } } },
    }),
  ]);
  return {
    novos: novos.map(comContato), retornos: retornos.map(comContato),
    pedidos: pedidos.map(p => ({ ...p, total: Number(p.total) })), interessados, posVenda,
    sugestoes: sugestoes.atencao.map(s => ({ id: s.id, codigo: s.codigo, titulo: s.titulo, cliente: s.cliente.nome, telefone: s.cliente.telefone, motivo: s.atencao ? ATENCAO[s.atencao as Atencao] : '' })),
  };
}

export const ATENDIMENTOS_POR_PAGINA = 40;

export type FiltroAtendimentos = { vitrine?: string | null; etapa?: string | null; canal?: string | null; vendedor?: string | null; q?: string | null; pagina: number };

export async function listarAtendimentos(u: Usuario, f: FiltroAtendimentos) {
  const q = f.q?.trim().replace(/^@/, '');
  const base: Prisma.AtendimentoWhereInput = {
    ...escopoAtendimento(u),
    ...(u.papel === 'gestor' && f.vendedor ? { responsavelId: f.vendedor === 'nenhum' ? null : f.vendedor } : {}),
    ...(f.canal ? { canal: f.canal as never } : {}),
    ...(f.vitrine ? { vitrineId: f.vitrine } : {}),
    ...(q ? { OR: [{ codigo: { contains: q } }, { contatoNome: { contains: q } }, { contatoTelefone: { contains: q } }, { contatoInstagram: { contains: q } }, { cliente: { nome: { contains: q } } }, { cliente: { telefone: { contains: q } } }, { cliente: { instagram: { contains: q } } }] } : {}),
  };
  const where = { ...base, ...(f.etapa ? { etapa: f.etapa as EtapaAtendimento } : {}) };
  const [lista, total, contagem] = await Promise.all([
    db.atendimento.findMany({ where, select: CAMPOS_LISTA, orderBy: [{ fechadoEm: { sort: 'asc', nulls: 'first' } }, { proximoContatoEm: { sort: 'asc', nulls: 'last' } }, { criadoEm: 'desc' }], take: ATENDIMENTOS_POR_PAGINA * f.pagina }),
    db.atendimento.count({ where }),
    db.atendimento.groupBy({ by: ['etapa'], where: base, _count: true }),
  ]);
  return { lista: lista.map(comContato), total, contagem: new Map(contagem.map(c => [c.etapa as string, c._count])) };
}

/** O atendimento completo. Sem permissão, `null`: a mesma resposta de quem não existe. */
export async function detalheDoAtendimento(u: Usuario, id: string) {
  const a = await db.atendimento.findUnique({
    where: { id },
    select: {
      ...CAMPOS_LISTA, numeroId: true, itens: { orderBy: { id: 'asc' } },
      registros: { orderBy: { id: 'desc' }, take: 200, select: { id: true, tipo: true, texto: true, criadoEm: true, usuario: { select: { name: true } } } },
    },
  });
  if (!a || !podeAtender(u, a)) return null;
  const [variantes, pedido, numero, eu, respostas] = await Promise.all([
    db.variante.findMany({
      where: { id: { in: a.itens.map(i => i.varianteId) } },
      select: { id: true, tamanho: true, estoque: true, reservado: true, produto: { select: { nome: true, referencia: true, preco: true, imagens: { take: 1, orderBy: { ordem: 'asc' }, select: { url: true } }, variantes: { select: { tamanho: true, estoque: true, reservado: true }, orderBy: { ordem: 'asc' } } } } },
    }),
    a.pedidoId ? db.pedido.findUnique({ where: { id: a.pedidoId }, select: { id: true, codigo: true, status: true, total: true } }) : null,
    a.numeroId ? db.numeroWhatsApp.findUnique({ where: { id: a.numeroId }, select: { apelido: true, telefone: true } }) : null,
    db.user.findUnique({ where: { id: u.id }, select: { numeroPrincipal: { select: { apelido: true, telefone: true, status: true } } } }),
    respostasPara(u),
  ]);
  const porId = new Map(variantes.map(v => [v.id, v]));
  // O preço que vai valer no pedido: o especial da vitrine, enquanto valer.
  const vitrine = a.vitrine ? await db.vitrine.findUnique({ where: { id: a.vitrine.id }, select: { status: true, ofertaAte: true, pecas: { select: { produtoId: true, precoOferta: true } } } }) : null;
  const ofertas = new Map(vitrine && ofertaVale(vitrine) ? vitrine.pecas.map(p => [p.produtoId, p.precoOferta == null ? null : Number(p.precoOferta)]) : []);
  return {
    ...comContato(a),
    registros: a.registros.map(r => ({ ...r, id: String(r.id) })),
    pecas: a.itens.flatMap(i => {
      const v = porId.get(i.varianteId);
      if (!v) return [];
      return [{
        id: i.id, varianteId: i.varianteId, quantidade: i.quantidade, nome: v.produto.nome, referencia: v.produto.referencia, tamanho: v.tamanho, preco: precoQueVale(Number(v.produto.preco), ofertas.get(i.produtoId), false),
        imagem: v.produto.imagens[0]?.url ?? null, disponivel: v.estoque - v.reservado, tamanhos: v.produto.variantes.filter(x => x.estoque - x.reservado > 0).map(x => x.tamanho),
      }];
    }),
    pedido: pedido ? { ...pedido, total: Number(pedido.total) } : null,
    numero,
    meuNumero: eu?.numeroPrincipal?.status === 'ativo' ? eu.numeroPrincipal : null,
    respostas,
  };
}

/** As respostas da loja e as pessoais de quem está vendo. */
export function respostasPara(u: Usuario) {
  return db.respostaPronta.findMany({ where: { OR: [{ usuarioId: null }, { usuarioId: u.id }] }, orderBy: [{ usuarioId: 'asc' }, { ordem: 'asc' }, { id: 'asc' }], select: { id: true, titulo: true, texto: true, usuarioId: true } });
}

/** A ficha da cliente: os atendimentos dela, para quem pode ver a ficha. */
export async function atendimentosDaFicha(u: Usuario, cliente: { id: string; vendedorId: string }) {
  if (!podeAcessar(u, cliente)) return [];
  return db.atendimento.findMany({ where: { clienteId: cliente.id }, orderBy: { criadoEm: 'desc' }, take: 10, select: { id: true, codigo: true, etapa: true, proximoContatoEm: true, criadoEm: true } });
}

type Medida = { etapa: string; criadoEm: Date; primeiroContatoEm: Date | null };

/** Conversão e tempo até o 1º contato. Sem a API, o tempo mede o clique no painel, não a resposta. */
function desempenho(lista: Medida[]) {
  const ganhos = lista.filter(a => a.etapa === 'ganho').length, perdidos = lista.filter(a => a.etapa === 'perdido').length;
  // Registro com contato antes da criação (dado corrigido à mão ou importado) não entra na média.
  const tempos = lista.filter(a => a.primeiroContatoEm).map(a => a.primeiroContatoEm!.getTime() - a.criadoEm.getTime()).filter(t => t >= 0);
  return {
    criados: lista.length, ganhos, perdidos, conversao: ganhos + perdidos ? Math.round((ganhos / (ganhos + perdidos)) * 100) : null,
    minutosPrimeiroContato: tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length / 60_000) : null,
  };
}

/** Indicadores de atendimento em Resultados. Contam só o que foi registrado. */
export async function indicadoresAtendimento(u: Usuario, intervalo: { gte: Date; lt: Date } | null) {
  exigirGestor(u);
  const criadoEm = intervalo ?? undefined;
  const [lista, contatos] = await Promise.all([
    db.atendimento.findMany({ where: { criadoEm }, take: 20_000, select: { canal: true, etapa: true, motivoPerda: true, criadoEm: true, primeiroContatoEm: true } }),
    db.posVendaContato.findMany({ where: { feitoEm: { not: null, ...(intervalo ?? {}) }, resultado: { in: ['respondeu', 'nao_respondeu', 'virou_atendimento'] } }, take: 20_000, select: { clienteId: true, feitoEm: true, resultado: true } }),
  ]);
  const porCanal = new Map<string, Medida[]>();
  for (const a of lista) porCanal.set(a.canal, [...(porCanal.get(a.canal) ?? []), a]);
  const motivos = new Map<string, number>();
  for (const a of lista) if (a.motivoPerda) motivos.set(a.motivoPerda, (motivos.get(a.motivoPerda) ?? 0) + 1);
  // Recompra: clientes contatadas que compraram de novo depois do contato, em até 90 dias.
  const ids = [...new Set(contatos.map(c => c.clienteId))];
  const vendas = ids.length ? await db.venda.findMany({ where: { clienteId: { in: ids } }, select: { clienteId: true, data: true } }) : [];
  const voltaram = ids.filter(id => contatos.some(c => c.clienteId === id && vendas.some(v => v.clienteId === id && v.data > c.feitoEm! && v.data.getTime() - c.feitoEm!.getTime() <= 90 * 86_400_000)));
  return {
    ...desempenho(lista),
    porCanal: [...porCanal].map(([canal, l]) => ({ canal, ...desempenho(l) })).sort((a, b) => b.criados - a.criados),
    motivos: [...motivos].map(([motivo, n]) => ({ motivo, n })).sort((a, b) => b.n - a.n),
    posVenda: { feitos: contatos.length, responderam: contatos.filter(c => c.resultado !== 'nao_respondeu').length, clientes: ids.length, voltaram: voltaram.length },
  };
}

function exigirGestor(u: Usuario) {
  if (u.papel !== 'gestor') throw new Error('Consulta restrita ao gestor.');
}

/** Visão da equipe: o que está aberto com cada vendedora e o que está sem responsável. */
export async function visaoDaEquipe(u: Usuario, agora = new Date()) {
  exigirGestor(u);
  const fim = fimDoDia(diaDe(agora));
  const [vendedoras, abertos, novos, vencidos, semResponsavel, deHoje, recentes] = await Promise.all([
    db.user.findMany({ where: { papel: 'vendedor', ativo: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, numeroPrincipal: { select: { apelido: true, status: true } } } }),
    db.atendimento.groupBy({ by: ['responsavelId'], where: { fechadoEm: null }, _count: true }),
    db.atendimento.groupBy({ by: ['responsavelId'], where: { fechadoEm: null, etapa: 'novo', primeiroContatoEm: null }, _count: true }),
    db.atendimento.groupBy({ by: ['responsavelId'], where: { fechadoEm: null, proximoContatoEm: { lt: agora } }, _count: true }),
    db.atendimento.findMany({ where: { fechadoEm: null, responsavelId: null }, select: CAMPOS_LISTA, orderBy: { criadoEm: 'asc' }, take: LIMITE_POR_GRUPO }),
    db.atendimento.groupBy({ by: ['responsavelId'], where: { fechadoEm: null, proximoContatoEm: { lte: fim } }, _count: true }),
    db.atendimento.findMany({ where: { criadoEm: { gte: new Date(agora.getTime() - 30 * 86_400_000) } }, take: 5000, select: { responsavelId: true, etapa: true, criadoEm: true, primeiroContatoEm: true } }),
  ]);
  const mapa = (l: { responsavelId: string | null; _count: number }[]) => new Map(l.map(x => [x.responsavelId, x._count]));
  const [a, n, v, h] = [mapa(abertos), mapa(novos), mapa(vencidos), mapa(deHoje)];
  return {
    linhas: vendedoras.map(p => ({ ...desempenho(recentes.filter(r => r.responsavelId === p.id)), id: p.id, nome: p.name, numero: p.numeroPrincipal?.status === 'ativo' ? p.numeroPrincipal.apelido : null, abertos: a.get(p.id) ?? 0, novos: n.get(p.id) ?? 0, vencidos: v.get(p.id) ?? 0, hoje: h.get(p.id) ?? 0 })),
    semResponsavel: semResponsavel.map(comContato),
  };
}
