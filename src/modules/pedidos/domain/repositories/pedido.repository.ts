import { Pedido } from '../entities/pedido.entity';

export const PEDIDO_REPOSITORY = Symbol('PEDIDO_REPOSITORY');

export interface PedidoRepository {
  findById(id: string): Promise<Pedido | null>;
  findByComensalId(comensalId: string): Promise<Pedido[]>;
  findByRestauranteId(restauranteId: string): Promise<Pedido[]>;
  save(pedido: Pedido): Promise<Pedido>;
}
