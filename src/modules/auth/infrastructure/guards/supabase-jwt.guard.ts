import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../../../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../../../../common/decorators/current-user.decorator';
import { SupabaseAuthService } from '../../../../infrastructure/auth/supabase-auth.service';
import { AccountDisabledError } from '../../domain/errors/account-disabled.error';
import { AccountSuspendedError } from '../../domain/errors/account-suspended.error';
import { InvalidTokenError } from '../../domain/errors/invalid-token.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { USER_REPOSITORY } from '../../domain/repositories/user.repository';
import type { UserRepository } from '../../domain/repositories/user.repository';

/**
 * Guard global: valida el access token de Supabase Auth y carga el perfil y
 * el rol desde la base antes de dejar pasar la peticion.
 */
@Injectable()
export class SupabaseJwtGuard implements CanActivate {
  constructor(
    private readonly supabaseAuth: SupabaseAuthService,
    private readonly reflector: Reflector,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const token = extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('No hay sesión activa.');
    }

    try {
      const supabaseUser = await this.supabaseAuth.verifyAccessToken(token);
      const account = await this.users.findById(supabaseUser.id);
      if (!account) {
        throw new UserNotFoundError(supabaseUser.id);
      }
      if (account.isDisabled()) {
        throw new AccountDisabledError(account.id);
      }
      if (account.isSuspended()) {
        throw new AccountSuspendedError(account.id, account.suspensionReason);
      }

      request.user = {
        id: account.id,
        email: account.email,
        role: account.role,
        status: account.status,
      };
      return true;
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        throw new NotFoundException('Cuenta no encontrada.');
      }
      if (
        error instanceof AccountDisabledError ||
        error instanceof AccountSuspendedError
      ) {
        throw new ForbiddenException('Tu acceso fue deshabilitado.');
      }
      if (error instanceof InvalidTokenError) {
        throw new UnauthorizedException('Sesión expirada o no válida.');
      }
      throw error;
    }
  }
}

function extractBearerToken(request: Request): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}
