import { Inject, Injectable } from '@nestjs/common';
import { StaffMember } from '../../domain/entities/staff-member.entity';
import { RESTAURANT_REPOSITORY } from '../../domain/repositories/restaurant.repository';
import type { RestaurantRepository } from '../../domain/repositories/restaurant.repository';
import { STAFF_REPOSITORY } from '../../domain/repositories/staff.repository';
import type { StaffRepository } from '../../domain/repositories/staff.repository';
import { assertApprovedOwner } from './assert-approved-owner';

/** GU-05: solo el restaurante propietario y aprobado gestiona su personal. */
@Injectable()
export class ListStaffUseCase {
  constructor(
    @Inject(RESTAURANT_REPOSITORY)
    private readonly restaurants: RestaurantRepository,
    @Inject(STAFF_REPOSITORY) private readonly staff: StaffRepository,
  ) {}

  async execute(ownerId: string): Promise<StaffMember[]> {
    await assertApprovedOwner(this.restaurants, ownerId);
    return this.staff.findManyByOwner(ownerId);
  }
}
