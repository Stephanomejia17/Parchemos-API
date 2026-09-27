import type {
  MesaConPedidos,
  PedidoEnSala,
} from '../../domain/entities/pedido-en-sala';
import { Pedido } from '../../domain/entities/pedido.entity';
import { siguientesEstados } from '../../domain/services/pedido-estado-flujo';

/** Forma publica del estado de un pedido (GP-08). */
export function toPedidoEstadoResponse(pedido: Pedido) {
  return {
    id: pedido.id,
    numero: pedido.numero,
    restauranteId: pedido.restauranteId,
    sedeId: pedido.sedeId,
    sedeNombre: pedido.sedeNombre,
    modalidad: pedido.modalidad,
    estado: pedido.estado,
    siguientesEstados: siguientesEstados(pedido.estado, pedido.modalidad),
    finalizado: pedido.estaFinalizado(),
    total: pedido.total,
    confirmadoEn: pedido.confirmadoEn,
    entregadoEn: pedido.entregadoEn,
    actualizadoEn: pedido.updatedAt,
  };
}

/** GP-05: pedido con el detalle que necesita el personal de sala. */
export function toPedidoEnSalaResponse({
  pedido,
  mesa,
  items,
  estadoPago,
}: PedidoEnSala) {
  return { ...toPedidoEstadoResponse(pedido), mesa, estadoPago, items };
}

export function toMesaConPedidosResponse({
  mesa,
  pedidos,
  totalPendiente,
}: MesaConPedidos) {
  return { mesa, totalPendiente, pedidos: pedidos.map(toPedidoEnSalaResponse) };
}
