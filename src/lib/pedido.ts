/** Valores de um pedido como devem aparecer em qualquer tela (Q-01, B-07, B-08). */
type ItemValor = { situacao: 'pendente' | 'vendido' | 'devolvido'; precoUnitario: number | { toString(): string }; quantidade: number };
type PedidoValor = { tipo: 'compra' | 'condicional'; status: 'pendente' | 'confirmado' | 'cancelado'; total: number | { toString(): string }; frete: number | { toString(): string }; itens: ItemValor[] };

export type Valores = {
  /** Valor das peças (no condicional fechado, só das que ficaram). */
  pecas: number;
  /** Frete do pedido de compra; null no condicional. */
  frete: number | null;
  total: number;
  /** Unidades que ficaram com a cliente (condicional fechado); null nos demais. */
  ficaram: number | null;
  unidades: number;
};

export function valoresDoPedido(p: PedidoValor): Valores {
  const n = (v: number | { toString(): string }) => Number(v.toString());
  const unidades = p.itens.reduce((a, i) => a + i.quantidade, 0);
  if (p.tipo === 'condicional') {
    if (p.status !== 'confirmado') return { pecas: n(p.total), frete: null, total: n(p.total), ficaram: null, unidades };
    const vendidos = p.itens.filter(i => i.situacao === 'vendido');
    const pecas = vendidos.reduce((a, i) => a + n(i.precoUnitario) * i.quantidade, 0);
    return { pecas, frete: null, total: pecas, ficaram: vendidos.reduce((a, i) => a + i.quantidade, 0), unidades };
  }
  const frete = n(p.frete);
  return { pecas: n(p.total), frete, total: n(p.total) + frete, ficaram: null, unidades };
}

/** "1 peça", "2 peças" (C-04: sem "peça(s)"). */
export const plural = (n: number, um: string, varios: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
