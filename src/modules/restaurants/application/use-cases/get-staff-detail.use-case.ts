import { Inject, Injectable } from '@nestjs/common';
import { StaffMember } from '../../domain/entities/staff-member.entity';
import { RESTAURANT_REPOSITORY } from '../../domain/repositories/restaurant.repository';
import type { RestaurantRepository } from '../../domain/repositories/restaurant.repository';
import { STAFF_REPOSITORY } from '../../domain/repositories/staff.repository';
import type { StaffRepository } from '../../domain/repositories/staff.repository';
import { getOwnedStaff } from './get-owned-staff';

@Injectable()
export class GetStaffDetailUseCase {
  constructor(
    @Inject(RESTAURANT_REPOSITORY)
    private readonly restaurants: RestaurantRepository,
    @Inject(STAFF_REPOSITORY) private readonly staff: StaffRepository,
  ) {}

  execute(ownerId: string, staffId: string): Promise<StaffMember> {
    return getOwnedStaff(this.restaurants, this.staff, ownerId, staffId);
  }
}
