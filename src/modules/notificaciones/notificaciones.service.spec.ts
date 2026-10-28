import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { NotificacionesService } from './notificaciones.service';

function setup() {
  const prisma = {
    notification: {
      findMany: jest.fn().mockResolvedValue([{ id: 'n1' }]),
      count: jest.fn().mockResolvedValue(3),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return {
    prisma,
    service: new NotificacionesService(prisma as unknown as PrismaService),
  };
}

describe('NotificacionesService', () => {
  it('lista solo las notificaciones del usuario con el conteo de no leídas', async () => {
    const { service, prisma } = setup();

    await expect(service.listar('user-1', 10)).resolves.toEqual({
      items: [{ id: 'n1' }],
      noLeidas: 3,
    });
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' }, take: 10 }),
    );
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { userId: 'user-1', readAt: null },
    });
  });

  it('solo marca como leída una notificación propia', async () => {
    const { service, prisma } = setup();

    await service.marcarLeida('user-1', 'n1');

    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'n1', userId: 'user-1', readAt: null },
      }),
    );
  });

  it('marca todas las del usuario como leídas', async () => {
    const { service, prisma } = setup();

    await service.marcarTodasLeidas('user-1');

    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', readAt: null } }),
    );
  });
});
