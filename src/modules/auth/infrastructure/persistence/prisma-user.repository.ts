import { Injectable } from '@nestjs/common';
import { Role } from '../../../../common/enums/role.enum';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { User } from '../../domain/entities/user.entity';
import { AccountStatus } from '../../domain/enums/account-status.enum';
import {
  CreateUserData,
  UpdateUserProfileData,
  UserRepository,
} from '../../domain/repositories/user.repository';

/**
 * Los datos personales viven en `user_profiles` y la sede asignada al personal
 * en `restaurant_staff`. El dominio sigue viendo un `User` plano: el aplanado
 * ocurre aqui, en el unico punto que conoce el esquema.
 */
const userInclude = {
  profile: true,
  staffAssignments: {
    where: { isActive: true },
    include: { location: { include: { restaurant: true } } },
    orderBy: { hiredAt: 'desc' },
    take: 1,
  },
} as const;

type UserRow = {
  id: string;
  email: string;
  passwordHash: string | null;
  deletionRequestedAt: Date | null;
  deletionEffectiveAt: Date | null;
  role: string;
  status: string;
  suspensionReason: string | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  profile?: {
    fullName: string;
    phone: string | null;
    photoUrl: string | null;
    city: string | null;
  } | null;
  staffAssignments?: {
    location: {
      id: string;
      name: string;
      address: string;
      status: string;
      restaurant: { businessName: string };
    };
  }[];
};

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({
      where: { id },
      include: userInclude,
    });
    return row ? toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    // La columna es `citext`, asi que la comparacion ya ignora mayusculas.
    const row = await this.prisma.user.findUnique({
      where: { email },
      include: userInclude,
    });
    return row ? toDomain(row) : null;
  }

  async create(data: CreateUserData): Promise<User> {
    const row = await this.prisma.user.create({
      data: {
        // Coincide con el id de la cuenta en Supabase Auth.
        id: data.id,
        email: data.email,
        passwordHash: null,
        role: data.role,
        status: AccountStatus.ACTIVA,
        termsAcceptedAt: data.acceptedAt,
        privacyAcceptedAt: data.acceptedAt,
        termsVersion: data.termsVersion,
        profile: {
          create: {
            fullName: data.fullName,
            phone: data.phone ?? null,
            city: data.city ?? null,
            photoUrl: data.profilePhotoUrl ?? null,
          },
        },
      },
      include: userInclude,
    });
    return toDomain(row);
  }

  async updateProfile(
    userId: string,
    data: UpdateUserProfileData,
  ): Promise<User | null> {
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!current) {
      return null;
    }

    const changes = {
      ...(data.fullName !== undefined ? { fullName: data.fullName.trim() } : {}),
      ...(data.phone !== undefined
        ? { phone: data.phone === null ? null : data.phone.trim() }
        : {}),
      ...(data.city !== undefined
        ? { city: data.city === null ? null : data.city.trim() }
        : {}),
      ...(data.profilePhotoUrl !== undefined
        ? {
            photoUrl:
              data.profilePhotoUrl === null ? null : data.profilePhotoUrl.trim(),
          }
        : {}),
    };

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        profile: {
          upsert: {
            create: {
              fullName: changes.fullName ?? current.profile?.fullName ?? '',
              phone: changes.phone ?? current.profile?.phone ?? null,
              city: changes.city ?? current.profile?.city ?? null,
              photoUrl: changes.photoUrl ?? current.profile?.photoUrl ?? null,
            },
            update: changes,
          },
        },
      },
      include: userInclude,
    });
    return toDomain(updated);
  }

  async requestAccountDeletion(
    userId: string,
    deletionRequestedAt: Date,
    deletionEffectiveAt: Date,
  ): Promise<User | null> {
    const result = await this.prisma.user.updateMany({
      where: { id: userId, deletionRequestedAt: null },
      data: {
        deletionRequestedAt,
        deletionEffectiveAt,
        status: AccountStatus.PENDIENTE_ELIMINACION,
      },
    });
    if (result.count === 0) {
      return null;
    }

    const updated = await this.prisma.user.findUnique({
      where: { id: userId },
      include: userInclude,
    });
    if (!updated) {
      return null;
    }
    return toDomain(updated);
  }

  /**
   * GU-02 Esc. 4. Se resuelve en una sola sentencia para que dos peticiones
   * simultaneas no puedan pisarse el contador.
   */
  async registerFailedLogin(
    userId: string,
    maxAttempts: number,
    lockMinutes: number,
  ): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE public.users
         SET failed_login_attempts = failed_login_attempts + 1,
             locked_until = CASE
               WHEN failed_login_attempts + 1 >= ${maxAttempts}
               THEN now() + (${lockMinutes} || ' minutes')::interval
               ELSE locked_until
             END
       WHERE id = ${userId}::uuid`;
  }

  async registerSuccessfulLogin(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        passwordUpdatedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  }
}

function toDomain(row: UserRow): User {
  const assignment = row.staffAssignments?.[0]?.location ?? null;
  return new User({
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    fullName: row.profile?.fullName ?? '',
    role: row.role as Role,
    status: row.status as AccountStatus,
    deletionRequestedAt: row.deletionRequestedAt,
    deletionEffectiveAt: row.deletionEffectiveAt,
    phone: row.profile?.phone ?? null,
    city: row.profile?.city ?? null,
    profilePhotoUrl: row.profile?.photoUrl ?? null,
    assignedLocation: assignment
      ? {
          id: assignment.id,
          name: assignment.name,
          address: assignment.address,
          status: assignment.status,
          restaurantName: assignment.restaurant.businessName,
        }
      : null,
    suspensionReason: row.suspensionReason,
    failedLoginAttempts: row.failedLoginAttempts,
    lockedUntil: row.lockedUntil,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
