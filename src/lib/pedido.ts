/** Valores de um pedido como devem aparecer em qualquer tela (Q-01, B-07, B-08). */
type ItemValor = { situacao: 'pendente' | 'vendido' | 'devolvido'; precoUnitario: number | { toString(): string }; quantidade: number };
type PedidoValor = { tipo: 'compra' | 'condicional'; status: 'pendente' | 'confirmado' | 'cancelado'; total: number | { toString(): string }; frete: number | { toString(): string } | null; itens: ItemValor[] };

export type Valores = {
  /** Valor das peças (no condicional fechado, só das que ficaram). */
  pecas: number;
  /** Frete do pedido de compra (0 = grátis); null no condicional ou quando é a combinar. */
  frete: number | null;
  /** Compra com frete a combinar com o vendedor (C-03). */
  freteACombinar: boolean;
  total: number;
  /** Unidades que ficaram com a cliente (condicional fechado); null nos demais. */
  ficaram: number | null;
  unidades: number;
};

export function valoresDoPedido(p: PedidoValor): Valores {
  const n = (v: number | { toString(): string }) => Number(v.toString());
  const unidades = p.itens.reduce((a, i) => a + i.quantidade, 0);
  if (p.tipo === 'condicional') {
    if (p.status !== 'confirmado') return { pecas: n(p.total), frete: null, freteACombinar: false, total: n(p.total), ficaram: null, unidades };
    const vendidos = p.itens.filter(i => i.situacao === 'vendido');
    const pecas = vendidos.reduce((a, i) => a + n(i.precoUnitario) * i.quantidade, 0);
    return { pecas, frete: null, freteACombinar: false, total: pecas, ficaram: vendidos.reduce((a, i) => a + i.quantidade, 0), unidades };
  }
  const frete = p.frete == null ? null : n(p.frete);
  return { pecas: n(p.total), frete, freteACombinar: frete == null, total: n(p.total) + (frete ?? 0), ficaram: null, unidades };
}

/** "1 peça", "2 peças" (C-04: sem "peça(s)"). */
export const plural = (n: number, um: string, varios: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;

/** Q-05: motivo do cancelamento em palavras, do ponto de vista de quem lê. */
export function textoCancelamento(motivo: string | null | undefined, paraCliente: boolean) {
  if (motivo === 'expirado') return paraCliente ? 'Expirou sem confirmação' : 'Expirou sem resposta';
  if (motivo === 'cliente') return paraCliente ? 'Cancelado por você' : 'Cancelado pela cliente';
  if (motivo === 'equipe') return paraCliente ? 'Cancelado pela loja' : 'Cancelado pela equipe';
  return null;
}

/** Dias inteiros até `data` (arredondado para cima; 0 = hoje ou já passou). */
export const diasAte = (data: Date, agora = new Date()) => Math.max(0, Math.ceil((data.getTime() - agora.getTime()) / 864e5));

/** Q-05: pendente criado antes deste instante já expirou. */
export const limiteDeExpiracao = (dias: number, agora = new Date()) => new Date(agora.getTime() - dias * 864e5);

/** Q-05: quando um pendente expira (null = não expira). */
export const expiraEm = (criadoEm: Date, dias: number) => (dias > 0 ? new Date(criadoEm.getTime() + dias * 864e5) : null);
