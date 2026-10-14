import 'server-only';
import type { MotivoEstoque, Prisma } from '@prisma/client';
import { ErroNegocio } from './erros';
import { plural } from '@/lib/pedido';

/**
 * Única porta de alteração de estoque. Toda função roda dentro de uma transação (`tx`) e usa UPDATE condicional ou
 * trava de linha, para duas pessoas não venderem, reservarem ou ajustarem a mesma peça ao mesmo tempo.
 * Quem chama é responsável por `invalidarCatalogo()` depois do commit.
 */
type Tx = Prisma.TransactionClient;

/** RN-08: reserva para condicional. Falha se outro pedido reservou a última peça antes. */
export async function reservar(tx: Tx, varianteId: number, q: number) {
  const n = await tx.$executeRaw`UPDATE variante SET reservado = reservado + ${q} WHERE id = ${varianteId} AND estoque - reservado >= ${q}`;
  if (n === 0) throw new ErroNegocio('Uma das peças acabou de ser reservada por outra pessoa. Atualize a sacola e tente de novo.');
}

/** RN-09: devolve a reserva (condicional cancelado ou peça que voltou). */
export async function liberarReserva(tx: Tx, varianteId: number, q: number) {
  await tx.$executeRaw`UPDATE variante SET reservado = GREATEST(reservado - ${q}, 0) WHERE id = ${varianteId}`;
}

/** RN-07: baixa por venda, registrada no histórico. `reservada` = a peça vinha de um condicional. */
export async function baixarVenda(
  tx: Tx,
  p: { varianteId: number; q: number; reservada: boolean; pedidoId: string; usuarioId: string; observacao: string; nomePeca: string },
) {
  const n = p.reservada
    ? await tx.$executeRaw`UPDATE variante SET estoque = estoque - ${p.q}, reservado = GREATEST(reservado - ${p.q}, 0) WHERE id = ${p.varianteId} AND estoque >= ${p.q}`
    : await tx.$executeRaw`UPDATE variante SET estoque = estoque - ${p.q} WHERE id = ${p.varianteId} AND estoque >= ${p.q}`;
  if (n === 0) throw new ErroNegocio(`Estoque insuficiente para ${p.nomePeca}. Ajuste o estoque antes de confirmar.`);
  await tx.movimentoEstoque.create({ data: { varianteId: p.varianteId, delta: -p.q, motivo: 'venda', pedidoId: p.pedidoId, usuarioId: p.usuarioId, observacao: p.observacao } });
}

/** Venda desfeita (pedido confirmado cancelado): as peças voltam ao estoque, com o motivo "estorno" no histórico. */
export async function estornarVenda(tx: Tx, p: { varianteId: number; q: number; pedidoId: string; usuarioId: string; observacao: string }) {
  await tx.$executeRaw`UPDATE variante SET estoque = estoque + ${p.q} WHERE id = ${p.varianteId}`;
  await tx.movimentoEstoque.create({ data: { varianteId: p.varianteId, delta: p.q, motivo: 'estorno', pedidoId: p.pedidoId, usuarioId: p.usuarioId, observacao: p.observacao } });
}

/**
 * Entrada soma ao estoque; ajuste define a quantidade contada. Trava a linha até o commit (C-06) e nunca deixa o
 * estoque abaixo do que está reservado em condicionais. Devolve o produto da variante.
 */
export async function movimentar(
  tx: Tx,
  p: { varianteId: number; tipo: Extract<MotivoEstoque, 'entrada' | 'ajuste'>; quantidade: number; usuarioId: string; observacao?: string | null },
) {
  const travada = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM variante WHERE id = ${p.varianteId} FOR UPDATE`;
  if (!travada.length) throw new ErroNegocio('Tamanho não encontrado.');
  const v = await tx.variante.findUniqueOrThrow({ where: { id: p.varianteId } });
  const novo = p.tipo === 'entrada' ? v.estoque + p.quantidade : p.quantidade;
  if (novo < v.reservado) throw new ErroNegocio(`Há ${plural(v.reservado, 'peça reservada', 'peças reservadas')} em condicionais; o estoque não pode ficar abaixo disso.`);
  const delta = novo - v.estoque;
  if (delta !== 0) {
    await tx.variante.update({ where: { id: v.id }, data: { estoque: novo } });
    await tx.movimentoEstoque.create({ data: { varianteId: v.id, delta, motivo: p.tipo, usuarioId: p.usuarioId, observacao: p.observacao || null } });
  }
  return v.produtoId;
}

/** Estoque inicial de um tamanho recém-criado, registrado como entrada. */
export async function registrarEstoqueInicial(tx: Tx, varianteId: number, q: number, usuarioId: string) {
  if (q > 0) await tx.movimentoEstoque.create({ data: { varianteId, delta: q, motivo: 'entrada', usuarioId, observacao: 'Estoque inicial' } });
}
