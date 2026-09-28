import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderFulfillment, OrderStatus } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

export type PedidoItemCommand = { productId: string; quantity: number };

@Injectable()
export class PedidosService {
  constructor(private readonly prisma: PrismaService) {}

  async createFromTable(dinerId: string, tableId: string, items: PedidoItemCommand[], notes?: string) {
    if (!items.length) throw new BadRequestException('El pedido debe tener al menos un producto.');
    const table = await this.prisma.diningTable.findUnique({ where: { id: tableId }, select: { status: true, locationId: true, location: { select: { restaurantId: true } } } });
    if (!table || table.status !== 'activa') throw new NotFoundException('La mesa no está disponible para recibir pedidos.');
    const products = await this.prisma.locationProduct.findMany({ where: { locationId: table.locationId, productId: { in: items.map((item) => item.productId) }, isAvailable: true }, include: { product: { select: { name: true, price: true } } } });
    if (products.length !== new Set(items.map((item) => item.productId)).size) throw new BadRequestException('Uno o más productos no están disponibles en esta sede.');
    const byId = new Map(products.map((item) => [item.productId, item]));
    const orderItems = items.map((item) => { const available = byId.get(item.productId)!; const unitPrice = Number(available.priceOverride ?? available.product.price); return { productId: item.productId, productName: available.product.name, unitPrice, quantity: item.quantity, lineTotal: unitPrice * item.quantity }; });
    const total = orderItems.reduce((sum, item) => sum + item.lineTotal, 0);
    return this.prisma.order.create({ data: { locationId: table.locationId, restaurantId: table.location.restaurantId, tableId, dinerId, fulfillment: OrderFulfillment.en_mesa, status: OrderStatus.pendiente, subtotal: total, total, notes, items: { create: orderItems } }, include: { items: true, table: { select: { id: true, code: true } } } });
  }
}
