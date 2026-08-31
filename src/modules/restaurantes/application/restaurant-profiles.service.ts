import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountStatus, LocationStatus } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type {
  CreateLocationCommand,
  CreateRestaurantCommand,
  SchedulePeriodCommand,
  UpdateLocationCommand,
} from './dto/restaurant-profile.commands';

const DEFAULT_LOGO_URL = 'https://placehold.co/256x256?text=Parchemos';
const DEFAULT_COVER_URL = 'https://placehold.co/1200x600?text=Restaurante';
// El alcance actual de Parchemos opera en Colombia; al agregar expansion por
// pais, este valor debe pasar a ser un campo de la sede.
const PLATFORM_TIME_ZONE = 'America/Bogota';

@Injectable()
export class RestaurantProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async createRestaurant(ownerId: string, dto: CreateRestaurantCommand) {
    return this.prisma.restaurant.create({
      data: { ownerId, businessName: dto.businessName.trim() },
      include: { locations: true },
    });
  }

  async listMine(ownerId: string) {
    return this.prisma.restaurant.findMany({
      where: { ownerId },
      include: { locations: { include: { schedules: { orderBy: [{ dayOfWeek: 'asc' }, { startsAt: 'asc' }] }, images: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createLocation(ownerId: string, restaurantId: string, dto: CreateLocationCommand) {
    await this.getOwnedRestaurant(ownerId, restaurantId);
    this.assertCoordinates(dto);
    return this.prisma.location.create({
      data: {
        restaurantId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        address: dto.address.trim(),
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
      include: { schedules: true, images: true },
    });
  }

  async updateLocation(ownerId: string, locationId: string, dto: UpdateLocationCommand) {
    await this.getOwnedLocation(ownerId, locationId);
    this.assertCoordinates(dto);
    return this.prisma.location.update({
      where: { id: locationId },
      data: cleanLocation(dto),
      include: { schedules: true, images: true },
    });
  }

  async replaceSchedules(ownerId: string, locationId: string, schedules: SchedulePeriodCommand[]) {
    await this.getOwnedLocation(ownerId, locationId);
    validateSchedules(schedules);
    return this.prisma.$transaction(async (tx) => {
      await tx.locationSchedule.deleteMany({ where: { locationId } });
      if (schedules.length) {
        await tx.locationSchedule.createMany({
          data: schedules.map((item) => ({ ...item, locationId })),
        });
      }
      return tx.locationSchedule.findMany({
        where: { locationId }, orderBy: [{ dayOfWeek: 'asc' }, { startsAt: 'asc' }],
      });
    });
  }

  async setImage(ownerId: string, locationId: string, kind: 'logo' | 'cover', url: string) {
    await this.getOwnedLocation(ownerId, locationId);
    return this.prisma.location.update({
      where: { id: locationId },
      data: kind === 'logo' ? { logoUrl: url } : { coverUrl: url },
      include: { schedules: true, images: true },
    });
  }

  async addGalleryImage(ownerId: string, locationId: string, url: string) {
    await this.getOwnedLocation(ownerId, locationId);
    const count = await this.prisma.locationImage.count({ where: { locationId } });
    if (count >= 20) throw new BadRequestException('La galería permite máximo 20 imágenes.');
    return this.prisma.locationImage.create({ data: { locationId, url } });
  }

  async removeGalleryImage(ownerId: string, locationId: string, imageId: string) {
    await this.getOwnedLocation(ownerId, locationId);
    const image = await this.prisma.locationImage.findFirst({ where: { id: imageId, locationId } });
    if (!image) throw new NotFoundException('La imagen no existe en esta galería.');
    await this.prisma.locationImage.delete({ where: { id: imageId } });
  }

  async preview(ownerId: string, locationId: string) {
    const location = await this.getOwnedLocation(ownerId, locationId);
    return toPublicProfile(location);
  }

  async publicProfile(locationId: string) {
    const location = await this.prisma.location.findFirst({
      where: { id: locationId, status: LocationStatus.activa },
      include: profileInclude,
    });
    if (!location) throw new NotFoundException('El restaurante no está disponible.');
    return toPublicProfile(location);
  }

  async requestApproval(ownerId: string, locationId: string) {
    const location = await this.getOwnedLocation(ownerId, locationId);
    const missing = missingRequiredProfileData(location);
    if (missing.length) {
      throw new BadRequestException({
        code: 'PERFIL_INCOMPLETO',
        message: 'Completa la información requerida antes de solicitar autorización.',
        fields: missing,
      });
    }
    if (location.status === LocationStatus.activa) {
      throw new BadRequestException('Esta sede ya está aprobada.');
    }
    return this.prisma.location.update({
      where: { id: locationId },
      data: { status: LocationStatus.pendiente_aprobacion, rejectionReason: null },
      include: profileInclude,
    });
  }

  async pendingForReview() {
    return this.prisma.location.findMany({
      where: { status: LocationStatus.pendiente_aprobacion },
      include: { restaurant: { include: { owner: { select: { id: true, fullName: true, email: true } } } }, ...profileInclude },
      orderBy: { updatedAt: 'asc' },
    });
  }

  async locationsForAdmin() {
    return this.prisma.location.findMany({
      include: {
        restaurant: {
          include: { owner: { select: { id: true, fullName: true, email: true } } },
        },
        ...profileInclude,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async approve(locationId: string) {
    await this.findLocation(locationId);
    return this.prisma.$transaction(async (tx) => {
      const location = await tx.location.update({
        where: { id: locationId },
        data: { status: LocationStatus.activa, approvedAt: new Date(), rejectionReason: null },
        include: { restaurant: { select: { ownerId: true } } },
      });
      // La aprobación de una sede habilita la cuenta propietaria para operar.
      // El nuevo estado se reflejará en el siguiente refresh/login del token.
      await tx.user.update({
        where: { id: location.restaurant.ownerId },
        data: { status: AccountStatus.activa },
      });
      return location;
    });
  }

  async reject(locationId: string, reason: string) {
    await this.findLocation(locationId);
    return this.prisma.location.update({
      where: { id: locationId },
      data: { status: LocationStatus.rechazada, rejectionReason: reason.trim(), approvedAt: null },
    });
  }

  private async getOwnedRestaurant(ownerId: string, restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findFirst({ where: { id: restaurantId, ownerId } });
    if (!restaurant) throw new ForbiddenException('No puedes administrar este restaurante.');
    return restaurant;
  }

  private async getOwnedLocation(ownerId: string, locationId: string) {
    const location = await this.prisma.location.findFirst({
      where: { id: locationId, restaurant: { ownerId } }, include: profileInclude,
    });
    if (!location) throw new ForbiddenException('No puedes administrar esta sede.');
    return location;
  }

  private async findLocation(locationId: string) {
    const location = await this.prisma.location.findUnique({ where: { id: locationId } });
    if (!location) throw new NotFoundException('La sede no existe.');
    return location;
  }

  private assertCoordinates(dto: Pick<CreateLocationCommand, 'latitude' | 'longitude'>) {
    if ((dto.latitude === undefined) !== (dto.longitude === undefined)) {
      throw new BadRequestException('Debes indicar latitud y longitud juntas.');
    }
  }
}

const profileInclude = {
  schedules: { orderBy: [{ dayOfWeek: 'asc' as const }, { startsAt: 'asc' as const }] },
  images: { orderBy: { createdAt: 'asc' as const } },
};

function cleanLocation(dto: CreateLocationCommand | UpdateLocationCommand) {
  return {
    ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
    ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
    ...(dto.address !== undefined ? { address: dto.address.trim() } : {}),
    ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
    ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
  };
}

function validateSchedules(schedules: SchedulePeriodCommand[]) {
  const grouped = new Map<number, SchedulePeriodCommand[]>();
  for (const schedule of schedules) {
    if (schedule.dayOfWeek > 6) throw new BadRequestException('El día de la semana debe estar entre 0 y 6.');
    if (schedule.startsAt >= schedule.endsAt) throw new BadRequestException('La hora de inicio debe ser anterior a la hora de fin.');
    grouped.set(schedule.dayOfWeek, [...(grouped.get(schedule.dayOfWeek) ?? []), schedule]);
  }
  for (const items of grouped.values()) {
    const sorted = [...items].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    if (sorted.some((item, index) => index > 0 && item.startsAt < sorted[index - 1].endsAt)) {
      throw new BadRequestException('Las franjas de un mismo día no pueden superponerse.');
    }
  }
}

function missingRequiredProfileData(location: { name: string; address: string; schedules: unknown[] }) {
  const missing: string[] = [];
  if (!location.name.trim()) missing.push('name');
  if (!location.address.trim()) missing.push('address');
  if (!location.schedules.length) missing.push('schedules');
  return missing;
}

function toPublicProfile(location: any) {
  return {
    id: location.id, name: location.name, description: location.description ?? '', address: location.address,
    latitude: location.latitude, longitude: location.longitude,
    logoUrl: location.logoUrl ?? DEFAULT_LOGO_URL,
    coverUrl: location.coverUrl ?? DEFAULT_COVER_URL,
    gallery: location.images.map((image: { id: string; url: string }) => ({ id: image.id, url: image.url })),
    schedules: location.schedules,
    status: location.status,
    isOpen: isOpenNow(location.schedules),
  };
}

function isOpenNow(schedules: Array<{ dayOfWeek: number; startsAt: string; endsAt: string }>) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PLATFORM_TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(value('weekday'));
  const time = `${value('hour')}:${value('minute')}`;
  return schedules.some((schedule) => schedule.dayOfWeek === day && schedule.startsAt <= time && time < schedule.endsAt);
}
