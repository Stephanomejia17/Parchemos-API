import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../../common/errors/not-found-error';
import { LOCATION_REPOSITORY } from '../../domain/repositories/location.repository';
import type { LocationRepository } from '../../domain/repositories/location.repository';
import { LocationProfile, toLocationProfile } from './location-profile.mapper';

/** Solo las sedes aprobadas se exponen a los comensales (MB-01, DO-01). */
@Injectable()
export class GetPublicLocationProfileUseCase {
  constructor(
    @Inject(LOCATION_REPOSITORY) private readonly locations: LocationRepository,
  ) {}

  async execute(locationId: string): Promise<LocationProfile> {
    const location = await this.locations.findActiveById(locationId);
    if (!location) {
      throw new NotFoundError(
        'El restaurante no está disponible.',
        'LOCATION_NOT_FOUND',
      );
    }
    return toLocationProfile(location);
  }
}
