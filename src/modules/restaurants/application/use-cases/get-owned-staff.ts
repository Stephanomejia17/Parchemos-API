import { NotFoundError } from '../../../../common/errors/not-found-error';
import { StaffMember } from '../../domain/entities/staff-member.entity';
import type { RestaurantRepository } from '../../domain/repositories/restaurant.repository';
import type { StaffRepository } from '../../domain/repositories/staff.repository';
import { assertApprovedOwner } from './assert-approved-owner';

/** Compartido por los casos de uso que operan sobre un miembro de personal puntual. */
export async function getOwnedStaff(
  restaurants: RestaurantRepository,
  staff: StaffRepository,
  ownerId: string,
  staffId: string,
): Promise<StaffMember> {
  await assertApprovedOwner(restaurants, ownerId);
  const member = await staff.findByIdAndOwner(ownerId, staffId);
  if (!member) {
    throw new NotFoundError(
      'La cuenta de personal no existe en tu restaurante.',
      'STAFF_NOT_FOUND',
    );
  }
  return member;
}
