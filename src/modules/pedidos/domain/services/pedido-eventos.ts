import { Pedido } from '../entities/pedido.entity';
import { PedidoEstado } from '../enums/pedido-estado.enum';

export const PEDIDO_EVENTOS = Symbol('PEDIDO_EVENTOS');

export interface EstadoPedidoActualizado {
  pedido: Pedido;
  estadoAnterior: PedidoEstado;
  /** Usuario que hizo el cambio. */
  autorId: string;
}

/**
 * GP-08 CA5: avisa a los interesados que un pedido cambio de estado. No debe
 * lanzar: el cambio ya quedo guardado y un fallo al notificar no lo revierte.
 */
export interface PedidoEventos {
  estadoActualizado(evento: EstadoPedidoActualizado): Promise<void>;
}
