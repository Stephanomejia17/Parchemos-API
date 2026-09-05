import { Inject, Injectable } from '@nestjs/common';
import { LOCATION_REPOSITORY } from '../../domain/repositories/location.repository';
import type {
  LocationOwnerInfo,
  LocationRepository,
} from '../../domain/repositories/location.repository';

@Injectable()
export class ListAllLocationsForAdminUseCase {
  constructor(
    @Inject(LOCATION_REPOSITORY) private readonly locations: LocationRepository,
  ) {}

  execute(): Promise<LocationOwnerInfo[]> {
    return this.locations.findAllForAdmin();
  }
}
