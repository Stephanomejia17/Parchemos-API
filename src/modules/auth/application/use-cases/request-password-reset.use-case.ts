import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { USER_REPOSITORY } from '../../domain/repositories/user.repository';
import type { UserRepository } from '../../domain/repositories/user.repository';
import {
  PASSWORD_RESET_TOKEN_REPOSITORY,
} from '../../domain/repositories/password-reset-token.repository';
import type {
  PasswordResetTokenRepository,
} from '../../domain/repositories/password-reset-token.repository';
import { PASSWORD_RESET_MAILER } from '../ports/password-reset-mailer';
import type { PasswordResetMailer } from '../ports/password-reset-mailer';
import { PASSWORD_RESET_TOKEN_SERVICE } from '../ports/password-reset-token-service';
import type { PasswordResetTokenService } from '../ports/password-reset-token-service';

export interface PasswordResetRequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class RequestPasswordResetUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_RESET_TOKEN_REPOSITORY)
    private readonly resetTokens: PasswordResetTokenRepository,
    @Inject(PASSWORD_RESET_TOKEN_SERVICE)
    private readonly tokens: PasswordResetTokenService,
    @Inject(PASSWORD_RESET_MAILER)
    private readonly mailer: PasswordResetMailer,
    private readonly config: ConfigService,
  ) {}

  async execute(
    email: string,
    context: PasswordResetRequestContext,
  ): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user || user.isDisabled()) return;

    const issued = this.tokens.issue();
    await this.resetTokens.create({
      userId: user.id,
      tokenHash: issued.hash,
      expiresAt: issued.expiresAt,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    const frontendUrl = this.config.getOrThrow<string>('PASSWORD_RESET_URL');
    const resetUrl = `${frontendUrl}${frontendUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(issued.token)}`;
    await this.mailer.sendPasswordResetEmail({
      email: user.email,
      fullName: user.fullName,
      resetUrl,
    });
  }
}
