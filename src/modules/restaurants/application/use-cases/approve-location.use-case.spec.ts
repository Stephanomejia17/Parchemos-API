import { LocationStatus } from '../../domain/enums/location-status.enum';
import type { LocationRepository } from '../../domain/repositories/location.repository';
import { ApproveLocationUseCase } from './approve-location.use-case';
import { makeLocation } from './location.test-helpers';

describe('ApproveLocationUseCase', () => {
  it('aprueba una sede pendiente, fija approvedAt y limpia rejectionReason', async () => {
    const location = makeLocation({
      status: LocationStatus.PENDING_APPROVAL,
      schedules: [{ dayOfWeek: 1, startsAt: '09:00', endsAt: '18:00' }],
    });
    const locations = {
      findById: jest.fn().mockResolvedValue(location),
      update: jest.fn().mockResolvedValue(
        makeLocation({
          status: LocationStatus.ACTIVE,
          approvedAt: new Date(),
        }),
      ),
    } as unknown as LocationRepository;
    const useCase = new ApproveLocationUseCase(locations);

    await useCase.execute('loc-1');

    expect(locations.update).toHaveBeenCalledWith('loc-1', {
      status: LocationStatus.ACTIVE,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() es any por definicion en @types/jest
      approvedAt: expect.any(Date),
      rejectionReason: null,
    });
  });

  it('rechaza aprobar una sede sin toda la información requerida', async () => {
    const location = makeLocation({
      status: LocationStatus.PENDING_APPROVAL,
      schedules: [],
    });
    const locations = {
      findById: jest.fn().mockResolvedValue(location),
      update: jest.fn(),
    } as unknown as LocationRepository;
    const useCase = new ApproveLocationUseCase(locations);

    await expect(useCase.execute('loc-incomplete')).rejects.toThrow(
      'La sede no tiene toda la información requerida.',
    );
    expect(locations.update).not.toHaveBeenCalled();
  });

  it('rechaza aprobar una sede que no esta pendiente', async () => {
    const location = makeLocation({ status: LocationStatus.ACTIVE });
    const locations = {
      findById: jest.fn().mockResolvedValue(location),
      update: jest.fn(),
    } as unknown as LocationRepository;
    const useCase = new ApproveLocationUseCase(locations);

    await expect(useCase.execute('loc-1')).rejects.toThrow(
      'Solo puedes aprobar una sede pendiente.',
    );
    expect(locations.update).not.toHaveBeenCalled();
  });
});
