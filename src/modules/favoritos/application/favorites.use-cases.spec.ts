import { NotFoundError } from '../../../common/errors/not-found-error';
import type { LocationRepository } from '../../restaurants/domain/repositories/location.repository';
import type { FavoriteRepository } from '../domain/favorite.repository';
import {
  AddFavoriteUseCase,
  ListFavoritesUseCase,
  ListFeaturedLocationsUseCase,
  RemoveFavoriteUseCase,
} from './favorites.use-cases';

const loc = (id: string, avgRating: number) => ({
  id,
  name: `Sede ${id}`,
  avgRating,
  ratingCount: 10,
});

function setup(
  options: {
    locations?: ReturnType<typeof loc>[];
    favoriteIds?: string[];
    activeIds?: string[];
  } = {},
) {
  const locations = options.locations ?? [];
  const favorites = {
    add: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    listLocationIds: jest.fn().mockResolvedValue(options.favoriteIds ?? []),
    filterFavorites: jest
      .fn()
      .mockImplementation((_user: string, ids: string[]) =>
        Promise.resolve(
          new Set(ids.filter((id) => options.favoriteIds?.includes(id))),
        ),
      ),
  } satisfies FavoriteRepository;
  const locationRepo = {
    findActiveById: jest
      .fn()
      .mockImplementation((id: string) =>
        Promise.resolve(
          (options.activeIds ?? locations.map((l) => l.id)).includes(id)
            ? { id }
            : null,
        ),
      ),
    findActiveByIds: jest
      .fn()
      .mockImplementation((ids: string[]) =>
        Promise.resolve(
          locations
            .filter((l) => ids.includes(l.id))
            .filter((l) => (options.activeIds ?? [l.id]).includes(l.id)),
        ),
      ),
    findTopRated: jest.fn().mockResolvedValue(locations),
  };
  const asLocations = locationRepo as unknown as LocationRepository;
  return { favorites, locationRepo, asLocations };
}

describe('AddFavoriteUseCase', () => {
  it('CA4: agrega una sede activa a los favoritos del usuario', async () => {
    const { favorites, asLocations } = setup({ locations: [loc('a', 4)] });

    await new AddFavoriteUseCase(favorites, asLocations).execute('u1', 'a');

    expect(favorites.add).toHaveBeenCalledWith('u1', 'a');
  });

  it('rechaza una sede inexistente o no activa sin guardar nada', async () => {
    const { favorites, asLocations } = setup({
      locations: [loc('a', 4)],
      activeIds: [],
    });

    await expect(
      new AddFavoriteUseCase(favorites, asLocations).execute('u1', 'a'),
    ).rejects.toThrow(NotFoundError);
    expect(favorites.add).not.toHaveBeenCalled();
  });

  it('CA8: repetir la peticion es seguro (la persistencia es idempotente)', async () => {
    const { favorites, asLocations } = setup({ locations: [loc('a', 4)] });
    const useCase = new AddFavoriteUseCase(favorites, asLocations);

    await useCase.execute('u1', 'a');
    await useCase.execute('u1', 'a');

    expect(favorites.add).toHaveBeenCalledTimes(2);
    expect(favorites.add).toHaveBeenNthCalledWith(2, 'u1', 'a');
  });
});

describe('RemoveFavoriteUseCase', () => {
  it('CA5: quita la sede de los favoritos', async () => {
    const { favorites } = setup();

    await new RemoveFavoriteUseCase(favorites).execute('u1', 'a');

    expect(favorites.remove).toHaveBeenCalledWith('u1', 'a');
  });
});

describe('ListFavoritesUseCase', () => {
  it('conserva el orden en que se guardaron y marca esFavorito', async () => {
    const { favorites, asLocations } = setup({
      locations: [loc('a', 4.7), loc('b', 3), loc('c', 4)],
      favoriteIds: ['c', 'a'],
    });

    const result = await new ListFavoritesUseCase(
      favorites,
      asLocations,
    ).execute('u1');

    expect(result.items.map((item) => item.id)).toEqual(['c', 'a']);
    expect(result.items.every((item) => item.esFavorito)).toBe(true);
    expect(result.items[1].destacado).toBe(true);
  });

  it('CA6: sin favoritos devuelve una lista vacia', async () => {
    const { favorites, asLocations } = setup({ locations: [loc('a', 4)] });

    const result = await new ListFavoritesUseCase(
      favorites,
      asLocations,
    ).execute('u1');

    expect(result.items).toEqual([]);
  });

  it('omite las sedes que dejaron de estar activas', async () => {
    const { favorites, asLocations } = setup({
      locations: [loc('a', 4), loc('b', 4)],
      favoriteIds: ['a', 'b'],
      activeIds: ['a'],
    });

    const result = await new ListFavoritesUseCase(
      favorites,
      asLocations,
    ).execute('u1');

    expect(result.items.map((item) => item.id)).toEqual(['a']);
  });
});

describe('ListFeaturedLocationsUseCase', () => {
  const rated = [loc('a', 4.9), loc('b', 4.5), loc('c', 4.4), loc('d', 0)];

  it('CA1: marca como destacadas las de >= 4.5 y las deja arriba', async () => {
    const { favorites, asLocations } = setup({ locations: rated });

    const result = await new ListFeaturedLocationsUseCase(
      favorites,
      asLocations,
    ).execute({});

    expect(result.items.map((i) => [i.id, i.destacado])).toEqual([
      ['a', true],
      ['b', true],
      ['c', false],
      ['d', false],
    ]);
    expect(result.hayDestacados).toBe(true);
    expect(result.umbral).toBe(4.5);
  });

  it('CA2: si ninguna llega a 4.5 las devuelve sin la marca', async () => {
    const { favorites, asLocations } = setup({
      locations: [loc('x', 4.2), loc('y', 3.9)],
    });

    const result = await new ListFeaturedLocationsUseCase(
      favorites,
      asLocations,
    ).execute({});

    expect(result.hayDestacados).toBe(false);
    expect(result.items.map((i) => i.id)).toEqual(['x', 'y']);
    expect(result.items.some((i) => i.destacado)).toBe(false);
  });

  it('CA7: marca esFavorito segun el usuario autenticado', async () => {
    const { favorites, asLocations } = setup({
      locations: rated,
      favoriteIds: ['b'],
    });

    const result = await new ListFeaturedLocationsUseCase(
      favorites,
      asLocations,
    ).execute({ userId: 'u1' });

    expect(result.items.map((i) => [i.id, i.esFavorito])).toEqual([
      ['a', false],
      ['b', true],
      ['c', false],
      ['d', false],
    ]);
  });

  it('CA9: un visitante recibe todo en falso y no se consultan favoritos', async () => {
    const { favorites, asLocations } = setup({
      locations: rated,
      favoriteIds: ['b'],
    });

    const result = await new ListFeaturedLocationsUseCase(
      favorites,
      asLocations,
    ).execute({});

    expect(result.items.some((i) => i.esFavorito)).toBe(false);
    expect(favorites.filterFavorites).not.toHaveBeenCalled();
  });

  it('acota el limite pedido', async () => {
    const { favorites, locationRepo, asLocations } = setup({
      locations: rated,
    });
    const useCase = new ListFeaturedLocationsUseCase(favorites, asLocations);

    await useCase.execute({ limit: 9999 });
    await useCase.execute({ limit: 0 });

    expect(locationRepo.findTopRated).toHaveBeenNthCalledWith(1, 50);
    expect(locationRepo.findTopRated).toHaveBeenNthCalledWith(2, 1);
  });
});
