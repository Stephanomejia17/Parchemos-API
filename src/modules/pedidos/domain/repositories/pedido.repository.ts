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
  /** Pedidos ya confirmados del comensal, del mas reciente al mas antiguo. */
  findConfirmadosDeComensal(comensalId: string): Promise<Pedido[]>;
  contarItems(pedidoId: string): Promise<number>;
  esDuenoDelRestaurante(
    restauranteId: string,
    userId: string,
  ): Promise<boolean>;
  esPersonalActivoDeSede(sedeId: string, userId: string): Promise<boolean>;
  /**
   * Persiste el nuevo estado solo si el pedido sigue en `estadoAnterior`.
   * Devuelve false si otro cambio se adelanto (escritura concurrente).
   */
  guardarCambioDeEstado(cambio: CambioEstadoPedido): Promise<boolean>;
}
