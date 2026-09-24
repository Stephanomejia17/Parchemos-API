import { Inject, Injectable } from '@nestjs/common';
import { Pedido } from '../../domain/entities/pedido.entity';
import { PEDIDO_REPOSITORY } from '../../domain/repositories/pedido.repository';
import type { PedidoRepository } from '../../domain/repositories/pedido.repository';
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

/** Pedidos del comensal con su estado, para listarlos y hacerles seguimiento. */
@Injectable()
export class ListarMisPedidosUseCase {
  constructor(
    @Inject(PEDIDO_REPOSITORY) private readonly pedidos: PedidoRepository,
  ) {}

  execute(comensalId: string): Promise<Pedido[]> {
    return this.pedidos.findConfirmadosDeComensal(comensalId);
  }
}
