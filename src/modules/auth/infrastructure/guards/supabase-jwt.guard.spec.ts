import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  IS_PUBLIC_KEY,
  OPTIONAL_AUTH_KEY,
} from '../../../../common/decorators/public.decorator';
import type { SupabaseAuthService } from '../../../../infrastructure/auth/supabase-auth.service';
import { InvalidTokenError } from '../../domain/errors/invalid-token.error';
import type { UserRepository } from '../../domain/repositories/user.repository';
import { SupabaseJwtGuard } from './supabase-jwt.guard';

const ACCOUNT = {
  id: 'user-1',
  email: 'a@test.dev',
  role: 'comensal',
  status: 'activa',
  isDisabled: () => false,
  isSuspended: () => false,
};

function setup(metadata: { isPublic?: boolean; optional?: boolean }) {
  const supabaseAuth = {
    verifyAccessToken: jest.fn().mockResolvedValue({ id: 'user-1' }),
  };
  const users = { findById: jest.fn().mockResolvedValue(ACCOUNT) };
  const reflector = {
    getAllAndOverride: jest.fn((key: string) =>
      key === IS_PUBLIC_KEY
        ? metadata.isPublic
        : key === OPTIONAL_AUTH_KEY
          ? metadata.optional
          : undefined,
    ),
  } as unknown as Reflector;
  const guard = new SupabaseJwtGuard(
    supabaseAuth as unknown as SupabaseAuthService,
    reflector,
    users as unknown as UserRepository,
  );
  const request: { headers: Record<string, string>; user?: unknown } = {
    headers: {},
  };
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { guard, request, context, supabaseAuth };
}

describe('SupabaseJwtGuard', () => {
  it('un endpoint protegido sin token responde 401', async () => {
    const { guard, context } = setup({});
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('un endpoint publico no consulta el token (no identifica al usuario)', async () => {
    const { guard, context, request, supabaseAuth } = setup({ isPublic: true });
    request.headers.authorization = 'Bearer abc';

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(supabaseAuth.verifyAccessToken).not.toHaveBeenCalled();
    expect(request.user).toBeUndefined();
  });

  it('publico + auth opcional con token valido identifica al usuario', async () => {
    const { guard, context, request } = setup({
      isPublic: true,
      optional: true,
    });
    request.headers.authorization = 'Bearer abc';

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(request.user).toMatchObject({ id: 'user-1', role: 'comensal' });
  });

  it('publico + auth opcional con token invalido atiende como visitante (no falla)', async () => {
    const { guard, context, request, supabaseAuth } = setup({
      isPublic: true,
      optional: true,
    });
    supabaseAuth.verifyAccessToken.mockRejectedValue(new InvalidTokenError());
    request.headers.authorization = 'Bearer vencido';

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(request.user).toBeUndefined();
  });

  it('publico + auth opcional sin token tampoco falla', async () => {
    const { guard, context, request } = setup({
      isPublic: true,
      optional: true,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });
});
