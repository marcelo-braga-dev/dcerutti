'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../db';
import { usuarioAtual } from '../permissoes';

/**
 * Coração da loja (D-22): marca ou desmarca a peça como favorita da cliente logada. Equipe e visitante não têm
 * favoritos (devolve null e o botão manda para o login).
 */
export async function alternarFavorito(produtoId: number): Promise<{ favorito: boolean } | null> {
  const u = await usuarioAtual();
  if (u?.papel !== 'cliente' || !Number.isInteger(produtoId)) return null;
  const cliente = await db.cliente.findUnique({ where: { userId: u.id }, select: { id: true } });
  if (!cliente) return null;
  const chave = { clienteId_produtoId: { clienteId: cliente.id, produtoId } };
  const ja = await db.favorito.findUnique({ where: chave });
  if (ja) await db.favorito.delete({ where: chave });
  else {
    if (!(await db.produto.count({ where: { id: produtoId } }))) return null;
    await db.favorito.create({ data: { clienteId: cliente.id, produtoId } });
  }
  revalidatePath('/minha-conta/favoritos');
  return { favorito: !ja };
}
