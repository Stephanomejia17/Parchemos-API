import { LocationStatus } from '../../domain/enums/location-status.enum';
import type { LocationRepository } from '../../domain/repositories/location.repository';
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
    const useCase = new UpdateLocationUseCase(locations);

    await useCase.execute('owner-1', 'loc-active', {
      name: 'Sede actualizada',
    });

    expect(locations.update).toHaveBeenCalledWith('loc-active', {
      name: 'Sede actualizada',
      status: LocationStatus.PENDING_APPROVAL,
    });
  });

  it('no toca el status de una sede que ya esta en revision', async () => {
    const locations = {
      findByIdAndOwner: jest.fn().mockResolvedValue(
        makeLocation({
          id: 'loc-pending',
          status: LocationStatus.PENDING_APPROVAL,
        }),
      ),
      update: jest.fn().mockResolvedValue(makeLocation({ id: 'loc-pending' })),
    } as unknown as LocationRepository;
    const useCase = new UpdateLocationUseCase(locations);

    await useCase.execute('owner-1', 'loc-pending', { name: 'Nuevo nombre' });

    expect(locations.update).toHaveBeenCalledWith('loc-pending', {
      name: 'Nuevo nombre',
    });
  });

  it('rechaza si la sede no pertenece al dueno', async () => {
    const locations = {
      findByIdAndOwner: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    } as unknown as LocationRepository;
    const useCase = new UpdateLocationUseCase(locations);

    await expect(
      useCase.execute('owner-1', 'loc-ajena', { name: 'X' }),
    ).rejects.toThrow('No puedes administrar esta sede.');
  });
});
