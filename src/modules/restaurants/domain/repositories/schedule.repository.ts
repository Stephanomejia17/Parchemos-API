import { ScheduleSlot } from '../value-objects/schedule-slot';

export const SCHEDULE_REPOSITORY = Symbol('SCHEDULE_REPOSITORY');

export interface ScheduleRepository {
  /** Reemplaza todas las franjas de la sede en una sola operacion atomica (AN-01). */
  replaceForLocation(
    locationId: string,
    schedules: ScheduleSlot[],
  ): Promise<ScheduleSlot[]>;
}
