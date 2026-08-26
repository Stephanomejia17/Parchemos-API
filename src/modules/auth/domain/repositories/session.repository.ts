export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');

export interface ActiveSession {
  id: string;
  userId: string;
  expiresAt: Date;
}

export interface CreateSessionData {
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export type RevokeReason =
  | 'logout'
  | 'logout_all'
  | 'rotacion'
  | 'expiracion'
  | 'cambio_password'
  | 'cuenta_suspendida'
  | 'revocada_por_admin';

export interface SessionRepository {
  create(data: CreateSessionData): Promise<ActiveSession>;
  /** Devuelve la sesion solo si sigue vigente (no revocada y sin expirar). */
  findActiveByTokenHash(
    refreshTokenHash: string,
  ): Promise<ActiveSession | null>;
  revokeByTokenHash(
    refreshTokenHash: string,
    reason: RevokeReason,
  ): Promise<void>;
  revokeAllForUser(userId: string, reason: RevokeReason): Promise<number>;
}
