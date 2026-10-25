import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { PedidoRepository } from '../domain/repositories/pedido.repository';
import type { PedidoEventos } from '../domain/services/pedido-eventos';
import { PedidosService } from './pedidos.service';

const decimal = (value: number) => ({ toNumber: () => value });

function setup() {
  const savedOrder = {
    id: 'order-1',
    orderNumber: 1n,
    subtotal: decimal(50),
    deliveryFee: decimal(5),
    total: decimal(55),
    items: [
      {
        id: 'item-1',
        unitPrice: decimal(50),
        lineTotal: decimal(50),
      },
    ],
  };
  const tx = {
    location: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'location-1',
        restaurantId: 'restaurant-1',
      }),
    },
    diningTable: {
      findFirst: jest.fn().mockResolvedValue({ id: 'table-1' }),
    },
    $queryRaw: jest.fn(),
    sharedTableOrder: {
      findFirst: jest.fn().mockResolvedValue({ id: 'session-1' }),
      create: jest.fn(),
    },
    sharedTableParticipant: {
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
    },
    product: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'product-1',
          name: 'Plato',
          price: decimal(50),
          availability: [{ priceOverride: null, isAvailable: true }],
        },
      ]),
    },
    order: {
      create: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(savedOrder),
      findMany: jest.fn().mockResolvedValue([]),
    },
    orderStatusHistory: { updateMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
    order: tx.order,
  };
  const repository = { findById: jest.fn().mockResolvedValue(null) };
  const events = { pedidoRecibido: jest.fn() };
  const service = new PedidosService(
    prisma as unknown as PrismaService,
    repository as unknown as PedidoRepository,
    events as unknown as PedidoEventos,
  );
  return { tx, prisma, repository, events, service };
}

describe('PedidosService', () => {
  it('lista únicamente los pedidos creados por el comensal', async () => {
    const { tx, service } = setup();

    await service.listMine('diner-1');

    expect(tx.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dinerId: 'diner-1' },
      }),
    );
  });

  it('vincula comensal y pedido a la sesión de la mesa y conserva observaciones', async () => {
    const { tx, service } = setup();

    await service.create(
      'diner-1',
      'location-1',
      [{ productId: 'product-1', quantity: 1, notes: 'Sin cebolla' }],
      'table-1',
    );

    expect(tx.sharedTableParticipant.upsert).toHaveBeenCalledWith({
      where: {
        sessionId_userId: { sessionId: 'session-1', userId: 'diner-1' },
      },
      create: { sessionId: 'session-1', userId: 'diner-1' },
      update: {},
    });
    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tableId: 'table-1',
          tableSessionId: 'session-1',
          dinerId: 'diner-1',
          items: {
            create: [
              expect.objectContaining({
                productId: 'product-1',
                quantity: 1,
                notes: 'Sin cebolla',
              }),
            ],
          },
        }),
      }),
    );
  });

  it('rechaza una mesa de otra sede antes de crear una vinculación', async () => {
    const { tx, service } = setup();
    tx.diningTable.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        'diner-1',
        'location-1',
        [{ productId: 'product-1', quantity: 1 }],
        'table-2',
      ),
    ).rejects.toThrow(BadRequestException);

    expect(tx.sharedTableParticipant.upsert).not.toHaveBeenCalled();
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it('no crea una vinculación duplicada al enviar otro pedido durante la ocupación', async () => {
    const { tx, service } = setup();
    tx.sharedTableParticipant.findFirst.mockResolvedValue({
      id: 'participant-1',
    });

    await service.create(
      'diner-1',
      'location-1',
      [{ productId: 'product-1', quantity: 1 }],
      'table-1',
    );

    expect(tx.sharedTableParticipant.upsert).not.toHaveBeenCalled();
  });
});
