import { Pedido } from '../entities/pedido.entity';
import { PedidoEstado } from '../enums/pedido-estado.enum';

export const PEDIDO_REPOSITORY = Symbol('PEDIDO_REPOSITORY');

export interface CambioEstadoPedido {
  /** Estado que se leyo antes del cambio: si otro usuario lo movio, falla. */
  estadoAnterior: PedidoEstado;
  pedido: Pedido;
}

export interface PedidoRepository {
  findById(id: string): Promise<Pedido | null>;
  contarItems(pedidoId: string): Promise<number>;
  /**
   * Persiste el nuevo estado solo si el pedido sigue en `estadoAnterior`.
   * Devuelve false si otro cambio se adelanto (escritura concurrente).
   */
  guardarCambioDeEstado(cambio: CambioEstadoPedido): Promise<boolean>;
}
