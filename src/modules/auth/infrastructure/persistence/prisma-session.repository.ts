import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import {
  ActiveSession,
  CreateSessionData,
  RevokeReason,
  SessionRepository,
} from '../../domain/repositories/session.repository';

@Injectable()
export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateSessionData): Promise<ActiveSession> {
    const row = await this.prisma.session.create({
      data: {
        userId: data.userId,
        refreshTokenHash: data.refreshTokenHash,
        expiresAt: data.expiresAt,
        ipAddress: data.ipAddress ?? undefined,
        userAgent: data.userAgent ?? undefined,
      },
      select: { id: true, userId: true, expiresAt: true },
    });
    return row;
  }

  async findActiveByTokenHash(
    refreshTokenHash: string,
  ): Promise<ActiveSession | null> {
    const row = await this.prisma.session.findFirst({
      where: {
        refreshTokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, userId: true, expiresAt: true },
    });
    return row;
  }

  /** GU-02 Esc. 5: el logout invalida el token en el servidor, no solo en el navegador. */
  async revokeByTokenHash(
    refreshTokenHash: string,
    reason: RevokeReason,
  ): Promise<void> {
    await this.prisma.session.updateMany({
      where: { refreshTokenHash, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeAllForUser(
    userId: string,
    reason: RevokeReason,
  ): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return result.count;
  }
}
