import 'server-only';
import { db } from './db';
import { posicaoTamanho, type ProdutoCatalogo } from '@/lib/catalogo';

/**
 * Catálogo ativo em memória. São poucas centenas de produtos: carregar tudo e filtrar em memória
 * é mais rápido e simples que montar consultas por filtro. Nunca inclui custo (RN-16).
 *
 * Fica em globalThis para ser o mesmo objeto em todos os bundles do servidor (páginas, actions, rotas).
 * Vale para um único processo Node (PM2 em modo fork, D-10). Com vários processos, trocar por cache compartilhado.
 */
const TTL_MS = 5 * 60 * 1000;
const g = globalThis as unknown as { __catalogo?: { em: number; dados: Promise<ProdutoCatalogo[]> } };

export function catalogo(): Promise<ProdutoCatalogo[]> {
  const c = g.__catalogo;
  if (c && Date.now() - c.em < TTL_MS) return c.dados;
  const dados = carregar();
  g.__catalogo = { em: Date.now(), dados };
  dados.catch(() => { if (g.__catalogo?.dados === dados) g.__catalogo = undefined; });
  return dados;
}

/** Chamar depois de qualquer alteração em produto, imagem, variante, estoque ou reserva. */
export function invalidarCatalogo() {
  g.__catalogo = undefined;
}

async function carregar(): Promise<ProdutoCatalogo[]> {
  const produtos = await db.produto.findMany({
    where: { ativo: true },
    orderBy: { id: 'asc' },
    select: {
      id: true, referencia: true, nome: true, subcategoria: true, genero: true, estacao: true, cor: true,
      composicao: true, descricao: true, destaques: true, preco: true, precoCheio: true, imperdivel: true,
      marca: { select: { nome: true, slug: true } },
      categoria: { select: { nome: true, slug: true } },
      imagens: { select: { url: true }, orderBy: { ordem: 'asc' } },
      variantes: { select: { id: true, tamanho: true, estoque: true, reservado: true, codigoInterno: true, ordem: true } },
    },
  });
  return produtos.map(p => ({
    id: p.id,
    referencia: p.referencia,
    nome: p.nome,
    marca: p.marca.nome,
    marcaSlug: p.marca.slug,
    categoria: p.categoria.nome,
    categoriaSlug: p.categoria.slug,
    subcategoria: p.subcategoria,
    genero: p.genero,
    estacao: p.estacao,
    cor: p.cor,
    composicao: p.composicao,
    descricao: p.descricao,
    destaques: Array.isArray(p.destaques) ? (p.destaques as string[]) : [],
    preco: Number(p.preco),
    precoCheio: Number(p.precoCheio),
    imperdivel: p.imperdivel,
    imagens: p.imagens.map(i => i.url),
    variantes: p.variantes
      .sort((a, b) => a.ordem - b.ordem || posicaoTamanho(a.tamanho) - posicaoTamanho(b.tamanho))
      .map(v => ({ id: v.id, tamanho: v.tamanho, disponivel: Math.max(0, v.estoque - v.reservado), codigoInterno: v.codigoInterno })),
  }));
}

export async function produtoPorReferencia(referencia: string) {
  const lista = await catalogo();
  return lista.find(p => p.referencia.toLowerCase() === referencia.toLowerCase()) ?? null;
}
