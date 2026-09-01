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

type UserRow = {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  phone: string | null;
  profilePhotoUrl: string | null;
  city: string | null;
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
};

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    // La columna es `citext`, asi que la comparacion ya ignora mayusculas.
    const row = await this.prisma.user.findUnique({ where: { email } });
    return row ? toDomain(row) : null;
  }

  async create(data: CreateUserData): Promise<User> {
    const row = await this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        fullName: data.fullName,
        phone: data.phone,
        role: data.role,
        // GU-01 Esc. 2: el restaurante nace pendiente de aprobacion.
        status:
          data.role === Role.RESTAURANTE
            ? AccountStatus.PENDIENTE_APROBACION
            : AccountStatus.ACTIVA,
        termsAcceptedAt: data.acceptedAt,
        privacyAcceptedAt: data.acceptedAt,
        termsVersion: data.termsVersion,
      },
    });
    return toDomain(row);
  }

  async updateProfile(
    userId: string,
    data: UpdateUserProfileData,
  ): Promise<User | null> {
    const current = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!current) {
      return null;
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.fullName !== undefined ? { fullName: data.fullName.trim() } : {}),
        ...(data.phone !== undefined
          ? { phone: data.phone === null ? null : data.phone.trim() }
          : {}),
        ...(data.city !== undefined
          ? { city: data.city === null ? null : data.city.trim() }
          : {}),
        ...(data.profilePhotoUrl !== undefined
          ? {
              profilePhotoUrl:
                data.profilePhotoUrl === null ? null : data.profilePhotoUrl.trim(),
            }
          : {}),
      },
    });

    return toDomain(updated);
  }

  async requestAccountDeletion(
    userId: string,
    deletionRequestedAt: Date,
    deletionEffectiveAt: Date,
  ): Promise<User | null> {
    const current = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!current) {
      return null;
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        deletionRequestedAt,
        deletionEffectiveAt,
      },
    });

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
}

function toDomain(row: UserRow): User {
  return new User({
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    fullName: row.fullName,
    role: row.role as Role,
    status: row.status as AccountStatus,
    suspensionReason: row.suspensionReason,
    failedLoginAttempts: row.failedLoginAttempts,
    lockedUntil: row.lockedUntil,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
