import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { PedidoEstado } from '../../domain/enums/pedido-estado.enum';
import type {
  EstadoPedidoActualizado,
  PedidoEventos,
} from '../../domain/services/pedido-eventos';
import { toPedidoEstadoResponse } from '../http/pedido.presenter';
import { EVENTO_ESTADO_PEDIDO, PedidosGateway } from './pedidos.gateway';

const MENSAJES: Partial<Record<PedidoEstado, string>> = {
  [PedidoEstado.CONFIRMADO]: 'El restaurante confirmó tu pedido.',
  [PedidoEstado.EN_PREPARACION]: 'Tu pedido se está preparando.',
  [PedidoEstado.LISTO]: '¡Tu pedido está listo!',
  [PedidoEstado.EN_CAMINO]: 'Tu pedido va en camino.',
  [PedidoEstado.ENTREGADO]: 'Tu pedido fue entregado. ¡Buen provecho!',
  [PedidoEstado.CANCELADO]: 'Tu pedido fue cancelado.',
};

/**
 * Publica el cambio de estado por socket al comensal y deja la notificacion
 * guardada en su bandeja (tabla notifications), para que la vea aunque no
 * estuviera conectado en ese momento.
 */
@Injectable()
export class SocketPedidoEventos implements PedidoEventos {
  private readonly logger = new Logger(SocketPedidoEventos.name);

  constructor(
    private readonly gateway: PedidosGateway,
    private readonly prisma: PrismaService,
  ) {}

  async estadoActualizado({
    pedido,
    estadoAnterior,
    autorId,
  }: EstadoPedidoActualizado): Promise<void> {
    const comensalId = pedido.comensalId;
    // Sin comensal (pedido tomado por el mesero) o cambio hecho por el propio
    // comensal: no hay a quien avisar.
    if (!comensalId || comensalId === autorId) return;

    const payload = {
      ...toPedidoEstadoResponse(pedido),
      estadoAnterior,
    };

    try {
      const notificacion = await this.prisma.notification.create({
        data: {
          userId: comensalId,
          type: EVENTO_ESTADO_PEDIDO,
          title: `Pedido #${pedido.numero}`,
          body: MENSAJES[pedido.estado] ?? 'Tu pedido cambió de estado.',
          entityType: 'order',
          entityId: pedido.id,
          data: { estadoAnterior, estado: pedido.estado },
        },
        select: { id: true },
      });
      this.gateway.emitirAUsuario(comensalId, EVENTO_ESTADO_PEDIDO, {
        ...payload,
        notificacionId: notificacion.id,
      });
    } catch (error) {
      this.logger.error(
        `No se pudo notificar el cambio del pedido ${pedido.id}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }
}
