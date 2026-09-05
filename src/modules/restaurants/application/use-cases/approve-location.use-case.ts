import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../../common/errors/not-found-error';
import { ValidationError } from '../../../../common/errors/validation-error';
import { Location } from '../../domain/entities/location.entity';
import { LocationStatus } from '../../domain/enums/location-status.enum';
import { LOCATION_REPOSITORY } from '../../domain/repositories/location.repository';
import type { LocationRepository } from '../../domain/repositories/location.repository';

@Injectable()
export class ApproveLocationUseCase {
  constructor(
    @Inject(LOCATION_REPOSITORY) private readonly locations: LocationRepository,
  ) {}

  async execute(locationId: string): Promise<Location> {
    const location = await this.locations.findById(locationId);
    if (!location) {
      throw new NotFoundError('La sede no existe.', 'LOCATION_NOT_FOUND');
    }
    if (location.status !== LocationStatus.PENDING_APPROVAL) {
      throw new ValidationError(
        'Solo puedes aprobar una sede pendiente.',
        'LOCATION_NOT_PENDING',
      );
    }
    const missing = location.missingRequiredFields();
    if (missing.length) {
      throw new ValidationError(
        'La sede no tiene toda la información requerida.',
        'PERFIL_INCOMPLETO',
        { fields: missing },
      );
    }

    return this.locations.update(locationId, {
      status: LocationStatus.ACTIVE,
      approvedAt: new Date(),
      rejectionReason: null,
    });
  }
}
