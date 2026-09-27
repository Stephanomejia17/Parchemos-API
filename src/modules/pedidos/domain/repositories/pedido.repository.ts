import { HistorialEstadoPedido } from '../entities/historial-estado-pedido';
import { Pedido } from '../entities/pedido.entity';
import { PedidoEnSala } from '../entities/pedido-en-sala';
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
  /** Pedidos confirmados y aún no finalizados de una sede, del más antiguo al más reciente. */
  findEnCursoDeSede(sedeId: string): Promise<Pedido[]>;
  /** GP-05: pedidos en curso de la sede con su mesa y sus productos. */
  findEnSalaDeSede(sedeId: string): Promise<PedidoEnSala[]>;
  /** Restaurante al que pertenece la sede, o null si la sede no existe. */
  restauranteDeSede(sedeId: string): Promise<string | null>;
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
