import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import {
  ActivePasswordResetToken,
  CreatePasswordResetTokenData,
  PasswordResetTokenRepository,
} from '../../domain/repositories/password-reset-token.repository';

@Injectable()
export class PrismaPasswordResetTokenRepository
  implements PasswordResetTokenRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreatePasswordResetTokenData): Promise<void> {
    await this.prisma.passwordResetToken.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        ipAddress: data.ipAddress ?? undefined,
        userAgent: data.userAgent?.slice(0, 500) ?? undefined,
      },
    });
  }

  async findActiveByHash(
    tokenHash: string,
  ): Promise<ActivePasswordResetToken | null> {
    return this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, userId: true, expiresAt: true },
    });
  }

  async markUsed(id: string): Promise<boolean> {
    const result = await this.prisma.passwordResetToken.updateMany({
      where: { id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    return result.count === 1;
  }
}
