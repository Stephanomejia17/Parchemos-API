import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { PedidoRepository } from '../domain/repositories/pedido.repository';
import type { PedidoEventos } from '../domain/services/pedido-eventos';
import type { PedidoAccess } from './use-cases/pedido-access';
import { SharedTableOrdersService } from './shared-table-orders.service';

function setup() {
  const tx = {
    $queryRaw: jest.fn(),
    sharedTableOrder: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    payment: { create: jest.fn() },
    order: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
    diningTable: { findUnique: jest.fn() },
    sharedTableParticipant: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({
        session: { id: 'session-1', payerId: 'payer-1' },
      }),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    sharedTableOrder: {
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
    sharedTableOrderItem: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    product: { findMany: jest.fn() },
  };
  const repository = { findById: jest.fn() };
  const events = {
    pedidoRecibido: jest.fn(),
    mesaCompartidaActualizada: jest.fn(),
  };
  const access = { assertPuedeGestionarSede: jest.fn() };
  const service = new SharedTableOrdersService(
    prisma as unknown as PrismaService,
    repository as unknown as PedidoRepository,
    events as unknown as PedidoEventos,
    access as unknown as PedidoAccess,
  );
  return { prisma, tx, access, service, events };
}

describe('SharedTableOrdersService', () => {
  it('solo permite confirmar a quien fue designado como responsable', async () => {
    const { prisma, service } = setup();

    await expect(service.submit('table-1', 'other-user')).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('solo permite asignar como responsable a una persona vinculada', async () => {
    const { prisma, service } = setup();

    await expect(
      service.setPayer('table-1', 'participant-1', 'outsider'),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.sharedTableOrder.update).not.toHaveBeenCalled();
  });

  it('rechaza cantidades agregadas mayores al máximo por producto', async () => {
    const { prisma, service } = setup();

    await expect(
      service.replaceContribution('table-1', 'participant-1', [
        { productId: 'product-1', quantity: 60 },
        { productId: 'product-1', quantity: 50 },
      ]),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('confirma el pago presencial y cierra la ocupación sin borrar su historial', async () => {
    const { prisma, tx, access, service, events } = setup();
    prisma.diningTable.findUnique.mockResolvedValue({
      id: 'table-1',
      locationId: 'location-1',
    });
    tx.sharedTableOrder.findMany.mockResolvedValue([
      {
        id: 'session-1',
        participants: [{ userId: 'diner-1' }],
        order: null,
        ordersInSession: [
          {
            id: 'order-1',
            status: 'entregado',
            total: { toNumber: () => 25 },
            paymentStatus: 'pendiente',
            payments: [],
          },
        ],
      },
    ]);

    const result = await service.closeOccupancy('table-1', {
      id: 'staff-1',
      role: 'personal_restaurante',
    });

    expect(result).toEqual({ tableId: 'table-1', status: 'cerrado' });
    expect(access.assertPuedeGestionarSede).toHaveBeenCalledWith('location-1', {
      id: 'staff-1',
      role: 'personal_restaurante',
    });
    expect(tx.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'order-1',
        payerId: 'staff-1',
        method: 'efectivo',
        status: 'aprobado',
        amount: 25,
        idempotencyKey: 'table-cash:table-1:order-1',
      }),
    });
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { paymentStatus: 'pagado' },
    });
    expect(tx.sharedTableOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'cerrado' } }),
    );
    expect(events.mesaCompartidaActualizada).toHaveBeenCalledWith({
      sedeId: 'location-1',
      mesaId: 'table-1',
      participantes: ['diner-1'],
    });
    expect(prisma.sharedTableParticipant).not.toHaveProperty('deleteMany');
  });

  it('no permite liberar una mesa con pedidos todavía en curso', async () => {
    const { prisma, tx, service } = setup();
    prisma.diningTable.findUnique.mockResolvedValue({
      id: 'table-1',
      locationId: 'location-1',
    });
    tx.sharedTableOrder.findMany.mockResolvedValue([
      {
        id: 'session-1',
        participants: [],
        order: null,
        ordersInSession: [
          {
            id: 'order-1',
            status: 'en_preparacion',
            total: { toNumber: () => 25 },
            paymentStatus: 'pendiente',
            payments: [],
          },
        ],
      },
    ]);

    await expect(
      service.closeOccupancy('table-1', {
        id: 'staff-1',
        role: 'personal_restaurante',
      }),
    ).rejects.toThrow('Finaliza o cancela todos los pedidos');
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(tx.sharedTableOrder.updateMany).not.toHaveBeenCalled();
  });

  it('cierra una ocupación legacy con saldo pendiente aunque no tenga sesión compartida', async () => {
    const { prisma, tx, service, events } = setup();
    prisma.diningTable.findUnique.mockResolvedValue({
      id: 'table-1',
      locationId: 'location-1',
    });
    tx.order.findMany.mockResolvedValue([
      {
        id: 'legacy-order-1',
        status: 'entregado',
        total: { toNumber: () => 35 },
        paymentStatus: 'pendiente',
        payments: [],
      },
    ]);

    await expect(
      service.closeOccupancy('table-1', {
        id: 'staff-1',
        role: 'personal_restaurante',
      }),
    ).resolves.toEqual({ tableId: 'table-1', status: 'cerrado' });

    expect(tx.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'legacy-order-1',
        amount: 35,
        idempotencyKey: 'table-cash:table-1:legacy-order-1',
      }),
    });
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'legacy-order-1' },
      data: { paymentStatus: 'pagado' },
    });
    expect(tx.sharedTableOrder.updateMany).not.toHaveBeenCalled();
    expect(events.mesaCompartidaActualizada).toHaveBeenCalledWith({
      sedeId: 'location-1',
      mesaId: 'table-1',
      participantes: [],
    });
  });
});
