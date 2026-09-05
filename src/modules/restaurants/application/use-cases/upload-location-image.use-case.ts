import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from '../../../../common/errors/forbidden-error';
import { ValidationError } from '../../../../common/errors/validation-error';
import { Location } from '../../domain/entities/location.entity';
import { LOCATION_REPOSITORY } from '../../domain/repositories/location.repository';
import type { LocationRepository } from '../../domain/repositories/location.repository';
import { IMAGE_STORAGE } from '../../domain/services/image-storage';
import type {
  ImageFile,
  ImageStorage,
} from '../../domain/services/image-storage';
import { LocationImageItem } from '../../domain/value-objects/location-image-item';

export type UploadableImageKind = 'logo' | 'cover' | 'gallery';

/** La galeria por archivo tiene su propio limite (5), distinto del limite de
 *  la galeria por URL (20): es una inconsistencia preexistente, no la cambio
 *  aqui para no alterar comportamiento fuera del alcance de esta migracion. */
const MAX_GALLERY_UPLOADS = 5;

@Injectable()
export class UploadLocationImageUseCase {
  constructor(
    @Inject(LOCATION_REPOSITORY) private readonly locations: LocationRepository,
    @Inject(IMAGE_STORAGE) private readonly imageStorage: ImageStorage,
  ) {}

  async execute(
    ownerId: string,
    locationId: string,
    kind: UploadableImageKind,
    file: ImageFile,
  ): Promise<Location | LocationImageItem> {
    const location = await this.locations.findByIdAndOwner(locationId, ownerId);
    if (!location) {
      throw new ForbiddenError(
        'No puedes administrar esta sede.',
        'LOCATION_NOT_OWNED',
      );
    }

    const uploaded = await this.imageStorage.uploadImage(
      file,
      `locations/${locationId}/${kind}`,
    );

    if (kind === 'gallery') {
      const count = await this.locations.countGalleryImages(locationId);
      if (count >= MAX_GALLERY_UPLOADS) {
        await this.imageStorage.remove(uploaded.path);
        throw new ValidationError(
          'La galería permite máximo 5 imágenes.',
          'GALLERY_LIMIT_REACHED',
        );
      }
      return this.locations.addGalleryImage(locationId, uploaded.publicUrl);
    }

    const previousUrl = kind === 'logo' ? location.logoUrl : location.coverUrl;
    const updated = await this.locations.update(locationId, {
      ...(kind === 'logo'
        ? { logoUrl: uploaded.publicUrl }
        : { coverUrl: uploaded.publicUrl }),
    });
    const previousPath = previousUrl
      ? this.imageStorage.pathFromPublicUrl(previousUrl)
      : null;
    if (previousPath) await this.imageStorage.remove(previousPath);
    return updated;
  }
}
