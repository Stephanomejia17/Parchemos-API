import { LocationStatus } from '../../domain/enums/location-status.enum';
import type { LocationRepository } from '../../domain/repositories/location.repository';
import { AddressGeocodingService } from '../../infrastructure/geocoding/address-geocoding.service';
import { UpdateLocationUseCase } from './update-location.use-case';
import { makeLocation } from './location.test-helpers';

describe('UpdateLocationUseCase', () => {
  it('vuelve a revisión una sede activa cuando se modifica', async () => {
    const locations = {
      findByIdAndOwner: jest
        .fn()
        .mockResolvedValue(
          makeLocation({ id: 'loc-active', status: LocationStatus.ACTIVE }),
        ),
      update: jest.fn().mockResolvedValue(
        makeLocation({
          id: 'loc-active',
          status: LocationStatus.PENDING_APPROVAL,
        }),
      ),
    } as unknown as LocationRepository;

    const geocoding = {
      geocode: jest.fn(),
    };

    const useCase = new UpdateLocationUseCase(locations, geocoding as any);

    await useCase.execute('owner-1', 'loc-active', {
      name: 'Sede actualizada',
    });

    expect(locations.update).toHaveBeenCalledWith('loc-active', {
      name: 'Sede actualizada',
      status: LocationStatus.PENDING_APPROVAL,
    });

    expect(geocoding.geocode).not.toHaveBeenCalled();
  });

  it('no toca el status de una sede que ya está en revisión', async () => {
    const locations = {
      findByIdAndOwner: jest.fn().mockResolvedValue(
        makeLocation({
          id: 'loc-pending',
          status: LocationStatus.PENDING_APPROVAL,
        }),
      ),
      update: jest.fn().mockResolvedValue(makeLocation({ id: 'loc-pending' })),
    } as unknown as LocationRepository;

    const geocoding = {
      geocode: jest.fn(),
    };

    const useCase = new UpdateLocationUseCase(locations, geocoding as any);

    await useCase.execute('owner-1', 'loc-pending', {
      name: 'Nuevo nombre',
    });

    expect(locations.update).toHaveBeenCalledWith('loc-pending', {
      name: 'Nuevo nombre',
    });

    expect(geocoding.geocode).not.toHaveBeenCalled();
  });

  it('geocodifica y actualiza las coordenadas cuando cambia la dirección', async () => {
    const update = jest
      .fn()
      .mockResolvedValue(makeLocation({ id: 'loc-pending' }));
    const locations = {
      findByIdAndOwner: jest.fn().mockResolvedValue(
        makeLocation({
          id: 'loc-pending',
          address: 'Calle 123',
          latitude: 4.6,
          longitude: -74.08,
        }),
      ),
      update,
    } as unknown as LocationRepository;
    const geocode = jest.fn().mockResolvedValue({
      latitude: 4.7,
      longitude: -74.1,
      formattedAddress: 'Nueva dirección normalizada',
    });
    const geocoding = {
      geocode,
    } as unknown as AddressGeocodingService;
    const useCase = new UpdateLocationUseCase(locations, geocoding);

    await useCase.execute('owner-1', 'loc-pending', {
      address: '  Carrera 10 # 5 - 12  ',
    });

    expect(geocode).toHaveBeenCalledWith('Carrera 10 # 5 - 12');
    expect(update).toHaveBeenCalledWith('loc-pending', {
      address: 'Nueva dirección normalizada',
      latitude: 4.7,
      longitude: -74.1,
    });
  });

  it('conserva las coordenadas existentes cuando la dirección no cambia', async () => {
    const update = jest
      .fn()
      .mockResolvedValue(makeLocation({ id: 'loc-pending' }));
    const locations = {
      findByIdAndOwner: jest.fn().mockResolvedValue(
        makeLocation({
          id: 'loc-pending',
          address: 'Calle 123',
          latitude: 4.6,
          longitude: -74.08,
        }),
      ),
      update,
    } as unknown as LocationRepository;
    const geocode = jest.fn();
    const geocoding = {
      geocode,
    } as unknown as AddressGeocodingService;
    const useCase = new UpdateLocationUseCase(locations, geocoding);

    await useCase.execute('owner-1', 'loc-pending', {
      address: ' Calle 123 ',
    });

    expect(geocode).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith('loc-pending', {
      address: 'Calle 123',
    });
  });

  it('no actualiza la sede si falla la geocodificación de una dirección nueva', async () => {
    const update = jest.fn();
    const locations = {
      findByIdAndOwner: jest.fn().mockResolvedValue(
        makeLocation({
          id: 'loc-pending',
          address: 'Calle 123',
          latitude: 4.6,
          longitude: -74.08,
        }),
      ),
      update,
    } as unknown as LocationRepository;
    const geocode = jest
      .fn()
      .mockRejectedValue(new Error('No se pudo confirmar la dirección.'));
    const geocoding = {
      geocode,
    } as unknown as AddressGeocodingService;
    const useCase = new UpdateLocationUseCase(locations, geocoding);

    await expect(
      useCase.execute('owner-1', 'loc-pending', {
        address: 'Carrera 10 # 5 - 12',
      }),
    ).rejects.toThrow('No se pudo confirmar la dirección.');

    expect(update).not.toHaveBeenCalled();
  });

  it('rechaza si la sede no pertenece al dueño', async () => {
    const locations = {
      findByIdAndOwner: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    } as unknown as LocationRepository;

    const geocoding = {
      geocode: jest.fn(),
    };

    const useCase = new UpdateLocationUseCase(locations, geocoding as any);

    await expect(
      useCase.execute('owner-1', 'loc-ajena', { name: 'X' }),
    ).rejects.toThrow('No puedes administrar esta sede.');

    expect(geocoding.geocode).not.toHaveBeenCalled();
    expect(locations.update).not.toHaveBeenCalled();
  });
});
describe('UpdateLocationUseCase sin coordenadas', () => {
  it('geocodifica la dirección aunque no cambie si la sede no tiene coordenadas', async () => {
    const update = jest
      .fn()
      .mockResolvedValue(makeLocation({ id: 'loc-legacy' }));
    const locations = {
      findByIdAndOwner: jest.fn().mockResolvedValue(
        makeLocation({
          id: 'loc-legacy',
          address: 'Calle 5 # 45 - 98, Medellín, Antioquia, Colombia',
        }),
      ),
      update,
    } as unknown as LocationRepository;
    const geocode = jest.fn().mockResolvedValue({
      latitude: 6.21,
      longitude: -75.57,
      formattedAddress: 'Calle 5 # 45 - 98, Medellín, Antioquia, Colombia',
    });
    const useCase = new UpdateLocationUseCase(locations, {
      geocode,
    } as unknown as AddressGeocodingService);

    await useCase.execute('owner-1', 'loc-legacy', {
      address: 'Calle 5 # 45 - 98, Medellín, Antioquia, Colombia',
    });

    expect(geocode).toHaveBeenCalledWith(
      'Calle 5 # 45 - 98, Medellín, Antioquia, Colombia',
    );
    expect(update).toHaveBeenCalledWith(
      'loc-legacy',
      expect.objectContaining({ latitude: 6.21, longitude: -75.57 }),
    );
  });

  it('no geocodifica si solo cambia el nombre', async () => {
    const locations = {
      findByIdAndOwner: jest
        .fn()
        .mockResolvedValue(makeLocation({ id: 'loc-legacy' })),
      update: jest.fn().mockResolvedValue(makeLocation({ id: 'loc-legacy' })),
    } as unknown as LocationRepository;
    const geocode = jest.fn();
    const useCase = new UpdateLocationUseCase(locations, {
      geocode,
    } as unknown as AddressGeocodingService);

    await useCase.execute('owner-1', 'loc-legacy', { name: 'Otro nombre' });

    expect(geocode).not.toHaveBeenCalled();
  });
});
