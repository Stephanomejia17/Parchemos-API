import { PedidoEstado } from '../enums/pedido-estado.enum';
import { PedidoModalidad } from '../enums/pedido-modalidad.enum';

/**
 * GP-08 CA1: estado que recibe un pedido cuando el comensal lo confirma.
 * `borrador` es el carrito en construccion (GP-01); `pendiente` significa que
 * el restaurante ya lo recibio y aun no lo atiende.
 */
export const ESTADO_INICIAL_PEDIDO = PedidoEstado.PENDIENTE;

/**
 * Transiciones permitidas. El personal puede saltarse pasos intermedios de la
 * cocina (p. ej. marcar como listo un pedido pendiente), pero nunca retroceder.
 */
const TRANSICIONES: Record<PedidoEstado, readonly PedidoEstado[]> = {
  [PedidoEstado.BORRADOR]: [PedidoEstado.PENDIENTE],
  [PedidoEstado.PENDIENTE]: [
    PedidoEstado.CONFIRMADO,
    PedidoEstado.EN_PREPARACION,
    PedidoEstado.LISTO,
  ],
  [PedidoEstado.CONFIRMADO]: [PedidoEstado.EN_PREPARACION, PedidoEstado.LISTO],
  [PedidoEstado.EN_PREPARACION]: [PedidoEstado.LISTO],
  [PedidoEstado.LISTO]: [PedidoEstado.EN_CAMINO, PedidoEstado.ENTREGADO],
  [PedidoEstado.EN_CAMINO]: [PedidoEstado.ENTREGADO],
  [PedidoEstado.ENTREGADO]: [],
  [PedidoEstado.CANCELADO]: [],
};

export const ESTADOS_FINALES: readonly PedidoEstado[] = [
  PedidoEstado.ENTREGADO,
  PedidoEstado.CANCELADO,
];

/**
 * Siguientes estados validos. `en_camino` solo aplica a domicilio, y un
 * domicilio no puede pasar a entregado sin haber salido del restaurante.
 */
export function siguientesEstados(
  actual: PedidoEstado,
  modalidad: PedidoModalidad,
): PedidoEstado[] {
  return TRANSICIONES[actual].filter((destino) => {
    if (destino === PedidoEstado.EN_CAMINO) {
      return modalidad === PedidoModalidad.DOMICILIO;
    }
    if (actual === PedidoEstado.LISTO && destino === PedidoEstado.ENTREGADO) {
      return modalidad !== PedidoModalidad.DOMICILIO;
    }
    return true;
  });
}

export function esTransicionValida(
  actual: PedidoEstado,
  destino: PedidoEstado,
  modalidad: PedidoModalidad,
): boolean {
  return siguientesEstados(actual, modalidad).includes(destino);
}
