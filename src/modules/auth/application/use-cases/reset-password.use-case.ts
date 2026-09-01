import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PASSWORD_HASHER } from '../../domain/services/password-hasher';
import type { PasswordHasher } from '../../domain/services/password-hasher';
import { USER_REPOSITORY } from '../../domain/repositories/user.repository';
import type { UserRepository } from '../../domain/repositories/user.repository';
import { SESSION_REPOSITORY } from '../../domain/repositories/session.repository';
import type { SessionRepository } from '../../domain/repositories/session.repository';
import { PASSWORD_RESET_TOKEN_REPOSITORY } from '../../domain/repositories/password-reset-token.repository';
import type { PasswordResetTokenRepository } from '../../domain/repositories/password-reset-token.repository';
import { PASSWORD_RESET_TOKEN_SERVICE } from '../ports/password-reset-token-service';
import type { PasswordResetTokenService } from '../ports/password-reset-token-service';

@Injectable()
export class ResetPasswordUseCase {
  constructor(
    @Inject(PASSWORD_RESET_TOKEN_REPOSITORY)
    private readonly resetTokens: PasswordResetTokenRepository,
    @Inject(PASSWORD_RESET_TOKEN_SERVICE)
    private readonly tokens: PasswordResetTokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(PASSWORD_HASHER) private readonly passwords: PasswordHasher,
  ) {}

  async execute(token: string, newPassword: string): Promise<void> {
    const resetToken = await this.resetTokens.findActiveByHash(
      this.tokens.hash(token),
    );
    if (!resetToken) {
      throw new UnauthorizedException('El enlace de recuperación no es válido o expiró.');
    }

    const claimed = await this.resetTokens.markUsed(resetToken.id);
    if (!claimed) {
      throw new UnauthorizedException('El enlace de recuperación no es válido o expiró.');
    }

    const passwordHash = await this.passwords.hash(newPassword);
    await this.users.updatePassword(resetToken.userId, passwordHash);
    await this.sessions.revokeAllForUser(resetToken.userId, 'cambio_password');
  }
}
