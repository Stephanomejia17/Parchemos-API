import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

const LIMITE_POR_DEFECTO = 20;

/**
 * Bandeja de notificaciones in-app del usuario (moderacion, estado de la
 * cuenta, etc.). Cada usuario solo ve y marca las suyas.
 */
@Injectable()
export class NotificacionesService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(userId: string, limite = LIMITE_POR_DEFECTO) {
    const [items, noLeidas] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limite,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          entityType: true,
          entityId: true,
          readAt: true,
          createdAt: true,
        },
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items, noLeidas };
  }

  /** Marcar una ajena no hace nada: el filtro por userId lo impide. */
  async marcarLeida(userId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async marcarTodasLeidas(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
