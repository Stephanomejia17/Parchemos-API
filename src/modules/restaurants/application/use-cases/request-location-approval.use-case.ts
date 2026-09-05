import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from '../../../../common/errors/forbidden-error';
import { ValidationError } from '../../../../common/errors/validation-error';
import { Location } from '../../domain/entities/location.entity';
import { LocationStatus } from '../../domain/enums/location-status.enum';
import { LOCATION_REPOSITORY } from '../../domain/repositories/location.repository';
import type { LocationRepository } from '../../domain/repositories/location.repository';

@Injectable()
export class RequestLocationApprovalUseCase {
  constructor(
    @Inject(LOCATION_REPOSITORY) private readonly locations: LocationRepository,
  ) {}

  async execute(ownerId: string, locationId: string): Promise<Location> {
    const location = await this.locations.findByIdAndOwner(locationId, ownerId);
    if (!location) {
      throw new ForbiddenError(
        'No puedes administrar esta sede.',
        'LOCATION_NOT_OWNED',
      );
    }

    const missing = location.missingRequiredFields();
    if (missing.length) {
      throw new ValidationError(
        'Completa la información requerida antes de solicitar autorización.',
        'PERFIL_INCOMPLETO',
        { fields: missing },
      );
    }
    if (location.isActive()) {
      throw new ValidationError(
        'Esta sede ya está aprobada.',
        'LOCATION_ALREADY_ACTIVE',
      );
    }

    return this.locations.update(locationId, {
      status: LocationStatus.PENDING_APPROVAL,
      rejectionReason: null,
    });
  }
}
