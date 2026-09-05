import { Restaurant } from '../entities/restaurant.entity';
import { Location } from '../entities/location.entity';

export const RESTAURANT_REPOSITORY = Symbol('RESTAURANT_REPOSITORY');

export interface CreateRestaurantData {
  ownerId: string;
  businessName: string;
}

export interface RestaurantWithLocations {
  restaurant: Restaurant;
  locations: Location[];
}

export interface RestaurantRepository {
  create(data: CreateRestaurantData): Promise<Restaurant>;
  findById(id: string): Promise<Restaurant | null>;
  /** Ownership check de AN-01: null si el restaurante no es de ese dueno. */
  findByIdAndOwner(id: string, ownerId: string): Promise<Restaurant | null>;
  findManyByOwnerWithLocations(
    ownerId: string,
  ): Promise<RestaurantWithLocations[]>;
  /** GU-05: solo un dueno con cuenta activa y aprobada administra personal. */
  isOwnerApproved(ownerId: string): Promise<boolean>;
}
