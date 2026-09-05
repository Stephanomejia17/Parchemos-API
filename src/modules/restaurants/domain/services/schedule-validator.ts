import { ValidationError } from '../../../../common/errors/validation-error';
import { ScheduleSlot } from '../value-objects/schedule-slot';

/**
 * AN-01/PARCHE-148: valida las franjas antes de guardarlas. El EXCLUDE de la
 * base es la ultima linea de defensa; esto evita el viaje redondo cuando el
 * error es evidente desde el propio payload.
 */
export function assertValidSchedules(schedules: ScheduleSlot[]): void {
  const grouped = new Map<number, ScheduleSlot[]>();
  for (const schedule of schedules) {
    if (schedule.dayOfWeek > 6) {
      throw new ValidationError(
        'El día de la semana debe estar entre 0 y 6.',
        'INVALID_SCHEDULE',
      );
    }
    if (schedule.startsAt >= schedule.endsAt) {
      throw new ValidationError(
        'La hora de inicio debe ser anterior a la hora de fin.',
        'INVALID_SCHEDULE',
      );
    }
    grouped.set(schedule.dayOfWeek, [
      ...(grouped.get(schedule.dayOfWeek) ?? []),
      schedule,
    ]);
  }
  for (const items of grouped.values()) {
    const sorted = [...items].sort((a, b) =>
      a.startsAt.localeCompare(b.startsAt),
    );
    if (
      sorted.some(
        (item, index) => index > 0 && item.startsAt < sorted[index - 1].endsAt,
      )
    ) {
      throw new ValidationError(
        'Las franjas de un mismo día no pueden superponerse.',
        'OVERLAPPING_SCHEDULE',
      );
    }
  }
}
