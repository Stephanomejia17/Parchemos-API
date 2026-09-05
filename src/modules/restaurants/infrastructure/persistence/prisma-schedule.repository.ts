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
          data: schedules.map((item) => ({ ...item, locationId })),
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
