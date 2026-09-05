import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from '../../../../common/errors/forbidden-error';
import { Location } from '../../domain/entities/location.entity';
import { LocationStatus } from '../../domain/enums/location-status.enum';
import { LOCATION_REPOSITORY } from '../../domain/repositories/location.repository';
import type { LocationRepository } from '../../domain/repositories/location.repository';

export type LocationImageKind = 'logo' | 'cover';

/** Fija el logo o la portada a partir de una URL ya alojada (no un archivo). */
@Injectable()
export class SetLocationImageUseCase {
  constructor(
    @Inject(LOCATION_REPOSITORY) private readonly locations: LocationRepository,
  ) {}

  async execute(
    ownerId: string,
    locationId: string,
    kind: LocationImageKind,
    url: string,
  ): Promise<Location> {
    const location = await this.locations.findByIdAndOwner(locationId, ownerId);
    if (!location) {
      throw new ForbiddenError(
        'No puedes administrar esta sede.',
        'LOCATION_NOT_OWNED',
      );
    }
    return this.locations.update(locationId, {
      ...(kind === 'logo' ? { logoUrl: url } : { coverUrl: url }),
      ...(location.isActive()
        ? { status: LocationStatus.PENDING_APPROVAL }
        : {}),
    });
  }
}
