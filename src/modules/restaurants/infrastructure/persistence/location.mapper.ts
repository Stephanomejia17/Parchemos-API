import { Location } from '../../domain/entities/location.entity';
import { LocationStatus } from '../../domain/enums/location-status.enum';

export const locationInclude = {
  schedules: {
    orderBy: [{ dayOfWeek: 'asc' as const }, { startsAt: 'asc' as const }],
  },
  images: { orderBy: { createdAt: 'asc' as const } },
};

export type LocationRow = {
  id: string;
  restaurantId: string;
  name: string;
  description: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  logoUrl: string | null;
  coverUrl: string | null;
  status: string;
  rejectionReason: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  schedules: {
    dayOfWeek: number;
    startsAt: Date | string;
    endsAt: Date | string;
  }[];
  images: { id: string; url: string }[];
};

export function toLocationDomain(row: LocationRow): Location {
  return new Location({
    id: row.id,
    restaurantId: row.restaurantId,
    name: row.name,
    description: row.description,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    logoUrl: row.logoUrl,
    coverUrl: row.coverUrl,
    status: row.status as LocationStatus,
    rejectionReason: row.rejectionReason,
    approvedAt: row.approvedAt,
    schedules: row.schedules.map((schedule) => ({
      dayOfWeek: schedule.dayOfWeek,
      startsAt: formatTime(schedule.startsAt),
      endsAt: formatTime(schedule.endsAt),
    })),
    images: row.images,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

/** Postgres TIME sin zona horaria: Prisma lo entrega como Date en UTC 1970-01-01. */
export function formatTime(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 5);
  const hours = String(value.getUTCHours()).padStart(2, '0');
  const minutes = String(value.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}
