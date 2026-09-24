import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { Pedido } from '../../domain/entities/pedido.entity';
import type {
  CambioEstadoPedido,
  PedidoRepository,
} from '../../domain/repositories/pedido.repository';
import { PEDIDO_SELECT, toPedidoDomain } from './pedido.mapper';

@Injectable()
export class PrismaPedidoRepository implements PedidoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Pedido | null> {
    const row = await this.prisma.order.findUnique({
      where: { id },
      select: PEDIDO_SELECT,
    });
    return row ? toPedidoDomain(row) : null;
  }

  contarItems(pedidoId: string): Promise<number> {
    return this.prisma.orderItem.count({ where: { orderId: pedidoId } });
  }

  async guardarCambioDeEstado({
    estadoAnterior,
    pedido,
  }: CambioEstadoPedido): Promise<boolean> {
    // El trigger orders_log_status registra la transicion en
    // order_status_history al cambiar la columna status.
    const { count } = await this.prisma.order.updateMany({
      where: { id: pedido.id, status: estadoAnterior },
      data: {
        status: pedido.estado,
        placedAt: pedido.confirmadoEn,
        updatedAt: pedido.updatedAt,
      },
    });
    return count === 1;
  }
}
