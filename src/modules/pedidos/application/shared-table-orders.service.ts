import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PedidoAccess } from './use-cases/pedido-access';
import type { Actor } from './use-cases/pedido-access';
import { PEDIDO_REPOSITORY } from '../domain/repositories/pedido.repository';
import type { PedidoRepository } from '../domain/repositories/pedido.repository';
import { ESTADO_INICIAL_PEDIDO } from '../domain/services/pedido-estado-flujo';
import { PEDIDO_EVENTOS } from '../domain/services/pedido-eventos';
import type { PedidoEventos } from '../domain/services/pedido-eventos';
import type { SharedTableOrderItemDto } from './dto/shared-table-order.dto';

@Injectable()
export class SharedTableOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PEDIDO_REPOSITORY) private readonly pedidos: PedidoRepository,
    @Inject(PEDIDO_EVENTOS) private readonly eventos: PedidoEventos,
    private readonly access: PedidoAccess,
  ) {}

  async join(tableId: string, userId: string) {
    const table = await this.prisma.$transaction(async (tx) => {
      const table = await tx.diningTable.findFirst({
        where: { id: tableId, status: 'activa' },
        select: { id: true, code: true, locationId: true },
      });
      if (!table) throw new NotFoundException('La mesa no está disponible.');

      await tx.$queryRaw`SELECT id FROM public.dining_tables WHERE id = ${tableId}::uuid FOR UPDATE`;
      const stillAvailable = await tx.diningTable.findFirst({
        where: { id: tableId, status: 'activa' },
        select: { id: true },
      });
      if (!stillAvailable) {
        throw new NotFoundException('La mesa no está disponible.');
      }
      let session = await tx.sharedTableOrder.findFirst({
        where: { tableId, status: 'abierto' },
        select: { id: true },
      });
      if (!session) {
        session = await tx.sharedTableOrder.create({
          data: { tableId },
          select: { id: true },
        });
      }

      const linked = await tx.sharedTableParticipant.findFirst({
        where: {
          userId,
          session: { tableId, status: { in: ['abierto', 'enviado'] } },
        },
        select: { id: true },
      });
      if (!linked) {
        await tx.sharedTableParticipant.upsert({
          where: { sessionId_userId: { sessionId: session.id, userId } },
          create: { sessionId: session.id, userId },
          update: {},
        });
      }
      return table;
    });
    await this.publish(table.locationId, tableId);
    return this.get(tableId, userId);
  }

  async get(tableId: string, userId: string) {
    const session = await this.prisma.sharedTableOrder.findFirst({
      where: {
        tableId,
        participants: { some: { userId } },
        status: { in: ['abierto', 'enviado'] },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        table: { select: { id: true, code: true, locationId: true } },
        payer: {
          select: { id: true, profile: { select: { fullName: true } } },
        },
        participants: {
          orderBy: { joinedAt: 'asc' },
          include: {
            user: {
              select: {
                id: true,
                profile: { select: { fullName: true } },
              },
            },
          },
        },
        items: {
          orderBy: { createdAt: 'asc' },
          include: {
            contributor: {
              select: {
                id: true,
                profile: { select: { fullName: true } },
              },
            },
          },
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            paymentStatus: true,
            total: true,
          },
        },
      },
    });
    if (!session)
      throw new NotFoundException('No estás vinculado a esta mesa.');

    return {
      sessionId: session.id,
      status: session.status,
      table: {
        id: session.table.id,
        code: session.table.code,
        locationId: session.table.locationId,
      },
      payer: session.payer
        ? {
            id: session.payer.id,
            name: session.payer.profile?.fullName ?? 'Comensal',
          }
        : null,
      participants: session.participants.map((participant) => ({
        id: participant.userId,
        name: participant.user.profile?.fullName ?? 'Comensal',
        contributed: participant.contributedAt !== null,
        isPayer: participant.userId === session.payerId,
      })),
      items: session.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toNumber(),
        subtotal: item.unitPrice.toNumber() * item.quantity,
        contributorId: item.contributorId,
        contributorName: item.contributor.profile?.fullName ?? 'Comensal',
      })),
      order: session.order
        ? {
            id: session.order.id,
            number: session.order.orderNumber.toString(),
            status: session.order.status,
            paymentStatus: session.order.paymentStatus,
            total: session.order.total.toNumber(),
          }
        : null,
    };
  }

  async replaceContribution(
    tableId: string,
    userId: string,
    items: SharedTableOrderItemDto[],
  ) {
    const session = await this.findOpenParticipantSession(tableId, userId);
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

    const table = await this.prisma.diningTable.findUniqueOrThrow({
      where: { id: tableId },
      select: {
        locationId: true,
        location: { select: { restaurantId: true } },
      },
    });
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: [...quantities.keys()] },
        restaurantId: table.location.restaurantId,
        status: 'activo',
      },
      include: { availability: { where: { locationId: table.locationId } } },
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

    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.sharedTableOrder.updateMany({
        where: { id: session.id, status: 'abierto' },
        data: { status: 'actualizando' },
      });
      if (locked.count !== 1) {
        throw new BadRequestException(
          'El pedido compartido ya fue confirmado.',
        );
      }
      await tx.sharedTableOrderItem.deleteMany({
        where: { sessionId: session.id, contributorId: userId },
      });
      if (products.length) {
        await tx.sharedTableOrderItem.createMany({
          data: products.map((product) => ({
            sessionId: session.id,
            contributorId: userId,
            productId: product.id,
            productName: product.name,
            unitPrice: product.availability[0]?.priceOverride ?? product.price,
            quantity: quantities.get(product.id)!,
          })),
        });
      }
      await tx.sharedTableParticipant.update({
        where: { sessionId_userId: { sessionId: session.id, userId } },
        data: { contributedAt: new Date() },
      });
      await tx.sharedTableOrder.update({
        where: { id: session.id },
        data: { status: 'abierto' },
      });
    });
    await this.publish(table.locationId, tableId);
    return this.get(tableId, userId);
  }

  async setPayer(tableId: string, userId: string, payerId: string) {
    const session = await this.findOpenParticipantSession(tableId, userId);
    const payerIsParticipant =
      await this.prisma.sharedTableParticipant.findUnique({
        where: { sessionId_userId: { sessionId: session.id, userId: payerId } },
        select: { id: true },
      });
    if (!payerIsParticipant) {
      throw new BadRequestException(
        'La persona responsable debe estar vinculada a esta mesa.',
      );
    }
    const updated = await this.prisma.sharedTableOrder.updateMany({
      where: {
        id: session.id,
        status: 'abierto',
        participants: { some: { userId: payerId } },
      },
      data: { payerId },
    });
    if (updated.count !== 1) {
      throw new BadRequestException('El pedido compartido ya fue confirmado.');
    }
    const locationId = await this.locationForSession(session.id);
    await this.publish(locationId, tableId);
    return this.get(tableId, userId);
  }

  async submit(tableId: string, userId: string) {
    const session = await this.findOpenParticipantSession(tableId, userId);
    if (session.payerId !== userId) {
      throw new ForbiddenException(
        'Solo la persona responsable del pago puede confirmar el pedido compartido.',
      );
    }

    const orderId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.sharedTableOrder.updateMany({
        where: { id: session.id, status: 'abierto', payerId: userId },
        data: { status: 'confirmando' },
      });
      if (locked.count !== 1) {
        throw new BadRequestException(
          'El pedido compartido ya fue confirmado.',
        );
      }
      const current = await tx.sharedTableOrder.findFirst({
        where: { id: session.id, status: 'confirmando', payerId: userId },
        include: {
          table: {
            select: {
              id: true,
              locationId: true,
              location: { select: { restaurantId: true } },
            },
          },
          items: {
            include: {
              contributor: {
                select: {
                  profile: { select: { fullName: true } },
                },
              },
            },
          },
        },
      });
      if (!current) {
        throw new BadRequestException(
          'El pedido compartido ya fue confirmado.',
        );
      }
      if (current.items.length === 0) {
        throw new BadRequestException('Agrega productos antes de confirmar.');
      }
      const subtotal = current.items.reduce(
        (sum, item) => sum + item.unitPrice.toNumber() * item.quantity,
        0,
      );
      const availableProducts = await tx.product.findMany({
        where: {
          id: { in: [...new Set(current.items.map((item) => item.productId))] },
          restaurantId: current.table.location.restaurantId,
          status: 'activo',
        },
        include: {
          availability: { where: { locationId: current.table.locationId } },
        },
      });
      if (
        availableProducts.length !==
        new Set(current.items.map((item) => item.productId)).size
      ) {
        throw new BadRequestException(
          'Uno o más productos del pedido ya no están disponibles.',
        );
      }
      const unavailable = availableProducts.find(
        (product) => product.availability[0]?.isAvailable === false,
      );
      if (unavailable) {
        throw new BadRequestException(
          `“${unavailable.name}” ya no está disponible.`,
        );
      }
      const deliveryFee = Math.round(subtotal * 0.1);
      await tx.order.create({
        data: {
          id: orderId,
          locationId: current.table.locationId,
          restaurantId: current.table.location.restaurantId,
          dinerId: userId,
          tableId: current.table.id,
          fulfillment: 'en_mesa',
          status: ESTADO_INICIAL_PEDIDO,
          paymentStatus: 'pendiente',
          deliveryFee,
          placedAt: new Date(),
          items: {
            create: current.items.map((item) => ({
              productId: item.productId,
              productName: item.productName,
              unitPrice: item.unitPrice,
              quantity: item.quantity,
              contributorId: item.contributorId,
              contributorName: item.contributor.profile?.fullName ?? 'Comensal',
            })),
          },
        },
      });
      await tx.orderStatusHistory.updateMany({
        where: { orderId, changedById: null },
        data: { changedById: userId },
      });
      await tx.sharedTableOrder.update({
        where: { id: current.id },
        data: { orderId, status: 'enviado', submittedAt: new Date() },
      });
    });

    const pedido = await this.pedidos.findById(orderId);
    if (!pedido)
      throw new NotFoundException('No se pudo cargar el pedido creado.');
    await this.eventos.pedidoRecibido(pedido);
    const locationId = await this.locationForSession(session.id);
    await this.publish(locationId, tableId);
    return this.get(tableId, userId);
  }

  async closeOccupancy(tableId: string, actor: Actor) {
    const table = await this.prisma.diningTable.findUnique({
      where: { id: tableId },
      select: { id: true, locationId: true },
    });
    if (!table) throw new NotFoundException('La mesa no existe.');
    await this.access.assertPuedeGestionarSede(table.locationId, actor);

    const participants = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM public.dining_tables WHERE id = ${tableId}::uuid FOR UPDATE`;
      const sessions = await tx.sharedTableOrder.findMany({
        where: { tableId, status: { in: ['abierto', 'enviado'] } },
        select: {
          id: true,
          participants: { select: { userId: true } },
          order: {
            select: {
              id: true,
              status: true,
              total: true,
              paymentStatus: true,
              payments: {
                where: { status: 'aprobado' },
                select: { amount: true },
              },
            },
          },
          ordersInSession: {
            select: {
              id: true,
              status: true,
              total: true,
              paymentStatus: true,
              payments: {
                where: { status: 'aprobado' },
                select: { amount: true },
              },
            },
          },
        },
      });
      const legacyOrders = await tx.order.findMany({
        where: {
          tableId,
          tableSessionId: null,
          status: { not: 'borrador' },
        },
        select: {
          id: true,
          status: true,
          total: true,
          paymentStatus: true,
          payments: {
            where: { status: 'aprobado' },
            select: { amount: true },
          },
        },
      });
      if (sessions.length === 0 && legacyOrders.length === 0) {
        throw new BadRequestException('La mesa no tiene una ocupación activa.');
      }

      const ordersById = new Map(
        sessions
          .flatMap((session) => [
            ...session.ordersInSession,
            ...(session.order ? [session.order] : []),
          ])
          .concat(legacyOrders)
          .map((order) => [order.id, order]),
      );
      const orders = [...ordersById.values()];
      if (
        orders.some(
          (order) =>
            order.status !== 'entregado' && order.status !== 'cancelado',
        )
      ) {
        throw new BadRequestException(
          'Finaliza o cancela todos los pedidos de la mesa antes de cerrar la ocupación.',
        );
      }

      for (const order of orders) {
        if (order.status === 'cancelado') continue;
        const paid = order.payments.reduce(
          (total, payment) => total + payment.amount.toNumber(),
          0,
        );
        const remaining = Math.max(0, order.total.toNumber() - paid);
        if (remaining > 0) {
          await tx.payment.create({
            data: {
              orderId: order.id,
              payerId: actor.id,
              method: 'efectivo',
              status: 'aprobado',
              amount: remaining,
              authorizedAt: new Date(),
              idempotencyKey: `table-cash:${tableId}:${order.id}`,
            },
          });
        }
        if (order.paymentStatus !== 'pagado') {
          await tx.order.update({
            where: { id: order.id },
            data: { paymentStatus: 'pagado' },
          });
        }
      }

      if (sessions.length > 0) {
        await tx.sharedTableOrder.updateMany({
          where: {
            id: { in: sessions.map(({ id }) => id) },
            status: { in: ['abierto', 'enviado'] },
          },
          data: { status: 'cerrado' },
        });
      }
      return [
        ...new Set(
          sessions.flatMap((session) =>
            session.participants.map(({ userId }) => userId),
          ),
        ),
      ];
    });

    await this.eventos.mesaCompartidaActualizada({
      sedeId: table.locationId,
      mesaId: tableId,
      participantes: participants,
    });
    return { tableId, status: 'cerrado' as const };
  }

  private async findOpenParticipantSession(tableId: string, userId: string) {
    const participant = await this.prisma.sharedTableParticipant.findFirst({
      where: { userId, session: { tableId, status: 'abierto' } },
      include: { session: { select: { id: true, payerId: true } } },
      orderBy: { joinedAt: 'desc' },
    });
    if (!participant) {
      throw new NotFoundException(
        'No estás vinculado a esta mesa. Escanea su código QR para continuar.',
      );
    }
    return participant.session;
  }

  private async locationForSession(sessionId: string): Promise<string> {
    const session = await this.prisma.sharedTableOrder.findUnique({
      where: { id: sessionId },
      select: { table: { select: { locationId: true } } },
    });
    if (!session)
      throw new NotFoundException('La sesión de la mesa ya no existe.');
    return session.table.locationId;
  }

  private async publish(locationId: string, tableId: string): Promise<void> {
    const participants = await this.prisma.sharedTableParticipant.findMany({
      where: { session: { tableId, status: { in: ['abierto', 'enviado'] } } },
      select: { userId: true },
    });
    await this.eventos.mesaCompartidaActualizada({
      sedeId: locationId,
      mesaId: tableId,
      participantes: [...new Set(participants.map(({ userId }) => userId))],
    });
  }
}
