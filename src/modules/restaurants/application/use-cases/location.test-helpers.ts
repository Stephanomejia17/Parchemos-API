import { Location, LocationProps } from '../../domain/entities/location.entity';
import { LocationStatus } from '../../domain/enums/location-status.enum';

export function makeLocation(overrides: Partial<LocationProps> = {}): Location {
  return new Location({
    id: 'loc-1',
    restaurantId: 'restaurant-1',
    name: 'Sede de prueba',
    description: null,
    address: 'Calle 123',
    latitude: null,
    longitude: null,
    logoUrl: null,
    coverUrl: null,
    status: LocationStatus.PENDING_APPROVAL,
    rejectionReason: null,
    approvedAt: null,
    schedules: [{ dayOfWeek: 1, startsAt: '09:00', endsAt: '18:00' }],
    images: [],
    ...overrides,
  });
}
