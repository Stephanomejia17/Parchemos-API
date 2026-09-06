import { Location } from '../entities/location.entity';
import { LocationStatus } from '../enums/location-status.enum';
import { LocationImageItem } from '../value-objects/location-image-item';

export const LOCATION_REPOSITORY = Symbol('LOCATION_REPOSITORY');

export interface CreateLocationData {
  restaurantId: string;
  name: string;
  description: string | null;
  address: string;
  latitude?: number;
  longitude?: number;
}

export interface UpdateLocationData {
  name?: string;
  description?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  status?: LocationStatus;
  logoUrl?: string;
  coverUrl?: string;
  rejectionReason?: string | null;
  approvedAt?: Date | null;
}

export interface LocationOwnerInfo {
  id: string;
  name: string;
  address: string;
  status: LocationStatus;
  rejectionReason: string | null;
  approvedAt: Date | null;
  restaurant: {
    id: string;
    businessName: string;
    owner: {
      id: string;
      fullName: string;
      email: string;
    };
  };
}

export interface LocationRepository {
  create(data: CreateLocationData): Promise<Location>;
  update(id: string, data: UpdateLocationData): Promise<Location>;
  findById(id: string): Promise<Location | null>;
  /** Ownership check de AN-01: null si la sede no es de un restaurante de ese dueno. */
  findByIdAndOwner(id: string, ownerId: string): Promise<Location | null>;
  /** Solo sedes activas: lo que puede ver un comensal (MB-01, DO-01). */
  findActiveById(id: string): Promise<Location | null>;
  findPendingForReview(): Promise<LocationOwnerInfo[]>;
  findAllForAdmin(): Promise<LocationOwnerInfo[]>;
  addGalleryImage(locationId: string, url: string): Promise<LocationImageItem>;
  removeGalleryImage(locationId: string, imageId: string): Promise<boolean>;
  countGalleryImages(locationId: string): Promise<number>;
}
