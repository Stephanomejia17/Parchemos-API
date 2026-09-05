import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from '../../../../common/errors/forbidden-error';
import { ValidationError } from '../../../../common/errors/validation-error';
import { LocationStatus } from '../../domain/enums/location-status.enum';
import { LOCATION_REPOSITORY } from '../../domain/repositories/location.repository';
import type { LocationRepository } from '../../domain/repositories/location.repository';
import { LocationImageItem } from '../../domain/value-objects/location-image-item';

/** Galeria por URL ya alojada: limite propio de 20, distinto del de subida directa. */
const MAX_GALLERY_URLS = 20;

@Injectable()
export class AddGalleryImageUseCase {
  constructor(
    @Inject(LOCATION_REPOSITORY) private readonly locations: LocationRepository,
  ) {}

  async execute(
    ownerId: string,
    locationId: string,
    url: string,
  ): Promise<LocationImageItem> {
    const location = await this.locations.findByIdAndOwner(locationId, ownerId);
    if (!location) {
      throw new ForbiddenError(
        'No puedes administrar esta sede.',
        'LOCATION_NOT_OWNED',
      );
    }
    const count = await this.locations.countGalleryImages(locationId);
    if (count >= MAX_GALLERY_URLS) {
      throw new ValidationError(
        'La galería permite máximo 20 imágenes.',
        'GALLERY_LIMIT_REACHED',
      );
    }
    const image = await this.locations.addGalleryImage(locationId, url);
    if (location.isActive()) {
      await this.locations.update(locationId, {
        status: LocationStatus.PENDING_APPROVAL,
      });
    }
    return image;
  }
}
