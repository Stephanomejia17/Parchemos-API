import { LocationStatus } from '../../domain/enums/location-status.enum';
import type { LocationRepository } from '../../domain/repositories/location.repository';
import { RejectLocationUseCase } from './reject-location.use-case';
import { makeLocation } from './location.test-helpers';

describe('RejectLocationUseCase', () => {
  it('exige motivo y lo persiste recortado', async () => {
    const locations = {
      findById: jest.fn().mockResolvedValue(makeLocation({ id: 'loc-3' })),
      update: jest.fn().mockResolvedValue(
        makeLocation({
          id: 'loc-3',
          status: LocationStatus.REJECTED,
          rejectionReason: 'Motivo válido',
        }),
      ),
    } as unknown as LocationRepository;
    const useCase = new RejectLocationUseCase(locations);

    await useCase.execute('loc-3', '  Motivo válido  ');

    expect(locations.update).toHaveBeenCalledWith('loc-3', {
      status: LocationStatus.REJECTED,
      rejectionReason: 'Motivo válido',
      approvedAt: null,
    });
  });

  it('falla si la sede no existe', async () => {
    const locations = {
      findById: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    } as unknown as LocationRepository;
    const useCase = new RejectLocationUseCase(locations);

    await expect(useCase.execute('missing', 'Motivo')).rejects.toThrow(
      'La sede no existe.',
    );
    expect(locations.update).not.toHaveBeenCalled();
  });
});
