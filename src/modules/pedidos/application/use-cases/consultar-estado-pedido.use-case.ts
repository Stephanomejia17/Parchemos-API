import { Injectable } from '@nestjs/common';
import { Pedido } from '../../domain/entities/pedido.entity';
import { PedidoAccess } from './pedido-access';
import type { Actor } from './pedido-access';

/** GP-08 CA2: el comensal (o el restaurante) consulta el estado actual. */
@Injectable()
export class ConsultarEstadoPedidoUseCase {
  constructor(private readonly access: PedidoAccess) {}

  execute(pedidoId: string, actor: Actor): Promise<Pedido> {
    return this.access.findVisibleOrFail(pedidoId, actor);
  }
}
