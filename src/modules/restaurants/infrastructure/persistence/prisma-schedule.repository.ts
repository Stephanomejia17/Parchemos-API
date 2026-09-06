import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { ScheduleRepository } from '../../domain/repositories/schedule.repository';
import { ScheduleSlot } from '../../domain/value-objects/schedule-slot';
import { formatTime } from './location.mapper';

@Injectable()
export class PrismaScheduleRepository implements ScheduleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async replaceForLocation(
    locationId: string,
    schedules: ScheduleSlot[],
  ): Promise<ScheduleSlot[]> {
    return this.prisma.$transaction(async (tx) => {
      await tx.locationSchedule.deleteMany({ where: { locationId } });
      if (schedules.length) {
        await tx.locationSchedule.createMany({
          data: schedules.map((item) => ({
            locationId,
            dayOfWeek: item.dayOfWeek,
            // Prisma representa PostgreSQL TIME como DateTime. Usamos una
            // fecha fija en UTC para conservar únicamente la hora enviada.
            startsAt: timeToDate(item.startsAt),
            endsAt: timeToDate(item.endsAt),
          })),
        });
      }
      const rows = await tx.locationSchedule.findMany({
        where: { locationId },
        orderBy: [{ dayOfWeek: 'asc' }, { startsAt: 'asc' }],
      });
      return rows.map((row) => ({
        dayOfWeek: row.dayOfWeek,
        startsAt: formatTime(row.startsAt),
        endsAt: formatTime(row.endsAt),
      }));
    });
  }
}

function timeToDate(value: string): Date {
  const [hours, minutes] = value.split(':').map(Number);
  return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0, 0));
}
