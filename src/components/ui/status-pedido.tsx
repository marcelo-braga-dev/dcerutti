import type { StatusPedido, TipoPedido } from '@prisma/client';
import { Etiqueta } from './basicos';

export function EtiquetaStatus({ status }: { status: StatusPedido }) {
  if (status === 'confirmado') return <Etiqueta cor="oliva">Confirmado</Etiqueta>;
  if (status === 'cancelado') return <Etiqueta cor="cinza">Cancelado</Etiqueta>;
  return <Etiqueta cor="caramelo">Pendente</Etiqueta>;
}

export function EtiquetaTipo({ tipo }: { tipo: TipoPedido }) {
  // Q-09: o tipo é neutro; a cor fica reservada para o status.
  return <Etiqueta cor="contorno">{tipo === 'condicional' ? 'Condicional' : 'Pedido'}</Etiqueta>;
}
