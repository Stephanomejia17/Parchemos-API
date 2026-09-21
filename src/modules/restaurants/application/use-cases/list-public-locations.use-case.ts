import { Inject, Injectable } from '@nestjs/common';
import { LOCATION_REPOSITORY } from '../../domain/repositories/location.repository';
import type { LocationRepository } from '../../domain/repositories/location.repository';

@Injectable()
export class ListPublicLocationsUseCase {
  constructor(
    @Inject(LOCATION_REPOSITORY)
    private readonly locations: LocationRepository,
  ) {}

  execute() {
    return this.locations.findAllActive();
  }
}