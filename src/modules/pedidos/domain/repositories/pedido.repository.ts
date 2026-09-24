import { HistorialEstadoPedido } from '../entities/historial-estado-pedido';
import { Pedido } from '../entities/pedido.entity';
import { PedidoEstado } from '../enums/pedido-estado.enum';

export const PEDIDO_REPOSITORY = Symbol('PEDIDO_REPOSITORY');

export interface CambioEstadoPedido {
  /** Estado que se leyo antes del cambio: si otro usuario lo movio, falla. */
  estadoAnterior: PedidoEstado;
  pedido: Pedido;
  /** Usuario que hizo el cambio; queda en el historial (GP-08 CA6). */
  autorId: string;
  nota?: string | null;
}

export interface PedidoRepository {
  findById(id: string): Promise<Pedido | null>;
  /** Pedidos ya confirmados del comensal, del mas reciente al mas antiguo. */
  findConfirmadosDeComensal(comensalId: string): Promise<Pedido[]>;
  /** Transiciones del pedido en orden cronologico. */
  findHistorial(pedidoId: string): Promise<HistorialEstadoPedido[]>;
  contarItems(pedidoId: string): Promise<number>;
  esDuenoDelRestaurante(
    restauranteId: string,
    userId: string,
  ): Promise<boolean>;
  esPersonalActivoDeSede(sedeId: string, userId: string): Promise<boolean>;
  /**
   * Persiste el nuevo estado solo si el pedido sigue en `estadoAnterior`, y
   * deja en el historial quien lo cambio. Devuelve false si otro cambio se
   * adelanto (escritura concurrente).
   */
  guardarCambioDeEstado(cambio: CambioEstadoPedido): Promise<boolean>;
}
