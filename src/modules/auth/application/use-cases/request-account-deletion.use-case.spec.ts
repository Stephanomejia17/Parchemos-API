import { ConflictException, NotFoundException } from '@nestjs/common';
import { Role } from '../../../../common/enums/role.enum';
import { User } from '../../domain/entities/user.entity';
import { AccountStatus } from '../../domain/enums/account-status.enum';
import type { UserRepository } from '../../domain/repositories/user.repository';
import { RequestAccountDeletionUseCase } from './request-account-deletion.use-case';

describe('RequestAccountDeletionUseCase', () => {
  let users: jest.Mocked<Pick<UserRepository, 'findById' | 'requestAccountDeletion'>>;
  let useCase: RequestAccountDeletionUseCase;

  beforeEach(() => {
    users = {
      findById: jest.fn(),
      requestAccountDeletion: jest.fn(),
    };
    useCase = new RequestAccountDeletionUseCase(users as UserRepository);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('solicita la eliminación para 30 días calendario y devuelve la fecha efectiva', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-31T15:45:00.000Z'));
    const user = makeUser();
    const updatedUser = makeUser({
      status: AccountStatus.PENDIENTE_ELIMINACION,
      deletionRequestedAt: new Date('2026-01-31T15:45:00.000Z'),
      deletionEffectiveAt: new Date('2026-03-02T15:45:00.000Z'),
    });
    users.findById.mockResolvedValue(user);
    users.requestAccountDeletion.mockResolvedValue(updatedUser);

    const result = await useCase.execute('user-1');

    expect(users.requestAccountDeletion).toHaveBeenCalledWith(
      'user-1',
      new Date('2026-01-31T15:45:00.000Z'),
      new Date('2026-03-02T15:45:00.000Z'),
    );
    expect(result).toEqual({
      message: 'La cuenta quedó pendiente de eliminación.',
      deletionEffectiveAt: new Date('2026-03-02T15:45:00.000Z'),
    });
  });

  it('rechaza la solicitud si el usuario no existe', async () => {
    users.findById.mockResolvedValue(null);

    await expect(useCase.execute('missing-user')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(users.requestAccountDeletion).not.toHaveBeenCalled();
  });

  it('no crea otra solicitud cuando ya está pendiente', async () => {
    users.findById.mockResolvedValue(
      makeUser({
        status: AccountStatus.PENDIENTE_ELIMINACION,
        deletionRequestedAt: new Date('2026-01-01T10:00:00.000Z'),
        deletionEffectiveAt: new Date('2026-01-31T10:00:00.000Z'),
      }),
    );

    await expect(useCase.execute('user-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(users.requestAccountDeletion).not.toHaveBeenCalled();
  });
});

function makeUser(overrides: Partial<ConstructorParameters<typeof User>[0]> = {}) {
  return new User({
    id: 'user-1',
    email: 'user@example.com',
    passwordHash: 'hash',
    fullName: 'Usuario',
    role: Role.COMENSAL,
    status: AccountStatus.ACTIVA,
    deletionRequestedAt: null,
    deletionEffectiveAt: null,
    suspensionReason: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    ...overrides,
  });
}