import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from '../../../../common/errors/forbidden-error';
import { StaffMember } from '../../domain/entities/staff-member.entity';
import { LOCATION_REPOSITORY } from '../../domain/repositories/location.repository';
import type { LocationRepository } from '../../domain/repositories/location.repository';
import { RESTAURANT_REPOSITORY } from '../../domain/repositories/restaurant.repository';
import type { RestaurantRepository } from '../../domain/repositories/restaurant.repository';
import { STAFF_REPOSITORY } from '../../domain/repositories/staff.repository';
import type { StaffRepository } from '../../domain/repositories/staff.repository';
import { getOwnedStaff } from './get-owned-staff';

@Injectable()
export class ReassignStaffUseCase {
  constructor(
    @Inject(RESTAURANT_REPOSITORY)
    private readonly restaurants: RestaurantRepository,
    @Inject(LOCATION_REPOSITORY) private readonly locations: LocationRepository,
    @Inject(STAFF_REPOSITORY) private readonly staff: StaffRepository,
  ) {}

  async execute(
    ownerId: string,
    staffId: string,
    locationId: string,
  ): Promise<StaffMember> {
    await getOwnedStaff(this.restaurants, this.staff, ownerId, staffId);
    const location = await this.locations.findByIdAndOwner(locationId, ownerId);
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
    return this.staff.reassignLocation(staffId, locationId);
  }
}
