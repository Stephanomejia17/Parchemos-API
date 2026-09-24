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
    total: pedido.total,
    confirmadoEn: pedido.confirmadoEn,
    entregadoEn: pedido.entregadoEn,
    actualizadoEn: pedido.updatedAt,
  };
}
