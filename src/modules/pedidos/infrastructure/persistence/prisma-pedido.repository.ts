import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { Role } from '../../../../common/enums/role.enum';
import { HistorialEstadoPedido } from '../../domain/entities/historial-estado-pedido';
import { Pedido } from '../../domain/entities/pedido.entity';
import { PedidoEstado } from '../../domain/enums/pedido-estado.enum';
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
    autorId,
    nota,
  }: CambioEstadoPedido): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id: pedido.id, status: estadoAnterior },
        data: {
          status: pedido.estado,
          placedAt: pedido.confirmadoEn,
          deliveredAt: pedido.entregadoEn,
          updatedAt: pedido.updatedAt,
        },
      });
      if (count !== 1) return false;

      // El trigger orders_log_status ya inserto la transicion en
      // order_status_history, pero no sabe quien la hizo: se completa aqui,
      // dentro de la misma transaccion.
      const registro = await tx.orderStatusHistory.findFirst({
        where: {
          orderId: pedido.id,
          toStatus: pedido.estado,
          changedById: null,
        },
        orderBy: { id: 'desc' },
        select: { id: true },
      });
      if (registro) {
        await tx.orderStatusHistory.update({
          where: { id: registro.id },
          data: { changedById: autorId, note: nota ?? null },
        });
      }
      return true;
    });
  }

  async findHistorial(pedidoId: string): Promise<HistorialEstadoPedido[]> {
    const rows = await this.prisma.orderStatusHistory.findMany({
      where: { orderId: pedidoId },
      orderBy: { id: 'asc' },
      select: {
        fromStatus: true,
        toStatus: true,
        createdAt: true,
        note: true,
        changedBy: { select: { role: true } },
      },
    });
    return rows.map((row) => ({
      desde: row.fromStatus as PedidoEstado | null,
      hacia: row.toStatus as PedidoEstado,
      fecha: row.createdAt,
      cambiadoPorRol: (row.changedBy?.role as Role | undefined) ?? null,
      nota: row.note,
    }));
  }
}
