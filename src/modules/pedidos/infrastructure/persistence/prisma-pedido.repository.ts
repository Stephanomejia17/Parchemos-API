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

  async findConfirmadosDeComensal(comensalId: string): Promise<Pedido[]> {
    const rows = await this.prisma.order.findMany({
      where: { dinerId: comensalId, status: { not: 'borrador' } },
      orderBy: { placedAt: 'desc' },
      take: 50,
      select: PEDIDO_SELECT,
    });
    return rows.map(toPedidoDomain);
  }

  contarItems(pedidoId: string): Promise<number> {
    return this.prisma.orderItem.count({ where: { orderId: pedidoId } });
  }

  async esDuenoDelRestaurante(
    restauranteId: string,
    userId: string,
  ): Promise<boolean> {
    const row = await this.prisma.restaurant.findFirst({
      where: { id: restauranteId, ownerId: userId },
      select: { id: true },
    });
    return row !== null;
  }

  async esPersonalActivoDeSede(
    sedeId: string,
    userId: string,
  ): Promise<boolean> {
    const row = await this.prisma.restaurantStaff.findFirst({
      where: { locationId: sedeId, userId, isActive: true, revokedAt: null },
      select: { id: true },
    });
    return row !== null;
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
        deliveredAt: pedido.entregadoEn,
        updatedAt: pedido.updatedAt,
      },
    });
    return count === 1;
  }
}
