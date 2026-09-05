import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../../common/errors/not-found-error';
import { Location } from '../../domain/entities/location.entity';
import { LocationStatus } from '../../domain/enums/location-status.enum';
import { LOCATION_REPOSITORY } from '../../domain/repositories/location.repository';
import type { LocationRepository } from '../../domain/repositories/location.repository';

@Injectable()
export class RejectLocationUseCase {
  constructor(
    @Inject(LOCATION_REPOSITORY) private readonly locations: LocationRepository,
  ) {}

  async execute(locationId: string, reason: string): Promise<Location> {
    const existing = await this.locations.findById(locationId);
    if (!existing) {
      throw new NotFoundError('La sede no existe.', 'LOCATION_NOT_FOUND');
    }
    return this.locations.update(locationId, {
      status: LocationStatus.REJECTED,
      rejectionReason: reason.trim(),
      approvedAt: null,
    });
  }
}
