import { ConflictError } from '../../../../common/errors/conflict-error';
import { PedidoEstado } from '../enums/pedido-estado.enum';

export class TransicionEstadoInvalidaError extends ConflictError {
  constructor(actual: PedidoEstado, destino: PedidoEstado) {
    super(
      `El pedido no puede pasar de "${actual}" a "${destino}".`,
      'INVALID_STATUS_TRANSITION',
      { estadoActual: actual, estadoSolicitado: destino },
    );
  }
}
