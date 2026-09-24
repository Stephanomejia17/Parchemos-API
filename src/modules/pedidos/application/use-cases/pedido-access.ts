import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../../../common/enums/role.enum';
import { ForbiddenError } from '../../../../common/errors/forbidden-error';
import { NotFoundError } from '../../../../common/errors/not-found-error';
import { Pedido } from '../../domain/entities/pedido.entity';
import { PEDIDO_REPOSITORY } from '../../domain/repositories/pedido.repository';
import type { PedidoRepository } from '../../domain/repositories/pedido.repository';

export interface Actor {
  id: string;
  role: Role;
}

/** Roles que pueden cambiar el estado de un pedido (siempre sobre su sede). */
export const ROLES_GESTORES: readonly Role[] = [
  Role.PERSONAL_RESTAURANTE,
  Role.RESTAURANTE,
  Role.ADMINISTRADOR,
];

@Injectable()
export class PedidoAccess {
  constructor(
    @Inject(PEDIDO_REPOSITORY) private readonly pedidos: PedidoRepository,
  ) {}

  async findOrFail(pedidoId: string): Promise<Pedido> {
    const pedido = await this.pedidos.findById(pedidoId);
    if (!pedido) {
      throw new NotFoundError('El pedido no existe.', 'ORDER_NOT_FOUND');
    }
    return pedido;
  }

  /**
   * Pueden ver el pedido su comensal, el personal activo de la sede, el dueño
   * del restaurante y el administrador. Para cualquier otro el pedido "no
   * existe": no se revela que el id es valido.
   */
  async findVisibleOrFail(pedidoId: string, actor: Actor): Promise<Pedido> {
    const pedido = await this.findOrFail(pedidoId);
    if (!(await this.puedeVer(pedido, actor))) {
      throw new NotFoundError('El pedido no existe.', 'ORDER_NOT_FOUND');
    }
    return pedido;
  }

  /**
   * GP-08: solo el personal autorizado cambia el estado: el personal activo
   * de la sede del pedido, el dueño del restaurante o el administrador. El
   * personal de otra sede ni siquiera ve el pedido (404); el comensal lo ve,
   * pero no puede gestionarlo (403).
   */
  async findGestionableOrFail(pedidoId: string, actor: Actor): Promise<Pedido> {
    const pedido = await this.findVisibleOrFail(pedidoId, actor);
    if (!ROLES_GESTORES.includes(actor.role)) {
      throw new ForbiddenError(
        'Solo el personal del restaurante puede actualizar el estado del pedido.',
        'ORDER_STATUS_FORBIDDEN',
      );
    }
    return pedido;
  }

  private async puedeVer(pedido: Pedido, actor: Actor): Promise<boolean> {
    switch (actor.role) {
      case Role.ADMINISTRADOR:
        return true;
      case Role.COMENSAL:
        return pedido.perteneceAComensal(actor.id);
      case Role.RESTAURANTE:
      case Role.PERSONAL_RESTAURANTE:
        return this.esDelRestaurante(pedido, actor);
      default:
        return false;
    }
  }

  private esDelRestaurante(pedido: Pedido, actor: Actor): Promise<boolean> {
    return actor.role === Role.RESTAURANTE
      ? this.pedidos.esDuenoDelRestaurante(pedido.restauranteId, actor.id)
      : this.pedidos.esPersonalActivoDeSede(pedido.sedeId, actor.id);
  }
}
