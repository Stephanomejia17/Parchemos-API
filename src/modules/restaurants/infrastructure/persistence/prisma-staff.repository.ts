import { Injectable } from '@nestjs/common';
import {
  AccountStatus as PrismaAccountStatus,
  UserRole,
} from '../../../../../generated/prisma/client';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { NotFoundError } from '../../../../common/errors/not-found-error';
import { AccountStatus } from '../../../auth/domain/enums/account-status.enum';
import { StaffMember } from '../../domain/entities/staff-member.entity';
import {
  CreateStaffData,
  StaffRepository,
  UpdateStaffProfileData,
} from '../../domain/repositories/staff.repository';

// La sede asignada vive en `restaurant_staff`: revocar el acceso desactiva el
// vinculo sin borrarlo, para conservar el historial (GU-05, PARCHE-286).
const staffInclude = {
  profile: true,
  staffAssignments: {
    where: { isActive: true },
    include: {
      location: { select: { id: true, name: true, restaurantId: true } },
    },
    orderBy: { hiredAt: 'desc' },
    take: 1,
  },
} as const;

type StaffRow = {
  id: string;
  email: string;
  status: PrismaAccountStatus;
  createdAt: Date;
  profile: { fullName: string; phone: string | null } | null;
  staffAssignments: {
    location: { id: string; name: string; restaurantId: string };
  }[];
};

@Injectable()
export class PrismaStaffRepository implements StaffRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findManyByOwner(ownerId: string): Promise<StaffMember[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        role: UserRole.personal_restaurante,
        staffAssignments: {
          some: { isActive: true, location: { restaurant: { ownerId } } },
        },
      },
      include: staffInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDomain);
  }

  async findByIdAndOwner(
    ownerId: string,
    staffId: string,
  ): Promise<StaffMember | null> {
    const row = await this.prisma.user.findFirst({
      where: {
        id: staffId,
        role: UserRole.personal_restaurante,
        staffAssignments: {
          some: { isActive: true, location: { restaurant: { ownerId } } },
        },
      },
      include: staffInclude,
    });
    return row ? toDomain(row) : null;
  }

  async emailInUse(email: string): Promise<boolean> {
    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    return !!existing;
  }

  async create(data: CreateStaffData): Promise<StaffMember> {
    const row = await this.prisma.user.create({
      data: {
        id: data.id,
        email: data.email,
        passwordHash: null,
        role: UserRole.personal_restaurante,
        status: PrismaAccountStatus.activa,
        termsAcceptedAt: new Date(),
        privacyAcceptedAt: new Date(),
        profile: { create: { fullName: data.fullName, phone: data.phone } },
        staffAssignments: { create: { locationId: data.locationId } },
      },
      include: staffInclude,
    });
    return toDomain(row);
  }

  async updateProfile(
    staffId: string,
    data: UpdateStaffProfileData,
  ): Promise<StaffMember> {
    const row = await this.prisma.user.update({
      where: { id: staffId },
      data: {
        profile: {
          update: {
            ...(data.fullName !== undefined ? { fullName: data.fullName } : {}),
            ...(data.phone !== undefined ? { phone: data.phone } : {}),
          },
        },
      },
      include: staffInclude,
    });
    return toDomain(row);
  }

  /** Reasignar cierra el vinculo anterior y abre uno nuevo en una sola transaccion (PARCHE-286). */
  async reassignLocation(
    staffId: string,
    locationId: string,
  ): Promise<StaffMember> {
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
    const row = await this.prisma.user.findUniqueOrThrow({
      where: { id: staffId },
      include: staffInclude,
    });
    return toDomain(row);
  }

  async setEnabled(staffId: string, enabled: boolean): Promise<StaffMember> {
    const row = await this.prisma.user.update({
      where: { id: staffId },
      data: {
        status: enabled
          ? PrismaAccountStatus.activa
          : PrismaAccountStatus.deshabilitada,
      },
      include: staffInclude,
    });
    return toDomain(row);
  }
}

function toDomain(row: StaffRow): StaffMember {
  const location = row.staffAssignments[0]?.location;
  if (!location) {
    throw new NotFoundError(
      'La cuenta de personal no tiene una sede asignada.',
      'STAFF_LOCATION_MISSING',
    );
  }
  return new StaffMember({
    id: row.id,
    fullName: row.profile?.fullName ?? '',
    email: row.email,
    phone: row.profile?.phone ?? null,
    status: row.status as unknown as AccountStatus,
    createdAt: row.createdAt,
    location,
  });
}
