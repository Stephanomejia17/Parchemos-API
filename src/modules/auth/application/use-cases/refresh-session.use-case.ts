import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { SESSION_REPOSITORY } from '../../domain/repositories/session.repository';
import type { SessionRepository } from '../../domain/repositories/session.repository';
import { USER_REPOSITORY } from '../../domain/repositories/user.repository';
import type { UserRepository } from '../../domain/repositories/user.repository';
import { TokenService } from '../../infrastructure/security/token.service';
import { AuthResult } from '../dto/auth-response.dto';
import { LoginUseCase, RequestContext } from './login.use-case';

/**
 * Renueva el access token a partir del refresh token.
 *
 * Aplica rotacion: cada uso revoca el token anterior y entrega uno nuevo, de
 * modo que un token robado deja de servir en cuanto el dueno legitimo refresca.
 */
@Injectable()
export class RefreshSessionUseCase {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly tokens: TokenService,
    private readonly login: LoginUseCase,
  ) {}

  async execute(
    refreshToken: string | undefined,
    ctx: RequestContext,
  ): Promise<AuthResult> {
    if (!refreshToken) {
      throw new UnauthorizedException('Sesión no válida.');
    }

    const hash = this.tokens.hashRefreshToken(refreshToken);
    const session = await this.sessions.findActiveByTokenHash(hash);
    if (!session) {
      // GU-02 Esc. 6: token revocado, expirado o inexistente.
      throw new UnauthorizedException('Sesión no válida.');
    }

    const user = await this.users.findById(session.userId);
    if (!user) {
      await this.sessions.revokeByTokenHash(hash, 'revocada_por_admin');
      throw new UnauthorizedException('Sesión no válida.');
    }

    // Si la cuenta cambio de estado despues de iniciar sesion, la sesion muere.
    if (user.isSuspended() || user.isDisabled()) {
      await this.sessions.revokeAllForUser(user.id, 'cuenta_suspendida');
      throw new UnauthorizedException('Sesión no válida.');
    }

    await this.sessions.revokeByTokenHash(hash, 'rotacion');
    return this.login.issueSession(user, ctx);
  }
}
