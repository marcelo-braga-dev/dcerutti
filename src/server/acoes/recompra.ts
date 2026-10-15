'use server';

import { catalogo } from '../catalogo';
import { db } from '../db';
import { usuarioAtual } from '../permissoes';
import type { ItemSacola } from '@/components/loja/sacola';

export type Recompra = { itens: ItemSacola[]; indisponiveis: string[] } | null;

/**
 * "Comprar de novo" (D-22): as peças de um pedido da própria cliente, como estão hoje no catálogo (preço atual),
 * nos mesmos tamanhos e quantidades, limitadas ao disponível. O que saiu do catálogo ou acabou volta pelo nome.
 */
export async function pecasParaRecomprar(pedidoId: string): Promise<Recompra> {
  const u = await usuarioAtual();
  if (u?.papel !== 'cliente') return null;
  const pedido = await db.pedido.findFirst({
    where: { id: String(pedidoId), cliente: { userId: u.id } },
    select: { itens: { select: { varianteId: true, quantidade: true, nome: true, tamanho: true, situacao: true } } },
  });
  if (!pedido) return null;
  const porVariante = new Map<number, { produto: Awaited<ReturnType<typeof catalogo>>[number]; disponivel: number; tamanho: string; codigoInterno: string | null }>();
  for (const p of await catalogo()) for (const v of p.variantes) porVariante.set(v.id, { produto: p, disponivel: v.disponivel, tamanho: v.tamanho, codigoInterno: v.codigoInterno });

  const itens: ItemSacola[] = [];
  const indisponiveis: string[] = [];
  // Condicional fechado: só o que ficou (o que voltou ela já provou e devolveu).
  const linhas = pedido.itens.filter(i => i.situacao !== 'devolvido');
  for (const l of linhas) {
    const v = porVariante.get(l.varianteId);
    if (!v || v.disponivel <= 0) { indisponiveis.push(`${l.nome} (tam. ${l.tamanho})`); continue; }
    const p = v.produto;
    itens.push({
      varianteId: l.varianteId, referencia: p.referencia, nome: p.nome, marca: p.marca, cor: p.cor, tamanho: v.tamanho,
      codigoInterno: v.codigoInterno, preco: p.preco, imagem: p.imagens[0] ?? null, maximo: v.disponivel,
      quantidade: Math.min(l.quantidade, v.disponivel),
    });
  }
  return { itens, indisponiveis };
}
