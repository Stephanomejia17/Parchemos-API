import { ValidationError } from '../../../../common/errors/validation-error';
import type { LocationRepository } from '../../domain/repositories/location.repository';
import type { RestaurantRepository } from '../../domain/repositories/restaurant.repository';
import { GeoapifyGeocodingService } from '../../infrastructure/geocoding/geoapify-geocoding.service';
import { CreateLocationUseCase } from './create-location.use-case';
import { makeLocation } from './location.test-helpers';

describe('CreateLocationUseCase', () => {
  it('geocodifica la dirección antes de crear la sede y guarda las coordenadas', async () => {
    const restaurants = {
      findByIdAndOwner: jest.fn().mockResolvedValue({ id: 'restaurant-1' }),
    } as unknown as RestaurantRepository;
    const create = jest.fn().mockResolvedValue(makeLocation());
    const locations = {
      create,
    } as unknown as LocationRepository;
    const geocode = jest.fn().mockResolvedValue({
      latitude: 4.6097,
      longitude: -74.0817,
      formattedAddress: 'Dirección normalizada',
    });
    const geocoding = {
      geocode,
    } as unknown as GeoapifyGeocodingService;
    const useCase = new CreateLocationUseCase(
      restaurants,
      locations,
      geocoding,
    );

    await useCase.execute('owner-1', 'restaurant-1', {
      name: ' Sede centro ',
      address: ' Carrera 10 # 5 - 12 ',
    });

    expect(geocode).toHaveBeenCalledWith('Carrera 10 # 5 - 12');
    expect(create).toHaveBeenCalledWith({
      restaurantId: 'restaurant-1',
      name: 'Sede centro',
      description: null,
      address: 'Dirección normalizada',
      latitude: 4.6097,
      longitude: -74.0817,
    });
    expect(geocode.mock.invocationCallOrder[0]).toBeLessThan(
      create.mock.invocationCallOrder[0],
    );
  });

  it('no crea la sede si la geocodificación falla', async () => {
    const restaurants = {
      findByIdAndOwner: jest.fn().mockResolvedValue({ id: 'restaurant-1' }),
    } as unknown as RestaurantRepository;
    const create = jest.fn();
    const locations = {
      create,
    } as unknown as LocationRepository;
    const geocode = jest
      .fn()
      .mockRejectedValue(
        new ValidationError(
          'No se pudo confirmar la dirección.',
          'GEOCODING_AMBIGUOUS',
        ),
      );
    const geocoding = {
      geocode,
    } as unknown as GeoapifyGeocodingService;
    const useCase = new CreateLocationUseCase(
      restaurants,
      locations,
      geocoding,
    );

    await expect(
      useCase.execute('owner-1', 'restaurant-1', {
        name: 'Sede centro',
        address: 'Dirección no confirmada',
      }),
    ).rejects.toThrow('No se pudo confirmar la dirección.');

    expect(create).not.toHaveBeenCalled();
  });
});
