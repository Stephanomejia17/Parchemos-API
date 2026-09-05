import { Inject, Injectable } from '@nestjs/common';
import { UnauthorizedError } from '../../../../common/errors/unauthorized-error';
import { SupabaseAuthService } from '../../../../infrastructure/auth/supabase-auth.service';
import { USER_REPOSITORY } from '../../domain/repositories/user.repository';
import type { UserRepository } from '../../domain/repositories/user.repository';
import { AuthResult } from '../dto/auth-response.dto';
import { LoginUseCase } from './login.use-case';

/** Renueva el access token a partir del refresh token que emitio Supabase. */
@Injectable()
export class RefreshSessionUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly supabaseAuth: SupabaseAuthService,
    private readonly login: LoginUseCase,
  ) {}

  async execute(refreshToken: string | undefined): Promise<AuthResult> {
    if (!refreshToken) {
      throw new UnauthorizedError('Sesión no válida.', 'INVALID_SESSION');
    }

    // GU-02 Esc. 6: token revocado, expirado o inexistente.
    const session = await this.supabaseAuth.refreshSession(refreshToken);
    if (!session) {
      throw new UnauthorizedError('Sesión no válida.', 'INVALID_SESSION');
    }

    const user = await this.users.findById(session.userId);
    if (!user) {
      throw new UnauthorizedError('Sesión no válida.', 'INVALID_SESSION');
    }

    // Si la cuenta cambio de estado despues de iniciar sesion, la sesion muere.
    if (user.isSuspended() || user.isDisabled()) {
      await this.supabaseAuth
        .signOut(session.accessToken)
        .catch(() => undefined);
      throw new UnauthorizedError('Sesión no válida.', 'INVALID_SESSION');
    }

    return this.login.issueSession(user, session);
  }
}
