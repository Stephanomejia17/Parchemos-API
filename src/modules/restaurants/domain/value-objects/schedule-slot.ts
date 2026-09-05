/** Franja de atencion de un dia (AN-01). 0 = domingo .. 6 = sabado. */
export interface ScheduleSlot {
  dayOfWeek: number;
  /** Formato HH:mm. */
  startsAt: string;
  /** Formato HH:mm. */
  endsAt: string;
}
