import { Injectable } from '@nestjs/common';
import { OrderStatus } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type {
  DinerTasteProfile,
  RecommendationSource,
} from '../domain/recommendation-source';

@Injectable()
export class PrismaRecommendationSource implements RecommendationSource {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string): Promise<DinerTasteProfile> {
    const [user, orders] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          preferences: {
            select: { priceRangeMin: true, priceRangeMax: true },
          },
          cuisinePreferences: {
            where: { cuisineType: { isActive: true } },
            select: { cuisineTypeId: true },
          },
        },
      }),
      this.prisma.order.groupBy({
        by: ['locationId'],
        where: {
          dinerId: userId,
          placedAt: { not: null },
          status: { not: OrderStatus.cancelado },
        },
        _count: { _all: true },
      }),
    ]);

    return {
      preferredCuisines: (user?.cuisinePreferences ?? []).map((row) => ({
        id: row.cuisineTypeId,
      })),
      priceRangeMin: user?.preferences?.priceRangeMin ?? null,
      priceRangeMax: user?.preferences?.priceRangeMax ?? null,
      ordersByLocation: orders.map((row) => ({
        locationId: row.locationId,
        count: row._count._all,
      })),
    };
  }

  async getLocationCuisines(locationIds: string[]) {
    if (!locationIds.length) return [];
    const rows = await this.prisma.locationCuisine.findMany({
      where: { locationId: { in: locationIds } },
      select: {
        locationId: true,
        cuisineTypeId: true,
        cuisineType: { select: { name: true } },
      },
    });
    return rows.map((row) => ({
      locationId: row.locationId,
      cuisineId: row.cuisineTypeId,
      name: row.cuisineType.name,
    }));
  }
}
