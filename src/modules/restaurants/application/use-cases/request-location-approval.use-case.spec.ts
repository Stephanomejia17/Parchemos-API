import { LocationStatus } from '../../domain/enums/location-status.enum';
import type { LocationRepository } from '../../domain/repositories/location.repository';
import { RequestLocationApprovalUseCase } from './request-location-approval.use-case';
import { makeLocation } from './location.test-helpers';

describe('RequestLocationApprovalUseCase', () => {
  it('limpia rejectionReason cuando una sede rechazada vuelve a pedir aprobación', async () => {
    const location = makeLocation({
      id: 'loc-4',
      status: LocationStatus.REJECTED,
      schedules: [{ dayOfWeek: 1, startsAt: '09:00', endsAt: '18:00' }],
    });
    const locations = {
      findByIdAndOwner: jest.fn().mockResolvedValue(location),
      update: jest.fn().mockResolvedValue(
        makeLocation({
          id: 'loc-4',
          status: LocationStatus.PENDING_APPROVAL,
          rejectionReason: null,
        }),
      ),
    } as unknown as LocationRepository;
    const useCase = new RequestLocationApprovalUseCase(locations);

    await useCase.execute('owner-1', 'loc-4');

    expect(locations.update).toHaveBeenCalledWith('loc-4', {
      status: LocationStatus.PENDING_APPROVAL,
      rejectionReason: null,
    });
  });

  it('rechaza si falta informacion requerida', async () => {
    const location = makeLocation({ schedules: [] });
    const locations = {
      findByIdAndOwner: jest.fn().mockResolvedValue(location),
      update: jest.fn(),
    } as unknown as LocationRepository;
    const useCase = new RequestLocationApprovalUseCase(locations);

    await expect(useCase.execute('owner-1', 'loc-1')).rejects.toThrow(
      'Completa la información requerida antes de solicitar autorización.',
    );
  });

  it('rechaza si la sede ya esta activa', async () => {
    const location = makeLocation({ status: LocationStatus.ACTIVE });
    const locations = {
      findByIdAndOwner: jest.fn().mockResolvedValue(location),
      update: jest.fn(),
    } as unknown as LocationRepository;
    const useCase = new RequestLocationApprovalUseCase(locations);

    await expect(useCase.execute('owner-1', 'loc-1')).rejects.toThrow(
      'Esta sede ya está aprobada.',
    );
  });
});
