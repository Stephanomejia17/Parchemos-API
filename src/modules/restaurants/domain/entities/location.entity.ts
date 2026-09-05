import { BaseEntity } from '../../../../common/domain/base.entity';
import { LocationStatus } from '../enums/location-status.enum';
import { LocationImageItem } from '../value-objects/location-image-item';
import { ScheduleSlot } from '../value-objects/schedule-slot';

const DEFAULT_LOGO_URL = 'https://placehold.co/256x256?text=Parchemos';
const DEFAULT_COVER_URL = 'https://placehold.co/1200x600?text=Restaurante';

export interface LocationProps {
  id: string;
  restaurantId: string;
  name: string;
  description: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  logoUrl: string | null;
  coverUrl: string | null;
  status: LocationStatus;
  rejectionReason: string | null;
  approvedAt: Date | null;
  schedules: ScheduleSlot[];
  images: LocationImageItem[];
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Sede (establecimiento fisico): la unidad que el comensal ve, califica,
 * reserva y a la que pide (AN-01, PU-06, PU-08).
 */
export class Location extends BaseEntity {
  readonly restaurantId: string;
  readonly name: string;
  readonly description: string | null;
  readonly address: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly logoUrl: string | null;
  readonly coverUrl: string | null;
  readonly status: LocationStatus;
  readonly rejectionReason: string | null;
  readonly approvedAt: Date | null;
  readonly schedules: ScheduleSlot[];
  readonly images: LocationImageItem[];

  constructor(props: LocationProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.restaurantId = props.restaurantId;
    this.name = props.name;
    this.description = props.description;
    this.address = props.address;
    this.latitude = props.latitude;
    this.longitude = props.longitude;
    this.logoUrl = props.logoUrl;
    this.coverUrl = props.coverUrl;
    this.status = props.status;
    this.rejectionReason = props.rejectionReason;
    this.approvedAt = props.approvedAt;
    this.schedules = props.schedules;
    this.images = props.images;
  }

  isActive(): boolean {
    return this.status === LocationStatus.ACTIVE;
  }

  displayLogoUrl(): string {
    return this.logoUrl ?? DEFAULT_LOGO_URL;
  }

  displayCoverUrl(): string {
    return this.coverUrl ?? DEFAULT_COVER_URL;
  }

  /** AN-01/PU-08: nombre, direccion y al menos un horario son obligatorios para operar. */
  missingRequiredFields(): string[] {
    const missing: string[] = [];
    if (!this.name.trim()) missing.push('name');
    if (!this.address.trim()) missing.push('address');
    if (!this.schedules.length) missing.push('schedules');
    return missing;
  }

  /** MB-01/DO-01: si esta abierta ahora mismo, segun sus horarios y la zona horaria dada. */
  isOpenAt(now: Date, timeZone: string): boolean {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? '';
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
      value('weekday'),
    );
    const time = `${value('hour')}:${value('minute')}`;
    return this.schedules.some(
      (schedule) =>
        schedule.dayOfWeek === day &&
        schedule.startsAt <= time &&
        time < schedule.endsAt,
    );
  }
}
