import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Role } from '../../../../common/enums/role.enum';
import { AccountStatus } from '../../domain/enums/account-status.enum';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  status: AccountStatus;
}

export interface IssuedRefreshToken {
  /** Valor en claro: viaja al cliente y no se guarda en ninguna parte. */
  token: string;
  /** HMAC del valor anterior: esto es lo unico que llega a la base de datos. */
  hash: string;
  expiresAt: Date;
}

@Injectable()
export class TokenService {
  private readonly pepper: string;
  private readonly refreshTtlMs: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    this.pepper = config.getOrThrow<string>('REFRESH_TOKEN_PEPPER');
    this.refreshTtlMs = parseDuration(
      config.get<string>('JWT_REFRESH_TTL', '30d'),
    );
  }

  signAccessToken(payload: AccessTokenPayload): Promise<string> {
    return this.jwt.signAsync(payload);
  }

  /**
   * El refresh token es aleatorio y opaco, no un JWT: asi se puede revocar de
   * verdad en el logout (GU-02 Esc. 5), cosa que un JWT autocontenido no permite.
   */
  issueRefreshToken(): IssuedRefreshToken {
    const token = randomBytes(48).toString('base64url');
    return {
      token,
      hash: this.hashRefreshToken(token),
      expiresAt: new Date(Date.now() + this.refreshTtlMs),
    };
  }

  /**
   * HMAC-SHA256 con un pepper del .env. Un volcado de la base de datos no
   * alcanza para reconstruir tokens validos sin ese secreto.
   */
  hashRefreshToken(token: string): string {
    return createHmac('sha256', this.pepper).update(token).digest('hex');
  }

  matchesHash(token: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hashRefreshToken(token), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }

  get refreshTokenMaxAgeMs(): number {
    return this.refreshTtlMs;
  }

  get accessTokenTtl(): string {
    return this.config.get<string>('JWT_ACCESS_TTL', '15m');
  }
}

/** Convierte '15m', '30d', '12h' o '900s' a milisegundos. */
function parseDuration(value: string): number {
  const match = /^(\d+)\s*([smhd])$/.exec(value.trim());
  if (!match) {
    throw new Error(
      `Duracion invalida: "${value}". Usa formatos como 15m, 12h o 30d.`,
    );
  }
  const amount = Number(match[1]);
  const unit = match[2] as 's' | 'm' | 'h' | 'd';
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * multipliers[unit];
}
