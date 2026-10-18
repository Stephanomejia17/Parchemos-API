import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../common/errors/not-found-error';
import { LOCATION_REPOSITORY } from '../../restaurants/domain/repositories/location.repository';
import type { LocationRepository } from '../../restaurants/domain/repositories/location.repository';
import {
  FAVORITE_REPOSITORY,
  FEATURED_RATING_THRESHOLD,
  isFeatured,
} from '../domain/favorite.repository';
import type { FavoriteRepository } from '../domain/favorite.repository';

export const DEFAULT_FEATURED_LIMIT = 20;
export const MAX_FEATURED_LIMIT = 50;

/** DO-05 CA4: agregar a favoritos. Solo sedes publicadas (activas). */
@Injectable()
export class AddFavoriteUseCase {
  constructor(
    @Inject(FAVORITE_REPOSITORY) private readonly favorites: FavoriteRepository,
    @Inject(LOCATION_REPOSITORY) private readonly locations: LocationRepository,
  ) {}

  async execute(userId: string, locationId: string): Promise<void> {
    const location = await this.locations.findActiveById(locationId);
    if (!location) {
      throw new NotFoundError('El restaurante no existe o no está disponible.');
    }
    await this.favorites.add(userId, locationId);
  }
}

/** DO-05 CA5: quitar de favoritos (idempotente). */
@Injectable()
export class RemoveFavoriteUseCase {
  constructor(
    @Inject(FAVORITE_REPOSITORY) private readonly favorites: FavoriteRepository,
  ) {}

  execute(userId: string, locationId: string): Promise<void> {
    return this.favorites.remove(userId, locationId);
  }
}

/** DO-05 CA6: "Mis favoritos", lo mas recientemente guardado primero. */
@Injectable()
export class ListFavoritesUseCase {
  constructor(
    @Inject(FAVORITE_REPOSITORY) private readonly favorites: FavoriteRepository,
    @Inject(LOCATION_REPOSITORY) private readonly locations: LocationRepository,
  ) {}

  async execute(userId: string) {
    const ids = await this.favorites.listLocationIds(userId);
    const active = await this.locations.findActiveByIds(ids);
    const byId = new Map(active.map((location) => [location.id, location]));
    // Se conserva el orden en que se guardaron; las sedes que dejaron de estar
    // activas no se listan (el registro se mantiene por si se reactivan).
    const items = ids.flatMap((id) => {
      const location = byId.get(id);
      return location
        ? [
            {
              ...location,
              destacado: isFeatured(location.avgRating),
              esFavorito: true,
            },
          ]
        : [];
    });
    return { items };
  }
}

/**
 * DO-02: restaurantes de mayor a menor calificacion. Los de >= 4.5 llevan
 * `destacado: true` y, al ir ordenados por calificacion, quedan arriba (CA1);
 * si ninguno llega al umbral se devuelve el mismo listado sin marca (CA2).
 * El promedio lo mantiene el trigger de `location_reviews`, asi que cada
 * consulta refleja las reseñas mas recientes (CA3).
 */
@Injectable()
export class ListFeaturedLocationsUseCase {
  constructor(
    @Inject(FAVORITE_REPOSITORY) private readonly favorites: FavoriteRepository,
    @Inject(LOCATION_REPOSITORY) private readonly locations: LocationRepository,
  ) {}

  async execute(params: { limit?: number; userId?: string }) {
    const limit = Math.min(
      Math.max(params.limit ?? DEFAULT_FEATURED_LIMIT, 1),
      MAX_FEATURED_LIMIT,
    );
    const rows = await this.locations.findTopRated(limit);
    // Sin sesion (CA9) nadie tiene favoritos: todo en falso.
    const favoriteIds = params.userId
      ? await this.favorites.filterFavorites(
          params.userId,
          rows.map((row) => row.id),
        )
      : new Set<string>();

    const items = rows.map((location) => ({
      ...location,
      destacado: isFeatured(location.avgRating),
      esFavorito: favoriteIds.has(location.id),
    }));
    return {
      umbral: FEATURED_RATING_THRESHOLD,
      hayDestacados: items.some((item) => item.destacado),
      items,
    };
  }
}
