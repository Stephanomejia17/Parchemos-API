import { ConfigService } from '@nestjs/config';
import { Role } from '../../../../common/enums/role.enum';
import { AccountStatus } from '../../domain/enums/account-status.enum';
import type { UserRepository } from '../../domain/repositories/user.repository';
import { PasswordService } from '../../infrastructure/security/password.service';
import { RegisterUserUseCase } from './register-user.use-case';

describe('RegisterUserUseCase', () => {
  it('envía nombre, teléfono, ciudad y foto al repositorio', async () => {
    const users = {
      findByEmail: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'user-1', email: 'user@example.com', fullName: 'Usuario',
        phone: '3001234567', city: 'Bogotá', profilePhotoUrl: 'data:image/jpeg;base64,abc',
        role: Role.COMENSAL, status: AccountStatus.ACTIVA,
      }),
    } as unknown as UserRepository;
    const passwords = { hash: jest.fn().mockResolvedValue('hash') } as unknown as PasswordService;
    const config = { get: jest.fn().mockReturnValue('1.0') } as unknown as ConfigService;
    const useCase = new RegisterUserUseCase(users, passwords, config);

    await useCase.execute({
      email: 'user@example.com', password: 'Password1', fullName: 'Usuario',
      phone: '3001234567', city: 'Bogotá', profilePhotoUrl: 'data:image/jpeg;base64,abc',
      role: Role.COMENSAL, acceptedTerms: true, acceptedPrivacy: true,
    });

    expect(users.create).toHaveBeenCalledWith(expect.objectContaining({
      fullName: 'Usuario', phone: '3001234567', city: 'Bogotá',
      profilePhotoUrl: 'data:image/jpeg;base64,abc',
    }));
  });
});