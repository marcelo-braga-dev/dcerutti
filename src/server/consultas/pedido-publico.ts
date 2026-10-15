import 'server-only';
import { cache } from 'react';
import { db } from '../db';

/**
 * Pedido para o link público (D-20): só o que pode aparecer sem login. Peças, valores, situação e data; nunca nome,
 * telefone, CEP, vendedor ou custo. A autenticidade da chave é conferida antes (link-pedido.ts).
 */
export const pedidoPublico = cache(async (codigo: string) => {
  const p = await db.pedido.findUnique({
    where: { codigo },
    select: {
      codigo: true, tipo: true, status: true, criadoEm: true, total: true, frete: true, codigoCupom: true, descontoCupom: true, freteCupom: true,
      itens: {
        orderBy: { id: 'asc' },
        select: { id: true, nome: true, marca: true, referencia: true, cor: true, tamanho: true, codigoInterno: true, quantidade: true, precoUnitario: true, imagem: true, situacao: true },
      },
    },
  });
  if (!p) return null;
  const itens = p.itens.map(i => ({ ...i, preco: Number(i.precoUnitario) }));
  const pecas = itens.reduce((a, i) => a + i.quantidade, 0);
  const subtotal = Math.round(itens.reduce((a, i) => a + i.preco * i.quantidade, 0) * 100) / 100;
  return {
    codigo: p.codigo, tipo: p.tipo, status: p.status, criadoEm: p.criadoEm, itens, pecas, subtotal,
    desconto: Number(p.descontoCupom), cupom: p.codigoCupom, freteCupom: p.freteCupom,
    frete: p.frete == null ? null : Number(p.frete),
    // `total` do pedido já vem com o desconto do cupom e sem o frete.
    total: Number(p.total) + (p.tipo === 'compra' && p.frete != null ? Number(p.frete) : 0),
  };
});

export type PedidoPublico = NonNullable<Awaited<ReturnType<typeof pedidoPublico>>>;
