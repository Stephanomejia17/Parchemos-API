import { Inject, Injectable } from '@nestjs/common';
import { ConflictError } from '../../../../common/errors/conflict-error';
import { ForbiddenError } from '../../../../common/errors/forbidden-error';
import { SupabaseAuthService } from '../../../../infrastructure/auth/supabase-auth.service';
import { SupabaseUserAlreadyExistsError } from '../../../auth/domain/errors/supabase-user-already-exists.error';
import { StaffMember } from '../../domain/entities/staff-member.entity';
import { LOCATION_REPOSITORY } from '../../domain/repositories/location.repository';
import type { LocationRepository } from '../../domain/repositories/location.repository';
import { RESTAURANT_REPOSITORY } from '../../domain/repositories/restaurant.repository';
import type { RestaurantRepository } from '../../domain/repositories/restaurant.repository';
import { STAFF_REPOSITORY } from '../../domain/repositories/staff.repository';
import type { StaffRepository } from '../../domain/repositories/staff.repository';
import { CreateStaffCommand } from '../dto/restaurant.commands';
import { assertApprovedOwner } from './assert-approved-owner';

const EMAIL_IN_USE_MESSAGE = 'Ese correo ya está en uso.';

@Injectable()
export class CreateStaffUserUseCase {
  constructor(
    @Inject(RESTAURANT_REPOSITORY)
    private readonly restaurants: RestaurantRepository,
    @Inject(LOCATION_REPOSITORY) private readonly locations: LocationRepository,
    @Inject(STAFF_REPOSITORY) private readonly staff: StaffRepository,
    private readonly supabaseAuth: SupabaseAuthService,
  ) {}

  async execute(
    ownerId: string,
    command: CreateStaffCommand,
  ): Promise<StaffMember> {
    await assertApprovedOwner(this.restaurants, ownerId);

    const location = await this.locations.findByIdAndOwner(
      command.locationId,
      ownerId,
    );
    if (!location) {
      throw new ForbiddenError(
        'La sede seleccionada no pertenece a tu restaurante.',
        'LOCATION_NOT_OWNED',
      );
    }
    if (!location.isActive()) {
      throw new ForbiddenError(
        'Solo puedes asignar personal a una sede aprobada.',
        'LOCATION_NOT_ACTIVE',
      );
    }

    const email = command.email.trim().toLowerCase();
    if (await this.staff.emailInUse(email)) {
      throw new ConflictError(EMAIL_IN_USE_MESSAGE, 'EMAIL_ALREADY_IN_USE');
    }

    const supabaseUser = await this.createSupabaseIdentity(
      email,
      command.initialPassword,
    );

    try {
      return await this.staff.create({
        id: supabaseUser.id,
        email,
        fullName: command.fullName.trim(),
        phone: command.phone?.trim() || null,
        locationId: command.locationId,
      });
    } catch (error) {
      // La cuenta de Supabase ya se creo pero el perfil local fallo: se
      // revierte para no dejar una identidad huerfana sin datos en la app.
      await this.supabaseAuth
        .deleteUser(supabaseUser.id)
        .catch(() => undefined);
      if (isUniqueViolation(error)) {
        throw new ConflictError(EMAIL_IN_USE_MESSAGE, 'EMAIL_ALREADY_IN_USE');
      }
      throw error;
    }
  }

  private async createSupabaseIdentity(email: string, password: string) {
    try {
      return await this.supabaseAuth.createUser({ email, password });
    } catch (error) {
      if (error instanceof SupabaseUserAlreadyExistsError) {
        throw new ConflictError(EMAIL_IN_USE_MESSAGE, 'EMAIL_ALREADY_IN_USE');
      }
      throw error;
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === 'P2002';
}
