import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes } from 'node:crypto';
import {
  IssuedPasswordResetToken,
  PasswordResetTokenService,
} from '../../application/ports/password-reset-token-service';

@Injectable()
export class PasswordResetTokenServiceImpl implements PasswordResetTokenService {
  private readonly pepper: string;
  private readonly ttlMs: number;

  constructor(config: ConfigService) {
    this.pepper = config.getOrThrow<string>('PASSWORD_RESET_TOKEN_PEPPER');
    this.ttlMs = parseDuration(
      config.get<string>('PASSWORD_RESET_TTL', '30m'),
    );
  }

  issue(): IssuedPasswordResetToken {
    const token = randomBytes(32).toString('base64url');
    return {
      token,
      hash: this.hash(token),
      expiresAt: new Date(Date.now() + this.ttlMs),
    };
  }

  hash(token: string): string {
    return createHmac('sha256', this.pepper).update(token).digest('hex');
  }
}

function parseDuration(value: string): number {
  const match = /^(\d+)\s*([smhd])$/.exec(value.trim());
  if (!match) {
    throw new Error(`PASSWORD_RESET_TTL inválido: "${value}".`);
  }
  const amount = Number(match[1]);
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * multipliers[match[2] as keyof typeof multipliers];
}
