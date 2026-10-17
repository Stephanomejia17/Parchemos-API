export const RECOMMENDATION_SOURCE = Symbol('RECOMMENDATION_SOURCE');

export interface DinerTasteProfile {
  preferredCuisines: { id: string }[];
  priceRangeMin: number | null;
  priceRangeMax: number | null;
  /** Pedidos realizados (no cancelados) por sede. */
  ordersByLocation: { locationId: string; count: number }[];
}

export interface RecommendationSource {
  /** Gustos (`user_cuisine_preferences`, `user_preferences`) e historial (`orders`). */
  getProfile(userId: string): Promise<DinerTasteProfile>;
  /** Tipos de cocina de cada sede (`location_cuisines`). */
  getLocationCuisines(
    locationIds: string[],
  ): Promise<{ locationId: string; cuisineId: string; name: string }[]>;
}
