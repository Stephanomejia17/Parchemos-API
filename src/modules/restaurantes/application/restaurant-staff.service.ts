import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AccountStatus, LocationStatus, UserRole } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PASSWORD_HASHER, type PasswordHasher } from '../../auth/domain/services/password-hasher';
import type { CreateStaffCommand, UpdateStaffCommand } from './dto/restaurant-profile.commands';

const staffInclude = { staffLocation: { select: { id: true, name: true, restaurantId: true } } };

@Injectable()
export class RestaurantStaffService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PASSWORD_HASHER) private readonly passwords: PasswordHasher,
  ) {}

  async list(ownerId: string) {
    await this.assertApprovedOwner(ownerId);
    const people = await this.prisma.user.findMany({ where: { role: UserRole.personal_restaurante, staffLocation: { restaurant: { ownerId } } }, include: staffInclude, orderBy: { createdAt: 'desc' } });
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
        data: { fullName: dto.fullName.trim(), email, phone: dto.phone?.trim() || null, passwordHash: await this.passwords.hash(dto.initialPassword), role: UserRole.personal_restaurante, status: AccountStatus.activa, staffLocationId: dto.locationId, termsAcceptedAt: new Date(), privacyAcceptedAt: new Date() },
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
    return toStaffMember(await this.prisma.user.update({ where: { id: staffId }, data: { ...(dto.fullName !== undefined ? { fullName: dto.fullName.trim() } : {}), ...(dto.phone !== undefined ? { phone: dto.phone.trim() || null } : {}) }, include: staffInclude }));
  }

  async reassign(ownerId: string, staffId: string, locationId: string) {
    await this.getOwnedStaff(ownerId, staffId);
    await this.getOwnedLocation(ownerId, locationId);
    return toStaffMember(await this.prisma.user.update({ where: { id: staffId }, data: { staffLocationId: locationId }, include: staffInclude }));
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
    const person = await this.prisma.user.findFirst({ where: { id: staffId, role: UserRole.personal_restaurante, staffLocation: { restaurant: { ownerId } } }, include: staffInclude });
    if (!person) throw new NotFoundException('La cuenta de personal no existe en tu restaurante.');
    return person;
  }
}

function toStaffMember(person: { id: string; fullName: string; email: string; phone: string | null; status: AccountStatus; createdAt: Date; staffLocation: { id: string; name: string; restaurantId: string } | null }) {
  if (!person.staffLocation) throw new NotFoundException('La cuenta de personal no tiene una sede asignada.');
  return { id: person.id, user: { id: person.id, fullName: person.fullName, email: person.email, phone: person.phone, status: person.status, createdAt: person.createdAt }, location: person.staffLocation, createdAt: person.createdAt };
}
