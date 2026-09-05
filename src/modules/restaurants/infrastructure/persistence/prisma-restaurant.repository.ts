import { Injectable } from '@nestjs/common';
import type { Decimal } from '@prisma/client/runtime/client';
import {
  AccountStatus,
  UserRole,
} from '../../../../../generated/prisma/client';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { Restaurant } from '../../domain/entities/restaurant.entity';
import {
  CreateRestaurantData,
  RestaurantRepository,
  RestaurantWithLocations,
} from '../../domain/repositories/restaurant.repository';
import { locationInclude, toLocationDomain } from './location.mapper';

type RestaurantRow = {
  id: string;
  ownerId: string;
  businessName: string;
  legalName: string | null;
  taxId: string | null;
  commissionRate: Decimal;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class PrismaRestaurantRepository implements RestaurantRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateRestaurantData): Promise<Restaurant> {
    const row = await this.prisma.restaurant.create({
      data: { ownerId: data.ownerId, businessName: data.businessName },
    });
    return toDomain(row);
  }

  async findById(id: string): Promise<Restaurant | null> {
    const row = await this.prisma.restaurant.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByIdAndOwner(
    id: string,
    ownerId: string,
  ): Promise<Restaurant | null> {
    const row = await this.prisma.restaurant.findFirst({
      where: { id, ownerId },
    });
    return row ? toDomain(row) : null;
  }

  async findManyByOwnerWithLocations(
    ownerId: string,
  ): Promise<RestaurantWithLocations[]> {
    const rows = await this.prisma.restaurant.findMany({
      where: { ownerId },
      include: { locations: { include: locationInclude } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      restaurant: toDomain(row),
      locations: row.locations.map(toLocationDomain),
    }));
  }

  async isOwnerApproved(ownerId: string): Promise<boolean> {
    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { role: true, status: true },
    });
    return (
      !!owner &&
      owner.role === UserRole.restaurante &&
      owner.status === AccountStatus.activa
    );
  }
}

function toDomain(row: RestaurantRow): Restaurant {
  return new Restaurant({
    id: row.id,
    ownerId: row.ownerId,
    businessName: row.businessName,
    legalName: row.legalName,
    taxId: row.taxId,
    commissionRate: String(row.commissionRate),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
