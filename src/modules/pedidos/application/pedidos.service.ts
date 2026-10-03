import {
  BadRequestException,
  Inject,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PEDIDO_REPOSITORY } from '../domain/repositories/pedido.repository';
import type { PedidoRepository } from '../domain/repositories/pedido.repository';
import { ESTADO_INICIAL_PEDIDO } from '../domain/services/pedido-estado-flujo';
import { PEDIDO_EVENTOS } from '../domain/services/pedido-eventos';
import type { PedidoEventos } from '../domain/services/pedido-eventos';

@Injectable()
export class PedidosService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PEDIDO_REPOSITORY) private readonly pedidos: PedidoRepository,
    @Inject(PEDIDO_EVENTOS) private readonly eventos: PedidoEventos,
  ) {}

  async create(
    dinerId: string,
    locationId: string,
    items: { productId: string; quantity: number }[],
    tableId?: string,
  ) {
    const quantities = new Map<string, number>();
    for (const item of items) {
      quantities.set(
        item.productId,
        (quantities.get(item.productId) ?? 0) + item.quantity,
      );
    }
    if ([...quantities.values()].some((quantity) => quantity > 100)) {
      throw new BadRequestException('La cantidad máxima por producto es 100.');
    }

    const pedido = await this.prisma.$transaction(async (tx) => {
      const location = await tx.location.findFirst({
        where: { id: locationId, status: 'activa' },
        select: { id: true, restaurantId: true },
      });
      if (!location) throw new NotFoundException('La sede no está disponible.');

      const table = tableId
        ? await tx.diningTable.findFirst({
            where: { id: tableId, locationId, status: 'activa' },
            select: { id: true },
          })
        : null;
      if (tableId && !table) {
        throw new BadRequestException(
          'La mesa no existe, está inactiva o no pertenece a la sede.',
        );
      }

      const products = await tx.product.findMany({
        where: {
          id: { in: [...quantities.keys()] },
          restaurantId: location.restaurantId,
          status: 'activo',
        },
        include: { availability: { where: { locationId } } },
      });
      if (products.length !== quantities.size) {
        throw new BadRequestException(
          'Uno o más productos ya no están disponibles en esta sede.',
        );
      }

      const unavailable = products.find(
        (product) => product.availability[0]?.isAvailable === false,
      );
      if (unavailable) {
        throw new BadRequestException(
          `“${unavailable.name}” ya no está disponible.`,
        );
      }

      const orderItems = products.map((product) => ({
        productId: product.id,
        productName: product.name,
        unitPrice: product.availability[0]?.priceOverride ?? product.price,
        quantity: quantities.get(product.id)!,
      }));
      const subtotal = orderItems.reduce(
        (sum, item) => sum + item.unitPrice.toNumber() * item.quantity,
        0,
      );
      // Debe coincidir con la tarifa de servicio mostrada en la pantalla de pago.
      const deliveryFee = Math.round(subtotal * 0.1);

      const orderId = randomUUID();
      await tx.order.create({
        data: {
          id: orderId,
          locationId,
          restaurantId: location.restaurantId,
          dinerId,
          tableId: table?.id,
          fulfillment: table ? 'en_mesa' : 'para_llevar',
          status: ESTADO_INICIAL_PEDIDO,
          paymentStatus: 'pendiente',
          deliveryFee,
          placedAt: new Date(),
          items: { create: orderItems },
        },
      });
      // GP-08 CA6: el trigger orders_log_status crea el primer registro del
      // historial; queda a nombre del comensal que confirmó el pedido.
      await tx.orderStatusHistory.updateMany({
        where: { orderId, changedById: null },
        data: { changedById: dinerId },
      });
      const savedOrder = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true, location: { select: { name: true } } },
      });
      if (!savedOrder) {
        throw new InternalServerErrorException(
          'No se pudo confirmar que el pedido quedara guardado. Inténtalo de nuevo.',
        );
      }

      return {
        ...savedOrder,
        orderNumber: savedOrder.orderNumber.toString(),
        subtotal: savedOrder.subtotal.toNumber(),
        deliveryFee: savedOrder.deliveryFee.toNumber(),
        total: savedOrder.total.toNumber(),
        items: savedOrder.items.map((item) => ({
          ...item,
          unitPrice: item.unitPrice.toNumber(),
          lineTotal: item.lineTotal.toNumber(),
        })),
      };
    });

    // GP-05 CA1: el personal de la sede ve el pedido nuevo sin recargar.
    const recibido = await this.pedidos.findById(pedido.id);
    if (recibido) await this.eventos.pedidoRecibido(recibido);
    return pedido;
  }

  async listMine(dinerId: string) {
    const orders = await this.prisma.order.findMany({
      where: { dinerId },
      orderBy: { createdAt: 'desc' },
      include: { items: true, location: { select: { name: true } } },
    });
    return orders.map((order) => ({
      ...order,
      orderNumber: order.orderNumber.toString(),
      subtotal: order.subtotal.toNumber(),
      deliveryFee: order.deliveryFee.toNumber(),
      total: order.total.toNumber(),
      items: order.items.map((item) => ({
        ...item,
        unitPrice: item.unitPrice.toNumber(),
        lineTotal: item.lineTotal.toNumber(),
      })),
    }));
  }
}
