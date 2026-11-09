import 'server-only';
import { db } from '../db';
import type { Usuario } from '../permissoes';
import { ACOES, type Acao } from '@/lib/equipe';
import { numeroEmUso } from '@/lib/numeros';
import { tempoDesde } from '@/lib/atividade';

/** Números de WhatsApp da loja (D-31): leituras só da gestora. */
function exigirGestor(u: Usuario) {
  if (u.papel !== 'gestor') throw new Error('Consulta restrita ao gestor.');
}

const FICHAS = { NOT: { telefone: '' } };

/** A página do quadro: números com as pessoas ligadas, a equipe e as pendências. */
export async function quadroDeNumeros(u: Usuario) {
  exigirGestor(u);
  const [numeros, pessoas, carteiras, usos, pendentes] = await Promise.all([
    db.numeroWhatsApp.findMany({
      orderBy: [{ padrao: 'desc' }, { apelido: 'asc' }],
      include: { vinculos: { where: { fimEm: null }, orderBy: { inicioEm: 'asc' }, include: { usuario: { select: { name: true, papel: true } } } } },
    }),
    db.user.findMany({
      where: { ativo: true, papel: { in: ['vendedor', 'gestor'] } }, orderBy: [{ papel: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, papel: true, numeroPrincipalId: true, numeroPrincipal: { select: { status: true } } },
    }),
    db.cliente.groupBy({ by: ['vendedorId'], where: FICHAS, _count: true }),
    db.atividadeEquipe.groupBy({ by: ['numeroId', 'usuarioId'], where: { numeroId: { not: null } }, _max: { criadoEm: true } }),
    db.vinculoNumero.findMany({
      where: { fimEm: { not: null }, desconectadoEm: null }, orderBy: { fimEm: 'asc' },
      select: { id: true, fimEm: true, usuario: { select: { name: true } }, numero: { select: { apelido: true, telefone: true } } },
    }),
  ]);
  const clientes = new Map(carteiras.map(c => [c.vendedorId, c._count]));
  const uso = new Map(usos.map(x => [`${x.numeroId}:${x.usuarioId}`, x._max.criadoEm]));
  const principal = new Map(pessoas.map(p => [p.id, p.numeroPrincipalId]));
  return {
    numeros: numeros.map(n => ({
      id: n.id, telefone: n.telefone, apelido: n.apelido, status: n.status, padrao: n.padrao,
      // As clientes que falam com este número: as de quem o tem como principal e, no padrão, as de quem está sem número.
      clientes: n.status !== 'ativo' ? 0 : pessoas.filter(p => p.papel === 'vendedor' && (p.numeroPrincipalId === n.id || (n.padrao && !numeroEmUso(p.numeroPrincipal)))).reduce((a, p) => a + (clientes.get(p.id) ?? 0), 0),
      vinculos: n.vinculos.map(v => ({
        id: v.id, usuarioId: v.usuarioId, nome: v.usuario.name, papel: v.usuario.papel, conexao: v.conexao,
        principal: principal.get(v.usuarioId) === n.id, ultimoUso: uso.has(`${n.id}:${v.usuarioId}`) ? tempoDesde(uso.get(`${n.id}:${v.usuarioId}`)) : null,
      })),
    })),
    equipe: pessoas.map(p => ({
      id: p.id, nome: p.name, papel: p.papel, clientes: clientes.get(p.id) ?? 0,
      semNumero: p.papel === 'vendedor' && !numeroEmUso(p.numeroPrincipal),
    })),
    pendencias: pendentes.map(p => ({ id: p.id, nome: p.usuario.name, numero: p.numero.apelido, telefone: p.numero.telefone, desde: tempoDesde(p.fimEm) })),
  };
}

export type QuadroDeNumeros = Awaited<ReturnType<typeof quadroDeNumeros>>;

/** O que muda ao tirar a pessoa do número. */
export async function impactoDaRemocao(u: Usuario, numeroId: number, usuarioId: string) {
  exigirGestor(u);
  const [pessoa, clientes, pendentes, outrosNumeros, vendedoras] = await Promise.all([
    db.user.findUnique({ where: { id: usuarioId }, select: { papel: true, numeroPrincipalId: true } }),
    db.cliente.count({ where: { vendedorId: usuarioId, ...FICHAS } }),
    db.pedido.count({ where: { vendedorId: usuarioId, status: 'pendente' } }),
    db.vinculoNumero.count({ where: { usuarioId, fimEm: null, numeroId: { not: numeroId }, numero: { status: 'ativo' } } }),
    db.user.findMany({ where: { papel: 'vendedor', ativo: true, NOT: { id: usuarioId } }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  return {
    clientes, pendentes, principal: pessoa?.numeroPrincipalId === numeroId, ficaSemNumero: pessoa?.papel === 'vendedor' && pessoa.numeroPrincipalId === numeroId && outrosNumeros === 0,
    podeTransferir: pessoa?.papel === 'vendedor' && clientes + pendentes > 0, vendedoras,
  };
}

/** A página de um número: dados, histórico completo de quem teve acesso e o uso registrado. */
export async function detalheDoNumero(u: Usuario, id: number) {
  exigirGestor(u);
  const numero = await db.numeroWhatsApp.findUnique({ where: { id } });
  if (!numero) return null;
  const [vinculos, usos, pedidos, atendendo] = await Promise.all([
    db.vinculoNumero.findMany({ where: { numeroId: id }, orderBy: { inicioEm: 'desc' }, take: 200, include: { usuario: { select: { name: true } } } }),
    db.atividadeEquipe.findMany({ where: { numeroId: id }, orderBy: { criadoEm: 'desc' }, take: 30, include: { usuario: { select: { name: true } } } }),
    db.pedido.count({ where: { numeroId: id } }),
    // No padrão entram também as clientes de quem está sem número em uso.
    db.cliente.count({ where: { ...FICHAS, vendedor: numero.padrao ? { OR: [{ numeroPrincipalId: id }, { numeroPrincipalId: null }, { numeroPrincipal: { status: { not: 'ativo' } } }] } : { numeroPrincipalId: id } } }),
  ]);
  const ids = [...new Set(vinculos.flatMap(v => [v.vinculadoPorId, v.encerradoPorId]).filter((x): x is string => !!x))];
  const nomes = new Map((await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map(p => [p.id, p.name]));
  return {
    numero, pedidos, atendendo,
    vinculos: vinculos.map(v => ({ ...v, nome: v.usuario.name, vinculadoPor: nomes.get(v.vinculadoPorId ?? '') ?? null, encerradoPor: nomes.get(v.encerradoPorId ?? '') ?? null })),
    usos: usos.map(a => ({ id: String(a.id), quem: a.usuario.name, acao: ACOES[a.tipo as Acao]?.rotulo ?? a.tipo, descricao: a.descricao, criadoEm: a.criadoEm })),
  };
}
