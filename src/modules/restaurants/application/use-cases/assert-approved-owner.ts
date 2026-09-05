import { ForbiddenError } from '../../../../common/errors/forbidden-error';
import type { RestaurantRepository } from '../../domain/repositories/restaurant.repository';

/** GU-05: solo un dueno con cuenta activa y aprobada administra personal. Compartido por los casos de uso de personal. */
export async function assertApprovedOwner(
  restaurants: RestaurantRepository,
  ownerId: string,
): Promise<void> {
  const approved = await restaurants.isOwnerApproved(ownerId);
  if (!approved) {
    throw new ForbiddenError(
      'Debes esperar la aprobación del administrador para gestionar personal.',
      'OWNER_NOT_APPROVED',
    );
  }
}
