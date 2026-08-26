import { Inject, Injectable } from '@nestjs/common';
import { SESSION_REPOSITORY } from '../../domain/repositories/session.repository';
import type { SessionRepository } from '../../domain/repositories/session.repository';
import { TokenService } from '../../infrastructure/security/token.service';

/** GU-02 Esc. 5 y 6 - Cierre de sesion. */
@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    private readonly tokens: TokenService,
  ) {}

  /**
   * Invalida el refresh token en el servidor. Es idempotente a proposito: un
   * logout con un token ya revocado no debe devolver error ni revelar nada.
   */
  async execute(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.sessions.revokeByTokenHash(
      this.tokens.hashRefreshToken(refreshToken),
      'logout',
    );
  }

  /** Cierra la sesion en todos los dispositivos. */
  async executeForAllDevices(userId: string): Promise<number> {
    return this.sessions.revokeAllForUser(userId, 'logout_all');
  }
}
