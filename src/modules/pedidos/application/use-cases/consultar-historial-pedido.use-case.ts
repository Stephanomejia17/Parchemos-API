import { Inject, Injectable } from '@nestjs/common';
import { HistorialEstadoPedido } from '../../domain/entities/historial-estado-pedido';
import { PEDIDO_REPOSITORY } from '../../domain/repositories/pedido.repository';
import type { PedidoRepository } from '../../domain/repositories/pedido.repository';
import { PedidoAccess } from './pedido-access';
import type { Actor } from './pedido-access';

/** GP-08 CA6: trazabilidad de los cambios de estado de un pedido. */
@Injectable()
export class ConsultarHistorialPedidoUseCase {
  constructor(
    private readonly access: PedidoAccess,
    @Inject(PEDIDO_REPOSITORY) private readonly pedidos: PedidoRepository,
  ) {}

  async execute(
    pedidoId: string,
    actor: Actor,
  ): Promise<HistorialEstadoPedido[]> {
    await this.access.findVisibleOrFail(pedidoId, actor);
    return this.pedidos.findHistorial(pedidoId);
  }
}
