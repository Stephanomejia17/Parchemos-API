import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import type { FavoriteRepository } from '../../domain/favorite.repository';

@Injectable()
export class PrismaFavoriteRepository implements FavoriteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async add(userId: string, locationId: string): Promise<void> {
    // INSERT ... ON CONFLICT DO NOTHING: atomico y sin error por duplicado.
    await this.prisma.favorite.createMany({
      data: [{ userId, locationId }],
      skipDuplicates: true,
    });
  }

  async remove(userId: string, locationId: string): Promise<void> {
    await this.prisma.favorite.deleteMany({ where: { userId, locationId } });
  }

  async listLocationIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.favorite.findMany({
      where: { userId },
      select: { locationId: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => row.locationId);
  }

  async filterFavorites(
    userId: string,
    locationIds: string[],
  ): Promise<Set<string>> {
    if (!locationIds.length) return new Set();
    const rows = await this.prisma.favorite.findMany({
      where: { userId, locationId: { in: locationIds } },
      select: { locationId: true },
    });
    return new Set(rows.map((row) => row.locationId));
  }
}
