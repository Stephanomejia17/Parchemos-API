import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from '../../../../common/errors/forbidden-error';
import { Location } from '../../domain/entities/location.entity';
import { LocationStatus } from '../../domain/enums/location-status.enum';
import { LOCATION_REPOSITORY } from '../../domain/repositories/location.repository';
import type { LocationRepository } from '../../domain/repositories/location.repository';
import { assertValidCoordinates } from '../../domain/services/coordinates-validator';
import { UpdateLocationCommand } from '../dto/restaurant.commands';

/** Editar una sede aprobada la vuelve a poner en revision (AN-01). */
@Injectable()
export class UpdateLocationUseCase {
  constructor(
    @Inject(LOCATION_REPOSITORY) private readonly locations: LocationRepository,
  ) {}

  async execute(
    ownerId: string,
    locationId: string,
    command: UpdateLocationCommand,
  ): Promise<Location> {
    const location = await this.locations.findByIdAndOwner(locationId, ownerId);
    if (!location) {
      throw new ForbiddenError(
        'No puedes administrar esta sede.',
        'LOCATION_NOT_OWNED',
      );
    }
    assertValidCoordinates(command);

    return this.locations.update(locationId, {
      ...(command.name !== undefined ? { name: command.name.trim() } : {}),
      ...(command.description !== undefined
        ? { description: command.description.trim() }
        : {}),
      ...(command.address !== undefined
        ? { address: command.address.trim() }
        : {}),
      ...(command.latitude !== undefined ? { latitude: command.latitude } : {}),
      ...(command.longitude !== undefined
        ? { longitude: command.longitude }
        : {}),
      ...(location.isActive()
        ? { status: LocationStatus.PENDING_APPROVAL }
        : {}),
    });
  }
}
