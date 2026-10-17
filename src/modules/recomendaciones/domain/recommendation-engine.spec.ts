import {
  hasPersonalSignals,
  rankPersonalized,
  rankTopRated,
  type RecommendationCandidate,
  type RecommendationProfile,
} from './recommendation-engine';

const candidate = (
  id: string,
  extra: Partial<RecommendationCandidate> = {},
): RecommendationCandidate => ({
  id,
  avgRating: 4,
  ratingCount: 20,
  priceRange: 2,
  cuisineIds: [],
  ...extra,
});

const profile = (
  extra: Partial<RecommendationProfile> = {},
): RecommendationProfile => ({
  preferredCuisineIds: new Set(),
  priceRangeMin: null,
  priceRangeMax: null,
  ordersByLocation: new Map(),
  ordersByCuisine: new Map(),
  ...extra,
});

describe('recommendation engine', () => {
  it('hasPersonalSignals: un perfil vacio no tiene senales', () => {
    expect(hasPersonalSignals(profile())).toBe(false);
    expect(hasPersonalSignals(profile({ priceRangeMax: 2 }))).toBe(true);
  });

  it('CA11: prioriza la cocina preferida sobre una sede mejor calificada', () => {
    const ranked = rankPersonalized(
      [
        candidate('italiana', { cuisineIds: ['it'], avgRating: 3.5 }),
        candidate('popular', { cuisineIds: ['mx'], avgRating: 5 }),
      ],
      profile({ preferredCuisineIds: new Set(['it']) }),
    );

    expect(ranked.map((r) => r.id)).toEqual(['italiana']);
    expect(ranked[0]).toMatchObject({
      reason: 'preferred_cuisine',
      cuisineId: 'it',
    });
  });

  it('descarta sedes sin ninguna senal del perfil (poco relevantes)', () => {
    const ranked = rankPersonalized(
      [candidate('a', { cuisineIds: ['x'] })],
      profile({ preferredCuisineIds: new Set(['it']) }),
    );
    expect(ranked).toEqual([]);
  });

  it('el historial sube la sede donde ya pidio y las de cocina parecida', () => {
    const ranked = rankPersonalized(
      [
        candidate('visitada', { cuisineIds: ['jp'] }),
        candidate('parecida', { cuisineIds: ['jp'] }),
        candidate('otra', { cuisineIds: ['mx'] }),
      ],
      profile({
        ordersByLocation: new Map([['visitada', 3]]),
        ordersByCuisine: new Map([['jp', 3]]),
      }),
    );

    expect(ranked.map((r) => r.id)).toEqual(['visitada', 'parecida']);
    expect(ranked[0].reason).toBe('previous_order');
    expect(ranked[1].reason).toBe('similar_to_history');
  });

  it('el rango de precio favorece las sedes dentro del rango', () => {
    const ranked = rankPersonalized(
      [
        candidate('barata', { priceRange: 1 }),
        candidate('cara', { priceRange: 4 }),
      ],
      profile({ priceRangeMin: 1, priceRangeMax: 2 }),
    );
    expect(ranked.map((r) => r.id)).toEqual(['barata']);
  });

  it('dos perfiles distintos producen ordenes distintos', () => {
    const sedes = [
      candidate('italiana', { cuisineIds: ['it'] }),
      candidate('japonesa', { cuisineIds: ['jp'] }),
    ];
    const italiano = rankPersonalized(
      sedes,
      profile({
        preferredCuisineIds: new Set(['it', 'jp']),
        ordersByLocation: new Map([['italiana', 2]]),
        ordersByCuisine: new Map([['it', 2]]),
      }),
    );
    const japones = rankPersonalized(
      sedes,
      profile({
        preferredCuisineIds: new Set(['it', 'jp']),
        ordersByLocation: new Map([['japonesa', 2]]),
        ordersByCuisine: new Map([['jp', 2]]),
      }),
    );

    expect(italiano[0].id).toBe('italiana');
    expect(japones[0].id).toBe('japonesa');
  });

  it('es estable: mismo perfil, mismo orden, y sin sedes repetidas', () => {
    const sedes = [
      candidate('b', { cuisineIds: ['it'] }),
      candidate('a', { cuisineIds: ['it'] }),
    ];
    const p = profile({ preferredCuisineIds: new Set(['it']) });

    const first = rankPersonalized(sedes, p).map((r) => r.id);
    expect(first).toEqual(['a', 'b']);
    expect(rankPersonalized([...sedes].reverse(), p).map((r) => r.id)).toEqual(
      first,
    );
    expect(new Set(first).size).toBe(first.length);
  });

  it('CA12: el respaldo ordena por calificacion y luego por numero de reseñas', () => {
    const ranked = rankTopRated([
      candidate('c', { avgRating: 4.2, ratingCount: 5 }),
      candidate('a', { avgRating: 4.8, ratingCount: 10 }),
      candidate('b', { avgRating: 4.8, ratingCount: 30 }),
    ]);
    expect(ranked.map((r) => r.id)).toEqual(['b', 'a', 'c']);
    expect(ranked.every((r) => r.reason === 'top_rated')).toBe(true);
  });
});
