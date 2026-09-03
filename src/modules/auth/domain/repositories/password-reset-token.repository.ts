export const PASSWORD_RESET_TOKEN_REPOSITORY = Symbol(
  'PASSWORD_RESET_TOKEN_REPOSITORY',
);

export interface CreatePasswordResetTokenData {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface ActivePasswordResetToken {
  id: string;
  userId: string;
  expiresAt: Date;
}

export interface PasswordResetTokenRepository {
  create(data: CreatePasswordResetTokenData): Promise<void>;
  findActiveByHash(tokenHash: string): Promise<ActivePasswordResetToken | null>;
  markUsed(id: string): Promise<boolean>;
}
