'use server';

import { catalogo } from '../catalogo';
import { lerConfig } from '../config';
import { usuarioAtual } from '../permissoes';
import { casaBusca, emEstoque, normalizar, termosDeBusca } from '@/lib/catalogo';

export type SugestoesBusca = {
  produtos: { referencia: string; nome: string; preco: number; precoCheio: number; imagem: string | null; marca: string }[];
  categorias: { slug: string; nome: string; n: number }[];
  total: number;
};

const VAZIO: SugestoesBusca = { produtos: [], categorias: [], total: 0 };

/**
 * Sugestões da busca do topo enquanto a pessoa digita: até 6 peças (com estoque e foto primeiro) e as categorias que
 * casam com o termo. Respeita o catálogo privado (D-09): sem login e sem catálogo público, nada.
 */
export async function sugerirBusca(termo: string): Promise<SugestoesBusca> {
  const q = String(termo ?? '').trim().slice(0, 80);
  if (q.length < 2) return VAZIO;
  const [u, cfg] = await Promise.all([usuarioAtual(), lerConfig()]);
  if (!u && !cfg.catalogoPublico) return VAZIO;
  const termos = termosDeBusca(q);
  const lista = await catalogo();
  const achados = lista.filter(p => casaBusca(p, termos));
  const ordenados = [...achados].sort((a, b) =>
    Number(emEstoque(b) && b.imagens.length > 0) - Number(emEstoque(a) && a.imagens.length > 0) ||
    Number(normalizar(b.nome).startsWith(termos[0])) - Number(normalizar(a.nome).startsWith(termos[0])) || b.id - a.id);
  const cats = new Map<string, { slug: string; nome: string; n: number }>();
  for (const p of lista) {
    if (!termos.every(t => normalizar(p.categoria).includes(t))) continue;
    const c = cats.get(p.categoriaSlug) ?? { slug: p.categoriaSlug, nome: p.categoria, n: 0 };
    c.n++;
    cats.set(p.categoriaSlug, c);
  }
  return {
    produtos: ordenados.slice(0, 6).map(p => ({ referencia: p.referencia, nome: p.nome, preco: p.preco, precoCheio: p.precoCheio, imagem: p.imagens[0] ?? null, marca: p.marca })),
    categorias: [...cats.values()].sort((a, b) => b.n - a.n).slice(0, 4),
    total: achados.length,
  };
}
