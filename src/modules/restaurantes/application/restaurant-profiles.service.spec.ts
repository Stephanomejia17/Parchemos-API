import { LocationStatus } from '../../../../generated/prisma/client';
import { RestaurantProfilesService } from './restaurant-profiles.service';

describe('RestaurantProfilesService', () => {
  let service: RestaurantProfilesService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      location: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      restaurant: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    service = new RestaurantProfilesService(prisma);
  });

  it('approve actualiza solo la sede seleccionada y no cambia User.status', async () => {
    prisma.location.findUnique.mockResolvedValue({
      id: 'loc-1', status: LocationStatus.pendiente_aprobacion,
      name: 'Sede 1', address: 'Calle 123', schedules: [{ dayOfWeek: 1 }], images: [],
    });

    const tx = {
      location: {
        update: jest.fn().mockResolvedValue({
          id: 'loc-1',
          status: LocationStatus.activa,
          approvedAt: new Date('2026-01-01T00:00:00.000Z'),
          rejectionReason: null,
        }),
      },
      user: { update: jest.fn() },
    };

    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const result = await service.approve('loc-1');

    expect(tx.location.update).toHaveBeenCalledWith({
      where: { id: 'loc-1' },
      data: {
        status: LocationStatus.activa,
        approvedAt: expect.any(Date),
        rejectionReason: null,
      },
    });
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(result.status).toBe(LocationStatus.activa);
    expect(result.rejectionReason).toBeNull();
  });

  it('approve establece approvedAt y limpia rejectionReason', async () => {
    prisma.location.findUnique.mockResolvedValue({
      id: 'loc-2', status: LocationStatus.pendiente_aprobacion,
      name: 'Sede 2', address: 'Calle 456', schedules: [{ dayOfWeek: 1 }], images: [],
    });

    const tx = {
      location: {
        update: jest.fn().mockResolvedValue({
          id: 'loc-2',
          status: LocationStatus.activa,
          approvedAt: new Date('2026-05-10T10:00:00.000Z'),
          rejectionReason: null,
        }),
      },
      user: { update: jest.fn() },
    };

    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await service.approve('loc-2');

    expect(tx.location.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: LocationStatus.activa,
          rejectionReason: null,
          approvedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('reject mantiene motivo obligatorio y lo persiste trimmeado', async () => {
    prisma.location.findUnique.mockResolvedValue({ id: 'loc-3' });
    prisma.location.update.mockResolvedValue({
      id: 'loc-3',
      status: LocationStatus.rechazada,
      rejectionReason: 'Motivo válido',
      approvedAt: null,
    });

    const result = await service.reject('loc-3', '  Motivo válido  ');

    expect(prisma.location.update).toHaveBeenCalledWith({
      where: { id: 'loc-3' },
      data: {
        status: LocationStatus.rechazada,
        rejectionReason: 'Motivo válido',
        approvedAt: null,
      },
    });
    expect(result.rejectionReason).toBe('Motivo válido');
    expect(result.status).toBe(LocationStatus.rechazada);
  });

  it('requestApproval limpia rejectionReason cuando una sede rechazada vuelve a pedir aprobación', async () => {
    prisma.location.findFirst.mockResolvedValue({
      id: 'loc-4',
      name: 'La Pérgola',
      address: 'Calle 1',
      schedules: [{ dayOfWeek: 1, startsAt: '09:00', endsAt: '18:00' }],
      status: LocationStatus.rechazada,
    });
    prisma.location.update.mockResolvedValue({
      id: 'loc-4',
      status: LocationStatus.pendiente_aprobacion,
      rejectionReason: null,
    });

    const result = await service.requestApproval('owner-1', 'loc-4');

    expect(prisma.location.update).toHaveBeenCalledWith({
      where: { id: 'loc-4' },
      data: {
        status: LocationStatus.pendiente_aprobacion,
        rejectionReason: null,
      },
      include: expect.any(Object),
    });
    expect(result.status).toBe(LocationStatus.pendiente_aprobacion);
    expect(result.rejectionReason).toBeNull();
  });

  it('no aprueba una sede incompleta', async () => {
    prisma.location.findUnique.mockResolvedValue({
      id: 'loc-incomplete', status: LocationStatus.pendiente_aprobacion,
      name: 'Sede incompleta', address: 'Calle 1', schedules: [], images: [],
    });

    await expect(service.approve('loc-incomplete')).rejects.toThrow(
      'La sede no tiene toda la información requerida.',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('vuelve a revisión una sede activa cuando se modifica', async () => {
    prisma.location.findFirst.mockResolvedValue({
      id: 'loc-active', status: LocationStatus.activa,
      name: 'Sede activa', address: 'Calle 1', schedules: [], images: [],
    });
    prisma.location.update.mockResolvedValue({
      id: 'loc-active', status: LocationStatus.pendiente_aprobacion,
    });

    await service.updateLocation('owner-1', 'loc-active', { name: 'Sede actualizada' });

    expect(prisma.location.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'loc-active' },
      data: { name: 'Sede actualizada', status: LocationStatus.pendiente_aprobacion },
    }));
  });

  it('aprueba solo la sede solicitada y no toca las demás', async () => {
    prisma.location.findUnique.mockResolvedValue({
      id: 'loc-new', status: LocationStatus.pendiente_aprobacion,
      name: 'Nueva sede', address: 'Calle 99', schedules: [{ dayOfWeek: 1 }], images: [],
    });
    const tx = {
      location: {
        update: jest.fn().mockResolvedValue({ id: 'loc-new', status: LocationStatus.activa }),
      },
    };
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await service.approve('loc-new');

    expect(tx.location.update).toHaveBeenCalledTimes(1);
    expect(tx.location.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'loc-new' },
    }));
  });
});
