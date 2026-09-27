import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

@Injectable()
export class PedidosService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    dinerId: string,
    locationId: string,
    items: { productId: string; quantity: number }[],
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

    return this.prisma.$transaction(async (tx) => {
      const location = await tx.location.findFirst({
        where: { id: locationId, status: 'activa' },
        select: { id: true, restaurantId: true },
      });
      if (!location) throw new NotFoundException('La sede no está disponible.');

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

      const order = await tx.order.create({
        data: {
          locationId,
          restaurantId: location.restaurantId,
          dinerId,
          fulfillment: 'para_llevar',
          status: 'pendiente',
          paymentStatus: 'pendiente',
          deliveryFee,
          placedAt: new Date(),
          items: { create: orderItems },
        },
      });
      const savedOrder = await tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { items: true, location: { select: { name: true } } },
      });

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
