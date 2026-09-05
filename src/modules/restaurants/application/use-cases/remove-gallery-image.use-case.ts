import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from '../../../../common/errors/forbidden-error';
import { NotFoundError } from '../../../../common/errors/not-found-error';
import { LOCATION_REPOSITORY } from '../../domain/repositories/location.repository';
import type { LocationRepository } from '../../domain/repositories/location.repository';

@Injectable()
export class RemoveGalleryImageUseCase {
  constructor(
    @Inject(LOCATION_REPOSITORY) private readonly locations: LocationRepository,
  ) {}

  async execute(
    ownerId: string,
    locationId: string,
    imageId: string,
  ): Promise<void> {
    const location = await this.locations.findByIdAndOwner(locationId, ownerId);
    if (!location) {
      throw new ForbiddenError(
        'No puedes administrar esta sede.',
        'LOCATION_NOT_OWNED',
      );
    }
    const removed = await this.locations.removeGalleryImage(
      locationId,
      imageId,
    );
    if (!removed) {
      throw new NotFoundError(
        'La imagen no existe en esta galería.',
        'IMAGE_NOT_FOUND',
      );
    }
  }
}
