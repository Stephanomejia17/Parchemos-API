import type { ListPublicLocationsUseCase } from '../../restaurants/application/use-cases/list-public-locations.use-case';
import type { RecommendationSource } from '../domain/recommendation-source';
import { GetRecommendationsUseCase } from './get-recommendations.use-case';

const location = (id: string, avgRating: number) => ({
  id,
  name: `Sede ${id}`,
  avgRating,
  ratingCount: 10,
  priceRange: 2,
});

function setup(taste: Awaited<ReturnType<RecommendationSource['getProfile']>>) {
  const publicLocations = {
    // El listado publico ya excluye pendientes y rechazadas (CA13).
    execute: jest
      .fn()
      .mockResolvedValue([
        location('a', 4.9),
        location('b', 4.1),
        location('c', 3),
      ]),
  };
  const source: RecommendationSource = {
    getProfile: jest.fn().mockResolvedValue(taste),
    getLocationCuisines: jest.fn().mockResolvedValue([
      { locationId: 'b', cuisineId: 'it', name: 'Italiana' },
      { locationId: 'c', cuisineId: 'it', name: 'Italiana' },
    ]),
  };
  const useCase = new GetRecommendationsUseCase(
    publicLocations as unknown as ListPublicLocationsUseCase,
    source,
  );
  return { useCase, publicLocations };
}

describe('GetRecommendationsUseCase', () => {
  it('CA12: usuario sin historial ni preferencias recibe las mejor calificadas', async () => {
    const { useCase } = setup({
      preferredCuisines: [],
      priceRangeMin: null,
      priceRangeMax: null,
      ordersByLocation: [],
    });

    const result = await useCase.execute('user-1');

    expect(result.personalizado).toBe(false);
    expect(result.tienePreferencias).toBe(false);
    expect(result.items.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('CA11: con preferencias devuelve sedes acordes y explica el motivo', async () => {
    const { useCase } = setup({
      preferredCuisines: [{ id: 'it' }],
      priceRangeMin: null,
      priceRangeMax: null,
      ordersByLocation: [],
    });

    const result = await useCase.execute('user-1');

    expect(result.personalizado).toBe(true);
    expect(result.tienePreferencias).toBe(true);
    expect(result.items.map((item) => item.id)).toEqual(['b', 'c']);
    expect(result.items[0].motivo).toBe('Porque te gusta la cocina Italiana');
  });

  it('con historial pero sin preferencias es personalizado y aun invita a completar gustos', async () => {
    const { useCase } = setup({
      preferredCuisines: [],
      priceRangeMin: null,
      priceRangeMax: null,
      ordersByLocation: [{ locationId: 'b', count: 2 }],
    });

    const result = await useCase.execute('user-1');

    expect(result.personalizado).toBe(true);
    expect(result.tienePreferencias).toBe(false);
    expect(result.items[0].id).toBe('b');
  });

  it('CA13: una sede donde pidio pero ya no esta activa no se recomienda', async () => {
    const { useCase } = setup({
      preferredCuisines: [],
      priceRangeMin: null,
      priceRangeMax: null,
      ordersByLocation: [{ locationId: 'inactiva', count: 5 }],
    });

    const result = await useCase.execute('user-1');

    expect(result.items.map((item) => item.id)).not.toContain('inactiva');
  });

  it('si ninguna sede coincide con el perfil cae al respaldo sin romper', async () => {
    const { useCase } = setup({
      preferredCuisines: [{ id: 'sushi' }],
      priceRangeMin: null,
      priceRangeMax: null,
      ordersByLocation: [],
    });

    const result = await useCase.execute('user-1');

    expect(result.personalizado).toBe(false);
    expect(result.tienePreferencias).toBe(true);
    expect(result.items).toHaveLength(3);
  });
});
