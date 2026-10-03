import { Inject, Injectable } from '@nestjs/common';
import { ConflictError } from '../../../../common/errors/conflict-error';
import { Pedido } from '../../domain/entities/pedido.entity';
import { PedidoEstado } from '../../domain/enums/pedido-estado.enum';
import { PEDIDO_REPOSITORY } from '../../domain/repositories/pedido.repository';
import type { PedidoRepository } from '../../domain/repositories/pedido.repository';
import { PEDIDO_EVENTOS } from '../../domain/services/pedido-eventos';
import type { PedidoEventos } from '../../domain/services/pedido-eventos';
import { PedidoAccess } from './pedido-access';
import type { Actor } from './pedido-access';

export interface CambiarEstadoCommand {
  estado: PedidoEstado;
  /** Comentario opcional que queda en el historial. */
  nota?: string;
}

/** GP-08 CA3: el restaurante avanza el pedido por el flujo (p. ej. a "Listo"). */
@Injectable()
export class CambiarEstadoPedidoUseCase {
  constructor(
    private readonly access: PedidoAccess,
    @Inject(PEDIDO_REPOSITORY) private readonly pedidos: PedidoRepository,
    @Inject(PEDIDO_EVENTOS) private readonly eventos: PedidoEventos,
  ) {}

  async execute(
    pedidoId: string,
    actor: Actor,
    command: CambiarEstadoCommand,
  ): Promise<Pedido> {
    const pedido = await this.access.findGestionableOrFail(pedidoId, actor);

    const estadoAnterior = pedido.estado;
    pedido.cambiarEstado(command.estado, new Date());

    const guardado = await this.pedidos.guardarCambioDeEstado({
      estadoAnterior,
      pedido,
      autorId: actor.id,
      nota: command.nota,
    });
    if (!guardado) {
      throw new ConflictError(
        'Otro usuario actualizó este pedido. Recarga para ver su estado actual.',
        'ORDER_STATUS_CHANGED',
      );
    }

    await this.eventos.estadoActualizado({
      pedido,
      estadoAnterior,
      autorId: actor.id,
    });
    return pedido;
  }
}
