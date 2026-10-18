export const FAVORITE_REPOSITORY = Symbol('FAVORITE_REPOSITORY');

/** Umbral de "destacado" (RN1 de DO-02): calificacion promedio >= 4.5. */
export const FEATURED_RATING_THRESHOLD = 4.5;

export function isFeatured(avgRating: number | undefined): boolean {
  return (avgRating ?? 0) >= FEATURED_RATING_THRESHOLD;
}

export interface FavoriteRepository {
  /**
   * Agrega la sede a los favoritos. Idempotente (RN5): si ya estaba, no hace
   * nada. La PK (user_id, location_id) impide duplicados aun con doble clic
   * (CA8), incluso con peticiones concurrentes.
   */
  add(userId: string, locationId: string): Promise<void>;
  /** Quita la sede de los favoritos. Idempotente: si no estaba, no hace nada. */
  remove(userId: string, locationId: string): Promise<void>;
  /** Ids de las sedes favoritas, la mas reciente primero. */
  listLocationIds(userId: string): Promise<string[]>;
  /** De `locationIds`, cuales son favoritas del usuario. */
  filterFavorites(userId: string, locationIds: string[]): Promise<Set<string>>;
}
