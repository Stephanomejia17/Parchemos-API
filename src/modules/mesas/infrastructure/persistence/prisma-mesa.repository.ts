import { Injectable } from '@nestjs/common';
import { TableStatus as PrismaTableStatus } from '../../../../../generated/prisma/client';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { MesaCodeAlreadyExistsError } from '../../domain/errors/mesa-code-already-exists.error';
import { Mesa } from '../../domain/entities/mesa.entity';
import { MesaStatus } from '../../domain/enums/mesa-status.enum';
import type {
  CreateMesaData,
  MesaRepository,
  PublicMesaDetails,
  UpdateMesaData,
} from '../../domain/repositories/mesa.repository';
import { toMesaDomain } from './mesa.mapper';

@Injectable()
export class PrismaMesaRepository implements MesaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async locationBelongsToOwner(
    locationId: string,
    ownerId: string,
  ): Promise<boolean> {
    return Boolean(
      await this.prisma.location.findFirst({
        where: { id: locationId, restaurant: { ownerId } },
        select: { id: true },
      }),
    );
  }

  async listByLocation(locationId: string): Promise<Mesa[]> {
    const rows = await this.prisma.diningTable.findMany({
      where: { locationId },
      orderBy: { code: 'asc' },
    });
    return rows.map(toMesaDomain);
  }

  async create(data: CreateMesaData): Promise<Mesa> {
    try {
      const row = await this.prisma.diningTable.create({
        data: {
          locationId: data.locationId,
          code: data.code,
          capacity: data.capacity,
        },
      });
      return toMesaDomain(row);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new MesaCodeAlreadyExistsError();
      }
      throw error;
    }
  }

  async findOwnedById(tableId: string, ownerId: string): Promise<Mesa | null> {
    const row = await this.prisma.diningTable.findFirst({
      where: { id: tableId, location: { restaurant: { ownerId } } },
    });
    return row ? toMesaDomain(row) : null;
  }

  async updateStatus(tableId: string, status: MesaStatus): Promise<Mesa> {
    const row = await this.prisma.diningTable.update({
      where: { id: tableId },
      data: { status: status as PrismaTableStatus },
    });
    return toMesaDomain(row);
  }

  async update(tableId: string, data: UpdateMesaData): Promise<Mesa> {
    try {
      const row = await this.prisma.diningTable.update({
        where: { id: tableId },
        data: {
          ...(data.status ? { status: data.status as PrismaTableStatus } : {}),
          ...(data.code !== undefined ? { code: data.code } : {}),
          ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
        },
      });
      return toMesaDomain(row);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new MesaCodeAlreadyExistsError();
      throw error;
    }
  }

  async findPublicById(tableId: string): Promise<PublicMesaDetails | null> {
    const row = await this.prisma.diningTable.findUnique({
      where: { id: tableId },
      include: {
        location: {
          include: { restaurant: { select: { id: true, businessName: true } } },
        },
      },
    });
    if (!row) return null;
    return {
      mesa: toMesaDomain(row),
      restaurantId: row.location.restaurant.id,
      restaurantName: row.location.restaurant.businessName,
    };
  }

  async findById(tableId: string): Promise<Mesa | null> {
    const row = await this.prisma.diningTable.findUnique({
      where: { id: tableId },
    });
    return row ? toMesaDomain(row) : null;
  }
}
