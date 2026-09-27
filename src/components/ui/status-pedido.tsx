import type { StatusPedido, TipoPedido } from '@prisma/client';
import { Etiqueta } from './basicos';

export function EtiquetaStatus({ status }: { status: StatusPedido }) {
  if (status === 'confirmado') return <Etiqueta cor="oliva">Confirmado</Etiqueta>;
  if (status === 'cancelado') return <Etiqueta cor="cinza">Cancelado</Etiqueta>;
  return <Etiqueta cor="bege">Pendente</Etiqueta>;
}

export function EtiquetaTipo({ tipo }: { tipo: TipoPedido }) {
  return tipo === 'condicional' ? <Etiqueta cor="oliva">Condicional</Etiqueta> : <Etiqueta cor="caramelo">Pedido</Etiqueta>;
}
