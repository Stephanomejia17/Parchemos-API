import { ConfigService } from '@nestjs/config';
import { ConflictError } from '../../../../common/errors/conflict-error';
import { SupabaseAuthService } from '../../../../infrastructure/auth/supabase-auth.service';
import { Role } from '../../../../common/enums/role.enum';
import { AccountStatus } from '../../domain/enums/account-status.enum';
import { SupabaseUserAlreadyExistsError } from '../../domain/errors/supabase-user-already-exists.error';
import type { UserRepository } from '../../domain/repositories/user.repository';
import { RegisterUserUseCase } from './register-user.use-case';

describe('RegisterUserUseCase', () => {
  it('crea la cuenta en Supabase y envía su id al repositorio', async () => {
    const users = {
      findByEmail: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'supabase-user-1',
        email: 'user@example.com',
        fullName: 'Usuario',
        phone: '3001234567',
        city: 'Bogotá',
        profilePhotoUrl: 'data:image/jpeg;base64,abc',
        role: Role.COMENSAL,
        status: AccountStatus.ACTIVA,
      }),
    } as unknown as UserRepository;
    const supabaseAuth = {
      createUser: jest.fn().mockResolvedValue({
        id: 'supabase-user-1',
        email: 'user@example.com',
        emailConfirmedAt: null,
      }),
      deleteUser: jest.fn().mockResolvedValue(undefined),
    } as unknown as SupabaseAuthService;
    const config = {
      get: jest.fn().mockReturnValue('1.0'),
    } as unknown as ConfigService;
    const useCase = new RegisterUserUseCase(users, supabaseAuth, config);

    await useCase.execute({
      email: 'user@example.com',
      password: 'Password1',
      fullName: 'Usuario',
      phone: '3001234567',
      city: 'Bogotá',
      profilePhotoUrl: 'data:image/jpeg;base64,abc',
      role: Role.COMENSAL,
      acceptedTerms: true,
      acceptedPrivacy: true,
    });

    expect(supabaseAuth.createUser).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'Password1',
    });
    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'supabase-user-1',
        fullName: 'Usuario',
        phone: '3001234567',
        city: 'Bogotá',
        profilePhotoUrl: 'data:image/jpeg;base64,abc',
      }),
    );
  });

  it('rechaza el registro si el correo ya existe en Supabase', async () => {
    const users = {
      findByEmail: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    } as unknown as UserRepository;
    const supabaseAuth = {
      createUser: jest
        .fn()
        .mockRejectedValue(
          new SupabaseUserAlreadyExistsError('user@example.com'),
        ),
      deleteUser: jest.fn(),
    } as unknown as SupabaseAuthService;
    const config = {
      get: jest.fn().mockReturnValue('1.0'),
    } as unknown as ConfigService;
    const useCase = new RegisterUserUseCase(users, supabaseAuth, config);

    await expect(
      useCase.execute({
        email: 'user@example.com',
        password: 'Password1',
        fullName: 'Usuario',
        phone: '3001234567',
        city: 'Bogotá',
        role: Role.COMENSAL,
        acceptedTerms: true,
        acceptedPrivacy: true,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(users.create).not.toHaveBeenCalled();
  });

  it('revierte la cuenta de Supabase si falla la creación del perfil local', async () => {
    const users = {
      findByEmail: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockRejectedValue(new Error('db down')),
    } as unknown as UserRepository;
    const supabaseAuth = {
      createUser: jest.fn().mockResolvedValue({
        id: 'supabase-user-1',
        email: 'user@example.com',
        emailConfirmedAt: null,
      }),
      deleteUser: jest.fn().mockResolvedValue(undefined),
    } as unknown as SupabaseAuthService;
    const config = {
      get: jest.fn().mockReturnValue('1.0'),
    } as unknown as ConfigService;
    const useCase = new RegisterUserUseCase(users, supabaseAuth, config);

    await expect(
      useCase.execute({
        email: 'user@example.com',
        password: 'Password1',
        fullName: 'Usuario',
        phone: '3001234567',
        city: 'Bogotá',
        role: Role.COMENSAL,
        acceptedTerms: true,
        acceptedPrivacy: true,
      }),
    ).rejects.toThrow('db down');
    expect(supabaseAuth.deleteUser).toHaveBeenCalledWith('supabase-user-1');
  });
});
