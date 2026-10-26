import { Injectable } from '@nestjs/common';
import {
  LocationStatus as PrismaLocationStatus,
  Prisma,
} from '../../../../../generated/prisma/client';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { Location } from '../../domain/entities/location.entity';
import {
  CreateLocationData,
  LocationOwnerInfo,
  PublicLocation,
  LocationRepository,
  LocationSearchResult,
  UpdateLocationData,
} from '../../domain/repositories/location.repository';
import {
  LocationRow,
  locationInclude,
  toLocationDomain,
} from './location.mapper';
import { LocationImageItem } from '../../domain/value-objects/location-image-item';

// El nombre del propietario vive en `user_profiles`; se aplana aqui para que
// el panel de administracion vea `owner.fullName` sin conocer ese detalle.
const ownerInclude = {
  select: { id: true, email: true, profile: { select: { fullName: true } } },
} as const;

@Injectable()
export class PrismaLocationRepository implements LocationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateLocationData): Promise<Location> {
    const row = await this.prisma.location.create({
      data: {
        restaurantId: data.restaurantId,
        name: data.name,
        description: data.description,
        address: data.address,
        latitude: data.latitude,
        longitude: data.longitude,
      },
      include: locationInclude,
    });
    return toLocationDomain(row);
  }

  async update(id: string, data: UpdateLocationData): Promise<Location> {
    const row = await this.prisma.location.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined
          ? { description: data.description }
          : {}),
        ...(data.address !== undefined ? { address: data.address } : {}),
        ...(data.latitude !== undefined ? { latitude: data.latitude } : {}),
        ...(data.longitude !== undefined ? { longitude: data.longitude } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl } : {}),
        ...(data.coverUrl !== undefined ? { coverUrl: data.coverUrl } : {}),
        ...(data.rejectionReason !== undefined
          ? { rejectionReason: data.rejectionReason }
          : {}),
        ...(data.approvedAt !== undefined
          ? { approvedAt: data.approvedAt }
          : {}),
      },
      include: locationInclude,
    });
    return toLocationDomain(row);
  }

  async findById(id: string): Promise<Location | null> {
    const row = await this.prisma.location.findUnique({
      where: { id },
      include: locationInclude,
    });
    return row ? toLocationDomain(row) : null;
  }

  async findByIdAndOwner(
    id: string,
    ownerId: string,
  ): Promise<Location | null> {
    const row = await this.prisma.location.findFirst({
      where: { id, restaurant: { ownerId } },
      include: locationInclude,
    });
    return row ? toLocationDomain(row) : null;
  }

  async findActiveById(id: string): Promise<Location | null> {
    const row = await this.prisma.location.findFirst({
      where: { id, status: PrismaLocationStatus.activa },
      include: locationInclude,
    });
    return row ? toLocationDomain(row) : null;
  }

  async findTopRated(limit: number): Promise<PublicLocation[]> {
    // Usa locations_public_rating_idx (avg_rating DESC, rating_count DESC) sobre sedes activas.
    const rows = await this.prisma.location.findMany({
      where: { status: PrismaLocationStatus.activa },
      include: {
        ...locationInclude,
        restaurant: { select: { id: true, businessName: true } },
      },
      orderBy: [{ avgRating: 'desc' }, { ratingCount: 'desc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map((row) =>
      Object.assign(toLocationDomain(row), { restaurant: row.restaurant }),
    );
  }

  async findActiveByIds(ids: string[]): Promise<PublicLocation[]> {
    if (!ids.length) return [];
    const rows = await this.prisma.location.findMany({
      where: { id: { in: ids }, status: PrismaLocationStatus.activa },
      include: {
        ...locationInclude,
        restaurant: { select: { id: true, businessName: true } },
      },
    });
    return rows.map((row) =>
      Object.assign(toLocationDomain(row), { restaurant: row.restaurant }),
    );
  }

  async findAllActive(
    categoria?: string,
    ordenarPor?: string,
    precio?: string,
    nombre?: string,
  ): Promise<PublicLocation[]> {
    const categorias = categoria
      ?.split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    const precios = precio
      ?.split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= 4);

    const nombreNormalizado = nombre?.trim();

    const orderBy =
      ordenarPor === 'calificacion'
        ? [{ avgRating: 'desc' as const }, { ratingCount: 'desc' as const }]
        : ordenarPor === 'precio'
          ? [{ priceRange: 'asc' as const }]
          : [{ updatedAt: 'desc' as const }];

    const rows = await this.prisma.location.findMany({
      where: {
        status: PrismaLocationStatus.activa,
        ...(nombreNormalizado
          ? {
              name: {
                contains: nombreNormalizado,
                mode: 'insensitive' as const,
              },
            }
          : {}),
        ...(categorias?.length
          ? {
              cuisines: {
                some: {
                  cuisineType: {
                    slug: {
                      in: categorias,
                    },
                  },
                },
              },
            }
          : {}),
        ...(precios?.length
          ? {
              priceRange: {
                in: precios,
              },
            }
          : {}),
      },
      include: {
        ...locationInclude,
        restaurant: { select: { id: true, businessName: true } },
      },
      orderBy,
    });

    return rows.map((row) =>
      Object.assign(toLocationDomain(row), { restaurant: row.restaurant }),
    );
  }

  async searchActiveByName(
    query: string,
    limit: number,
  ): Promise<LocationSearchResult[]> {
    // Se escapan los comodines de LIKE para que "50%" busque literalmente "50%".
    const escaped = query.replace(/[\\%_]/g, (char) => `\\${char}`);
    try {
      return await this.prisma.$queryRaw<LocationSearchResult[]>(Prisma.sql`
        SELECT l.id, l.name, l.address, r.business_name AS "brandName"
        FROM public.locations l
        JOIN public.restaurants r ON r.id = l.restaurant_id
        WHERE l.status = 'activa'
          AND (
            unaccent(l.name) ILIKE unaccent(${`%${escaped}%`})
            OR unaccent(r.business_name) ILIKE unaccent(${`%${escaped}%`})
          )
        ORDER BY
          (unaccent(l.name) ILIKE unaccent(${`${escaped}%`})
            OR unaccent(r.business_name) ILIKE unaccent(${`${escaped}%`})) DESC,
          r.business_name ASC,
          l.name ASC
        LIMIT ${limit}
      `);
    } catch {
      // Si la extension unaccent no esta disponible se busca solo sin
      // distinguir mayusculas, en vez de dejar el selector inservible.
      const rows = await this.prisma.location.findMany({
        where: {
          status: PrismaLocationStatus.activa,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            {
              restaurant: {
                businessName: { contains: query, mode: 'insensitive' },
              },
            },
          ],
        },
        select: {
          id: true,
          name: true,
          address: true,
          restaurant: { select: { businessName: true } },
        },
        orderBy: { name: 'asc' },
        take: limit,
      });
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        address: row.address,
        brandName: row.restaurant.businessName,
      }));
    }
  }

  async findPendingForReview(): Promise<LocationOwnerInfo[]> {
    const rows = await this.prisma.location.findMany({
      where: { status: PrismaLocationStatus.pendiente_aprobacion },
      include: {
        ...locationInclude,
        restaurant: { include: { owner: ownerInclude } },
      },
      orderBy: { updatedAt: 'asc' },
    });
    return rows.map(toOwnerInfo);
  }

  async findAllForAdmin(): Promise<LocationOwnerInfo[]> {
    const rows = await this.prisma.location.findMany({
      include: {
        ...locationInclude,
        restaurant: { include: { owner: ownerInclude } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(toOwnerInfo);
  }

  async addGalleryImage(
    locationId: string,
    url: string,
  ): Promise<LocationImageItem> {
    const image = await this.prisma.locationImage.create({
      data: { locationId, url },
      select: { id: true, url: true },
    });
    return image;
  }

  async removeGalleryImage(
    locationId: string,
    imageId: string,
  ): Promise<boolean> {
    const image = await this.prisma.locationImage.findFirst({
      where: { id: imageId, locationId },
    });
    if (!image) return false;
    await this.prisma.locationImage.delete({ where: { id: imageId } });
    return true;
  }

  async countGalleryImages(locationId: string): Promise<number> {
    return this.prisma.locationImage.count({ where: { locationId } });
  }
}

function toOwnerInfo(
  row: LocationRow & {
    restaurant: {
      id: string;
      businessName: string;
      owner: {
        id: string;
        email: string;
        profile: { fullName: string } | null;
      };
    };
  },
): LocationOwnerInfo {
  const location = toLocationDomain(row);

  return {
    id: location.id,
    name: location.name,
    address: location.address,
    status: location.status,
    rejectionReason: location.rejectionReason,
    approvedAt: location.approvedAt,
    restaurant: {
      id: row.restaurant.id,
      businessName: row.restaurant.businessName,
      owner: {
        id: row.restaurant.owner.id,
        email: row.restaurant.owner.email,
        fullName: row.restaurant.owner.profile?.fullName ?? '',
      },
    },
  };
}
