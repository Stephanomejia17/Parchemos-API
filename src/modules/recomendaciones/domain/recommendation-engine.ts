/**
 * Motor de recomendaciones (PU-03). Es una funcion pura: recibe el perfil del
 * comensal y las sedes candidatas y devuelve las mas relevantes, sin tocar la
 * BD, para poder probar el orden con perfiles conocidos (PARCHE-355/356).
 *
 * Puntaje (mayor = mas relevante):
 *  - Tipo de cocina preferido ........ +3, y +0.5 por cada cocina extra coincidente (max +1)
 *  - Afinidad con el historial ....... hasta +2 (peso de esa cocina entre sus pedidos)
 *  - Ya pidio en la sede ............. +0.4 por pedido (max +2)
 *  - Rango de precio ................. +1.5 dentro del rango, -1 a 2+ niveles fuera
 *  - Calificacion .................... hasta +2 (avg/5) y desempate por reseñas
 * Sin ninguna senal del perfil (cocina, historial o precio) la sede no se
 * recomienda como personalizada. El resultado es estable: mismo perfil, mismo
 * orden (empates por id).
 */
export interface RecommendationCandidate {
  id: string;
  avgRating: number;
  ratingCount: number;
  priceRange: number | null;
  cuisineIds: string[];
}

export interface RecommendationProfile {
  preferredCuisineIds: ReadonlySet<string>;
  priceRangeMin: number | null;
  priceRangeMax: number | null;
  /** Pedidos del comensal por sede. */
  ordersByLocation: ReadonlyMap<string, number>;
  /** Pedidos del comensal por tipo de cocina (suma de los de sus sedes). */
  ordersByCuisine: ReadonlyMap<string, number>;
}

export type RecommendationReason =
  | 'preferred_cuisine'
  | 'previous_order'
  | 'similar_to_history'
  | 'price_range'
  | 'top_rated';

export interface RankedCandidate {
  id: string;
  score: number;
  reason: RecommendationReason;
  /** Cocina que explica el motivo, si aplica. */
  cuisineId: string | null;
}

export function hasPersonalSignals(profile: RecommendationProfile): boolean {
  return (
    profile.preferredCuisineIds.size > 0 ||
    profile.priceRangeMin !== null ||
    profile.priceRangeMax !== null ||
    profile.ordersByLocation.size > 0
  );
}

/** Sedes con alguna senal del perfil, de mayor a menor relevancia. */
export function rankPersonalized(
  candidates: RecommendationCandidate[],
  profile: RecommendationProfile,
): RankedCandidate[] {
  const totalOrders = [...profile.ordersByLocation.values()].reduce(
    (sum, count) => sum + count,
    0,
  );
  const ranked: RankedCandidate[] = [];

  for (const candidate of candidates) {
    let score = 0;
    let signal = false;
    let reason: RecommendationReason = 'top_rated';
    let reasonCuisine: string | null = null;

    const preferred = candidate.cuisineIds.filter((id) =>
      profile.preferredCuisineIds.has(id),
    );
    if (preferred.length) {
      score += 3 + Math.min(0.5 * (preferred.length - 1), 1);
      signal = true;
      reason = 'preferred_cuisine';
      reasonCuisine = preferred[0];
    }

    const visits = profile.ordersByLocation.get(candidate.id) ?? 0;
    if (visits > 0) {
      score += Math.min(0.4 * visits, 2);
      signal = true;
      if (reason === 'top_rated') reason = 'previous_order';
    }

    if (totalOrders > 0) {
      let best = 0;
      let bestCuisine: string | null = null;
      for (const cuisineId of candidate.cuisineIds) {
        const share =
          (profile.ordersByCuisine.get(cuisineId) ?? 0) / totalOrders;
        if (share > best) {
          best = share;
          bestCuisine = cuisineId;
        }
      }
      if (best > 0) {
        score += 2 * Math.min(best, 1);
        signal = true;
        if (reason === 'top_rated') {
          reason = 'similar_to_history';
          reasonCuisine = bestCuisine;
        }
      }
    }

    const priceFit = priceDelta(candidate.priceRange, profile);
    if (priceFit !== null) {
      score += priceFit;
      if (priceFit > 0) {
        signal = true;
        if (reason === 'top_rated') reason = 'price_range';
      }
    }

    score += (candidate.avgRating / 5) * 2;
    score += (candidate.ratingCount / (candidate.ratingCount + 10)) * 0.5;

    if (signal) {
      ranked.push({
        id: candidate.id,
        score,
        reason,
        cuisineId: reasonCuisine,
      });
    }
  }

  return ranked.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/** Respaldo sin perfil (PU-03 E2, PARCHE-354): mejor calificadas y populares. */
export function rankTopRated(
  candidates: RecommendationCandidate[],
): RankedCandidate[] {
  return [...candidates]
    .sort(
      (a, b) =>
        b.avgRating - a.avgRating ||
        b.ratingCount - a.ratingCount ||
        a.id.localeCompare(b.id),
    )
    .map((candidate) => ({
      id: candidate.id,
      score: candidate.avgRating,
      reason: 'top_rated' as const,
      cuisineId: null,
    }));
}

function priceDelta(
  priceRange: number | null,
  profile: RecommendationProfile,
): number | null {
  const { priceRangeMin: min, priceRangeMax: max } = profile;
  if (priceRange === null || (min === null && max === null)) return null;
  const low = min ?? 1;
  const high = max ?? 4;
  if (priceRange >= low && priceRange <= high) return 1.5;
  const distance = priceRange < low ? low - priceRange : priceRange - high;
  return distance >= 2 ? -1 : 0;
}
