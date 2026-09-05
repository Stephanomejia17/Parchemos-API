import { Inject, Injectable } from '@nestjs/common';
import { StaffMember } from '../../domain/entities/staff-member.entity';
import { RESTAURANT_REPOSITORY } from '../../domain/repositories/restaurant.repository';
import type { RestaurantRepository } from '../../domain/repositories/restaurant.repository';
import { STAFF_REPOSITORY } from '../../domain/repositories/staff.repository';
import type { StaffRepository } from '../../domain/repositories/staff.repository';
import { getOwnedStaff } from './get-owned-staff';

/**
 * Deshabilitar solo cambia el status: el guard revisa la cuenta contra la
 * base en cada peticion, asi que el acceso se corta de inmediato aunque el
 * access token de Supabase siga sin expirar.
 */
@Injectable()
export class SetStaffEnabledUseCase {
  constructor(
    @Inject(RESTAURANT_REPOSITORY)
    private readonly restaurants: RestaurantRepository,
    @Inject(STAFF_REPOSITORY) private readonly staff: StaffRepository,
  ) {}

  async execute(
    ownerId: string,
    staffId: string,
    enabled: boolean,
  ): Promise<StaffMember> {
    await getOwnedStaff(this.restaurants, this.staff, ownerId, staffId);
    return this.staff.setEnabled(staffId, enabled);
  }
}
