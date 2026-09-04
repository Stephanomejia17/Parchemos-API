import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AccountStatus, LocationStatus, UserRole } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PASSWORD_HASHER, type PasswordHasher } from '../../auth/domain/services/password-hasher';
import type { CreateStaffCommand, UpdateStaffCommand } from './dto/restaurant-profile.commands';

// La sede asignada vive en `restaurant_staff`: revocar el acceso desactiva el
// vinculo sin borrarlo, para conservar el historial (GU-05, PARCHE-286).
const staffInclude = {
  profile: true,
  staffAssignments: {
    where: { isActive: true },
    include: { location: { select: { id: true, name: true, restaurantId: true } } },
    orderBy: { hiredAt: 'desc' },
    take: 1,
  },
} as const;

type StaffRow = {
  id: string;
  email: string;
  status: AccountStatus;
  createdAt: Date;
  profile: { fullName: string; phone: string | null } | null;
  staffAssignments: { location: { id: string; name: string; restaurantId: string } }[];
};

@Injectable()
export class RestaurantStaffService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PASSWORD_HASHER) private readonly passwords: PasswordHasher,
  ) {}

  async list(ownerId: string) {
    await this.assertApprovedOwner(ownerId);
    const people = await this.prisma.user.findMany({
      where: {
        role: UserRole.personal_restaurante,
        staffAssignments: { some: { isActive: true, location: { restaurant: { ownerId } } } },
      },
      include: staffInclude,
      orderBy: { createdAt: 'desc' },
    });
    return people.map(toStaffMember);
  }

  async detail(ownerId: string, staffId: string) { return toStaffMember(await this.getOwnedStaff(ownerId, staffId)); }

  async create(ownerId: string, dto: CreateStaffCommand) {
    await this.assertApprovedOwner(ownerId);
    await this.getOwnedLocation(ownerId, dto.locationId);
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) throw new ConflictException('Ese correo ya está en uso.');
    try {
      const person = await this.prisma.user.create({
        data: {
          email,
          passwordHash: await this.passwords.hash(dto.initialPassword),
          role: UserRole.personal_restaurante,
          status: AccountStatus.activa,
          termsAcceptedAt: new Date(),
          privacyAcceptedAt: new Date(),
          profile: { create: { fullName: dto.fullName.trim(), phone: dto.phone?.trim() || null } },
          staffAssignments: { create: { locationId: dto.locationId } },
        },
        include: staffInclude,
      });
      return toStaffMember(person);
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('Ese correo ya está en uso.');
      throw error;
    }
  }

  async update(ownerId: string, staffId: string, dto: UpdateStaffCommand) {
    await this.getOwnedStaff(ownerId, staffId);
    return toStaffMember(await this.prisma.user.update({
      where: { id: staffId },
      data: {
        profile: {
          update: {
            ...(dto.fullName !== undefined ? { fullName: dto.fullName.trim() } : {}),
            ...(dto.phone !== undefined ? { phone: dto.phone.trim() || null } : {}),
          },
        },
      },
      include: staffInclude,
    }));
  }

  /**
   * Reasignar cierra el vinculo anterior y abre uno nuevo, en una sola
   * transaccion: el historial de sedes queda completo (PARCHE-286).
   */
  async reassign(ownerId: string, staffId: string, locationId: string) {
    await this.getOwnedStaff(ownerId, staffId);
    await this.getOwnedLocation(ownerId, locationId);
    await this.prisma.$transaction([
      this.prisma.restaurantStaff.updateMany({
        where: { userId: staffId, isActive: true, NOT: { locationId } },
        data: { isActive: false, revokedAt: new Date() },
      }),
      this.prisma.restaurantStaff.upsert({
        where: { userId_locationId: { userId: staffId, locationId } },
        create: { userId: staffId, locationId },
        update: { isActive: true, revokedAt: null },
      }),
    ]);
    return toStaffMember(await this.getOwnedStaff(ownerId, staffId));
  }

  async setEnabled(ownerId: string, staffId: string, enabled: boolean) {
    await this.getOwnedStaff(ownerId, staffId);
    if (!enabled) await this.prisma.session.updateMany({ where: { userId: staffId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'revocada_por_admin' } });
    return toStaffMember(await this.prisma.user.update({ where: { id: staffId }, data: { status: enabled ? AccountStatus.activa : AccountStatus.deshabilitada }, include: staffInclude }));
  }

  private async assertApprovedOwner(ownerId: string) {
    const owner = await this.prisma.user.findUnique({ where: { id: ownerId }, select: { role: true, status: true } });
    if (!owner || owner.role !== UserRole.restaurante || owner.status !== AccountStatus.activa) throw new ForbiddenException('Debes esperar la aprobación del administrador para gestionar personal.');
  }

  private async getOwnedLocation(ownerId: string, locationId: string) {
    const location = await this.prisma.location.findFirst({ where: { id: locationId, restaurant: { ownerId } } });
    if (!location) throw new ForbiddenException('La sede seleccionada no pertenece a tu restaurante.');
    if (location.status !== LocationStatus.activa) throw new ForbiddenException('Solo puedes asignar personal a una sede aprobada.');
    return location;
  }

  private async getOwnedStaff(ownerId: string, staffId: string) {
    await this.assertApprovedOwner(ownerId);
    const person = await this.prisma.user.findFirst({
      where: {
        id: staffId,
        role: UserRole.personal_restaurante,
        staffAssignments: { some: { isActive: true, location: { restaurant: { ownerId } } } },
      },
      include: staffInclude,
    });
    if (!person) throw new NotFoundException('La cuenta de personal no existe en tu restaurante.');
    return person;
  }
}

function toStaffMember(person: StaffRow) {
  const location = person.staffAssignments[0]?.location;
  if (!location) throw new NotFoundException('La cuenta de personal no tiene una sede asignada.');
  return {
    id: person.id,
    user: {
      id: person.id,
      fullName: person.profile?.fullName ?? '',
      email: person.email,
      phone: person.profile?.phone ?? null,
      status: person.status,
      createdAt: person.createdAt,
    },
    location,
    createdAt: person.createdAt,
  };
}
