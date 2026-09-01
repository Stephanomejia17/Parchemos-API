import { NotFoundException } from '@nestjs/common';
import { Role } from '../../../../common/enums/role.enum';
import { User } from '../../domain/entities/user.entity';
import { AccountStatus } from '../../domain/enums/account-status.enum';
import type { UserRepository } from '../../domain/repositories/user.repository';
import { UpdateProfileUseCase } from './update-profile.use-case';

describe('UpdateProfileUseCase', () => {
  it('actualiza nombre, teléfono, ciudad y foto', async () => {
    const user = makeUser();
    const users = {
      findById: jest.fn().mockResolvedValue(user),
      updateProfile: jest.fn().mockResolvedValue(makeUser({
        fullName: 'Nuevo Nombre', phone: '3001234567', city: 'Cali',
        profilePhotoUrl: 'data:image/png;base64,abc',
      })),
    } as unknown as UserRepository;
    const useCase = new UpdateProfileUseCase(users);

    await useCase.execute('user-1', {
      fullName: 'Nuevo Nombre', phone: '3001234567', city: 'Cali',
      profilePhotoUrl: 'data:image/png;base64,abc',
    });

    expect(users.updateProfile).toHaveBeenCalledWith('user-1', {
      fullName: 'Nuevo Nombre', phone: '3001234567', city: 'Cali',
      profilePhotoUrl: 'data:image/png;base64,abc',
    });
  });

  it('falla si el usuario no existe', async () => {
    const users = { findById: jest.fn().mockResolvedValue(null) } as unknown as UserRepository;
    const useCase = new UpdateProfileUseCase(users);

    await expect(useCase.execute('missing', { fullName: 'Nombre', city: 'Bogotá' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

function makeUser(overrides: Partial<ConstructorParameters<typeof User>[0]> = {}) {
  return new User({
    id: 'user-1', email: 'user@example.com', passwordHash: 'hash', fullName: 'Usuario',
    role: Role.COMENSAL, status: AccountStatus.ACTIVA, deletionRequestedAt: null,
    deletionEffectiveAt: null, phone: null, city: null, profilePhotoUrl: null,
    assignedLocation: null, suspensionReason: null, failedLoginAttempts: 0,
    lockedUntil: null, lastLoginAt: null, ...overrides,
  });
}