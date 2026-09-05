import { Location } from '../../domain/entities/location.entity';
import { LocationStatus } from '../../domain/enums/location-status.enum';
import { ScheduleSlot } from '../../domain/value-objects/schedule-slot';

// El alcance actual de Parchemos opera en Colombia; al agregar expansion por
// pais, este valor debe pasar a ser un campo de la sede.
const PLATFORM_TIME_ZONE = 'America/Bogota';

export interface LocationProfile {
  id: string;
  name: string;
  description: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  logoUrl: string;
  coverUrl: string;
  gallery: { id: string; url: string }[];
  schedules: ScheduleSlot[];
  status: LocationStatus;
  isOpen: boolean;
}

export function toLocationProfile(location: Location): LocationProfile {
  return {
    id: location.id,
    name: location.name,
    description: location.description ?? '',
    address: location.address,
    latitude: location.latitude,
    longitude: location.longitude,
    logoUrl: location.displayLogoUrl(),
    coverUrl: location.displayCoverUrl(),
    gallery: location.images.map((image) => ({ id: image.id, url: image.url })),
    schedules: location.schedules,
    status: location.status,
    isOpen: location.isOpenAt(new Date(), PLATFORM_TIME_ZONE),
  };
}
