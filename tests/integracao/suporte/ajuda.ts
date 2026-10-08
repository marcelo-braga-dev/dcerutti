import { expect } from 'vitest';
import { db } from '@/server/db';
import { invalidarCatalogo } from '@/server/catalogo';
import { estado, Redirecionou } from './next';
import type { EstadoForm } from '@/lib/formulario';

export { db, estado };

/** Define quem está logado nas actions (null = ninguém). */
export async function entrarComo(email: string | null) {
  if (!email) return void (estado.usuario = null);
  const u = await db.user.findUniqueOrThrow({ where: { email } });
  estado.usuario = { id: u.id, name: u.name, email: u.email, papel: u.papel, telefone: u.telefone, aceitouPrivacidadeEm: u.aceitouPrivacidadeEm };
  return estado.usuario;
}

export const usuarioPorEmail = (email: string) => db.user.findUniqueOrThrow({ where: { email } });

/** Usuário no formato de permissoes.Usuario, para chamar as consultas direto. */
export async function comoUsuario(email: string) {
  const u = await usuarioPorEmail(email);
  return { id: u.id, name: u.name, email: u.email, papel: u.papel, telefone: u.telefone, aceitouPrivacidadeEm: u.aceitouPrivacidadeEm };
}

export function form(campos: Record<string, string | number | boolean | undefined | null>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) {
    if (v === undefined || v === null || v === false) continue;
    fd.set(k, v === true ? 'on' : String(v));
  }
  return fd;
}

/** Roda a action e devolve o destino do redirect (falha se ela não redirecionar). */
export async function redirecionou(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (e instanceof Redirecionou) return e.url;
    throw e;
  }
  throw new Error('A action não redirecionou.');
}

export function esperarErroDeCampo(r: EstadoForm, campo: string, trecho?: RegExp | string) {
  expect(r.ok, `esperava erro no campo ${campo}: ${JSON.stringify(r)}`).not.toBe(true);
  expect(r.erros?.[campo], `erros: ${JSON.stringify(r.erros)} / ${r.erro}`).toBeTruthy();
  if (trecho) expect(r.erros![campo]).toMatch(trecho);
}

let seq = 0;
const unico = () => `${Date.now().toString(36).slice(-5)}${(seq++).toString(36)}`.toUpperCase();

/**
 * Produto isolado para um teste (nenhum outro teste mexe nele). `estoque` = { tamanho: quantidade }.
 * Devolve o produto e um mapa tamanho → id da variante.
 */
export async function produtoDeTeste(o: { estoque?: Record<string, number>; preco?: number; custo?: number | null; ativo?: boolean; categoria?: string; imagens?: string[] } = {}) {
  const ref = `T${unico()}`.slice(0, 20);
  const marca = await db.marca.findFirstOrThrow();
  const categoria = await db.categoria.findFirstOrThrow({ where: { slug: o.categoria ?? 'camisetas' } });
  const estoque = o.estoque ?? { P: 5, M: 5, G: 5 };
  const p = await db.produto.create({
    data: {
      referencia: ref, nome: `Produto de teste ${ref}`, marcaId: marca.id, categoriaId: categoria.id, genero: 'unissex',
      preco: o.preco ?? 100, precoCheio: o.preco ?? 100, ativo: o.ativo ?? true,
      ...(o.custo === null ? {} : { custo: { create: { valor: o.custo ?? 40 } } }),
      imagens: { create: (o.imagens ?? []).map((url, ordem) => ({ url, ordem })) },
      variantes: { create: Object.entries(estoque).map(([tamanho, q], ordem) => ({ tamanho, estoque: q, ordem, codigoInterno: `C${ref}${tamanho}`.slice(0, 20) })) },
    },
    include: { variantes: true },
  });
  // Estoque inicial com histórico, como o sistema faz (o invariante estoque = soma dos movimentos continua valendo).
  const iniciais = p.variantes.filter(x => x.estoque > 0).map(x => ({ varianteId: x.id, delta: x.estoque, motivo: 'entrada' as const, observacao: 'Estoque inicial (teste)' }));
  if (iniciais.length) await db.movimentoEstoque.createMany({ data: iniciais });
  invalidarCatalogo();
  const v = Object.fromEntries(p.variantes.map(x => [x.tamanho, x.id])) as Record<string, number>;
  return { produto: p, v, ref };
}

export const variante = (id: number) => db.variante.findUniqueOrThrow({ where: { id } });

export async function clientePorEmail(email: string) {
  return db.cliente.findFirstOrThrow({ where: { user: { email } } });
}

export async function clientePorNome(nome: string) {
  return db.cliente.findFirstOrThrow({ where: { nome } });
}
