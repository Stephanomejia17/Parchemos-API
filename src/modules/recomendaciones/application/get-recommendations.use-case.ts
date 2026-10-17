import { Inject, Injectable } from '@nestjs/common';
import { ListPublicLocationsUseCase } from '../../restaurants/application/use-cases/list-public-locations.use-case';
import {
  hasPersonalSignals,
  rankPersonalized,
  rankTopRated,
  type RankedCandidate,
  type RecommendationCandidate,
  type RecommendationProfile,
  type RecommendationReason,
} from '../domain/recommendation-engine';
import { RECOMMENDATION_SOURCE } from '../domain/recommendation-source';
import type { RecommendationSource } from '../domain/recommendation-source';

export const MAX_RECOMMENDATIONS = 10;

/**
 * PU-03: sedes recomendadas para un comensal. Los candidatos salen de
 * `ListPublicLocationsUseCase`, que solo devuelve sedes `activa` (CA13), y
 * cada sede aparece una sola vez (CA11).
 */
@Injectable()
export class GetRecommendationsUseCase {
  constructor(
    private readonly publicLocations: ListPublicLocationsUseCase,
    @Inject(RECOMMENDATION_SOURCE)
    private readonly source: RecommendationSource,
  ) {}

  async execute(userId: string) {
    const [locations, taste] = await Promise.all([
      this.publicLocations.execute(),
      this.source.getProfile(userId),
    ]);
    const cuisineRows = await this.source.getLocationCuisines(
      locations.map((location) => location.id),
    );

    const cuisineIdsByLocation = new Map<string, string[]>();
    const cuisineNames = new Map<string, string>();
    for (const row of cuisineRows) {
      cuisineNames.set(row.cuisineId, row.name);
      const list = cuisineIdsByLocation.get(row.locationId) ?? [];
      list.push(row.cuisineId);
      cuisineIdsByLocation.set(row.locationId, list);
    }

    const candidates: RecommendationCandidate[] = locations.map((location) => ({
      id: location.id,
      avgRating: Number(location.avgRating),
      ratingCount: location.ratingCount ?? 0,
      priceRange: location.priceRange ?? null,
      cuisineIds: cuisineIdsByLocation.get(location.id) ?? [],
    }));

    const ordersByLocation = new Map(
      taste.ordersByLocation.map((row) => [row.locationId, row.count]),
    );
    const ordersByCuisine = new Map<string, number>();
    for (const [locationId, count] of ordersByLocation) {
      for (const cuisineId of cuisineIdsByLocation.get(locationId) ?? []) {
        ordersByCuisine.set(
          cuisineId,
          (ordersByCuisine.get(cuisineId) ?? 0) + count,
        );
      }
    }
    const profile: RecommendationProfile = {
      preferredCuisineIds: new Set(taste.preferredCuisines.map((c) => c.id)),
      priceRangeMin: taste.priceRangeMin,
      priceRangeMax: taste.priceRangeMax,
      ordersByLocation,
      ordersByCuisine,
    };

    const personalized = hasPersonalSignals(profile)
      ? rankPersonalized(candidates, profile)
      : [];
    // Sin datos, o sin sedes que coincidan, se cae a las mejor calificadas.
    const isPersonalized = personalized.length > 0;
    const ranked: RankedCandidate[] = isPersonalized
      ? personalized
      : rankTopRated(candidates);

    const byId = new Map(locations.map((location) => [location.id, location]));
    const items = ranked.slice(0, MAX_RECOMMENDATIONS).flatMap((entry) => {
      const location = byId.get(entry.id);
      if (!location) return [];
      return [
        {
          ...location,
          motivo: describeReason(
            entry.reason,
            entry.cuisineId ? cuisineNames.get(entry.cuisineId) : undefined,
          ),
        },
      ];
    });

    return {
      personalizado: isPersonalized,
      // PARCHE-350: el front invita a completar gustos solo si no hay ninguno.
      tienePreferencias:
        profile.preferredCuisineIds.size > 0 ||
        profile.priceRangeMin !== null ||
        profile.priceRangeMax !== null,
      items,
    };
  }
}

function describeReason(
  reason: RecommendationReason,
  cuisine: string | undefined,
): string {
  switch (reason) {
    case 'preferred_cuisine':
      return cuisine
        ? `Porque te gusta la cocina ${cuisine}`
        : 'Acorde a tus gustos';
    case 'previous_order':
      return 'Ya has pedido aquí';
    case 'similar_to_history':
      return cuisine
        ? `Parecido a lo que has pedido (${cuisine})`
        : 'Parecido a lo que has pedido';
    case 'price_range':
      return 'Dentro de tu rango de precio';
    default:
      return 'Entre los mejor calificados';
  }
}
