import { Inject, Injectable } from '@nestjs/common';
import { StaffMember } from '../../domain/entities/staff-member.entity';
import { RESTAURANT_REPOSITORY } from '../../domain/repositories/restaurant.repository';
import type { RestaurantRepository } from '../../domain/repositories/restaurant.repository';
import { STAFF_REPOSITORY } from '../../domain/repositories/staff.repository';
import type { StaffRepository } from '../../domain/repositories/staff.repository';
import { UpdateStaffCommand } from '../dto/restaurant.commands';
import { getOwnedStaff } from './get-owned-staff';

@Injectable()
export class UpdateStaffUseCase {
  constructor(
    @Inject(RESTAURANT_REPOSITORY)
    private readonly restaurants: RestaurantRepository,
    @Inject(STAFF_REPOSITORY) private readonly staff: StaffRepository,
  ) {}

  async execute(
    ownerId: string,
    staffId: string,
    command: UpdateStaffCommand,
  ): Promise<StaffMember> {
    await getOwnedStaff(this.restaurants, this.staff, ownerId, staffId);
    return this.staff.updateProfile(staffId, {
      ...(command.fullName !== undefined
        ? { fullName: command.fullName.trim() }
        : {}),
      ...(command.phone !== undefined
        ? { phone: command.phone.trim() || null }
        : {}),
    });
  }
}
