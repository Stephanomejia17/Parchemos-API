import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from '../../../../common/errors/forbidden-error';
import { LocationStatus } from '../../domain/enums/location-status.enum';
import { LOCATION_REPOSITORY } from '../../domain/repositories/location.repository';
import type { LocationRepository } from '../../domain/repositories/location.repository';
import { SCHEDULE_REPOSITORY } from '../../domain/repositories/schedule.repository';
import type { ScheduleRepository } from '../../domain/repositories/schedule.repository';
import { assertValidSchedules } from '../../domain/services/schedule-validator';
import { ScheduleSlot } from '../../domain/value-objects/schedule-slot';

@Injectable()
export class ReplaceSchedulesUseCase {
  constructor(
    @Inject(LOCATION_REPOSITORY) private readonly locations: LocationRepository,
    @Inject(SCHEDULE_REPOSITORY)
    private readonly schedules: ScheduleRepository,
  ) {}

  async execute(
    ownerId: string,
    locationId: string,
    slots: ScheduleSlot[],
  ): Promise<ScheduleSlot[]> {
    const location = await this.locations.findByIdAndOwner(locationId, ownerId);
    if (!location) {
      throw new ForbiddenError(
        'No puedes administrar esta sede.',
        'LOCATION_NOT_OWNED',
      );
    }
    assertValidSchedules(slots);

    const replaced = await this.schedules.replaceForLocation(locationId, slots);
    if (location.isActive()) {
      await this.locations.update(locationId, {
        status: LocationStatus.PENDING_APPROVAL,
      });
    }
    return replaced;
  }
}
