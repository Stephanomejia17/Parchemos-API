import { Inject, Injectable } from '@nestjs/common';
import { ConflictError } from '../../../../common/errors/conflict-error';
import { ForbiddenError } from '../../../../common/errors/forbidden-error';
import { NotFoundError } from '../../../../common/errors/not-found-error';
import { ValidationError } from '../../../../common/errors/validation-error';
import { Pedido } from '../../domain/entities/pedido.entity';
import { PEDIDO_REPOSITORY } from '../../domain/repositories/pedido.repository';
import type { PedidoRepository } from '../../domain/repositories/pedido.repository';

/**
 * GP-08 CA1: al confirmar el carrito, el pedido recibe el estado inicial del
 * flujo. El armado del carrito (borrador) es responsabilidad de GP-01.
 */
@Injectable()
export class ConfirmarPedidoUseCase {
  constructor(
    @Inject(PEDIDO_REPOSITORY) private readonly pedidos: PedidoRepository,
  ) {}

  async execute(pedidoId: string, comensalId: string): Promise<Pedido> {
    const pedido = await this.pedidos.findById(pedidoId);
    if (!pedido) {
      throw new NotFoundError('El pedido no existe.', 'ORDER_NOT_FOUND');
    }
    if (!pedido.perteneceAComensal(comensalId)) {
      throw new ForbiddenError('Este pedido no te pertenece.');
    }
    if ((await this.pedidos.contarItems(pedidoId)) === 0) {
      throw new ValidationError(
        'Agrega al menos un producto antes de confirmar el pedido.',
        'ORDER_EMPTY',
      );
    }

    const estadoAnterior = pedido.estado;
    pedido.confirmar(new Date());

    const guardado = await this.pedidos.guardarCambioDeEstado({
      estadoAnterior,
      pedido,
    });
    if (!guardado) {
      throw new ConflictError(
        'El pedido cambió mientras lo confirmabas. Vuelve a intentarlo.',
        'ORDER_STATUS_CHANGED',
      );
    }
    return pedido;
  }
}
