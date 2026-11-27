export type SituacaoItem = 'pendente' | 'vendido' | 'devolvido';
export type StatusPedido = 'pendente' | 'confirmado' | 'cancelado';
export type TipoPedido = 'compra' | 'condicional';
export type OrigemPedido = 'loja' | 'vendedor' | 'balcao';

/** Pedido como a lista recebe (PedidoController::resumo). */
export type ResumoPedido = {
  id: string; codigo: string; tipo: TipoPedido; status: StatusPedido; origem: OrigemPedido;
  nomeCliente: string; telefoneCliente: string; criadoEm: string; total: number; frete: number | null;
  descontoCupom: number; codigoCupom: string | null; freteCupom: boolean; pagamentoSituacao: string; motivoCancelamento: string | null;
  vendedor: { id: string; nome: string };
  itens: { id: number; imagem: string | null; nome: string; quantidade: number; situacao: SituacaoItem; precoUnitario: number; descontoCupom: number }[];
};
