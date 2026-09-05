import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from '../../../../common/errors/forbidden-error';
import { LOCATION_REPOSITORY } from '../../domain/repositories/location.repository';
import type { LocationRepository } from '../../domain/repositories/location.repository';
import { LocationProfile, toLocationProfile } from './location-profile.mapper';

/** Vista previa del dueno: igual que el perfil publico, pero sin exigir status activa. */
@Injectable()
export class PreviewLocationUseCase {
  constructor(
    @Inject(LOCATION_REPOSITORY) private readonly locations: LocationRepository,
  ) {}

  async execute(ownerId: string, locationId: string): Promise<LocationProfile> {
    const location = await this.locations.findByIdAndOwner(locationId, ownerId);
    if (!location) {
      throw new ForbiddenError(
        'No puedes administrar esta sede.',
        'LOCATION_NOT_OWNED',
      );
    }
    return toLocationProfile(location);
  }
}
