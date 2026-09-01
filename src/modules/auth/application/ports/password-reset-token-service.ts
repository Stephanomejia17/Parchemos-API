export const PASSWORD_RESET_TOKEN_SERVICE = Symbol(
  'PASSWORD_RESET_TOKEN_SERVICE',
);

export interface IssuedPasswordResetToken {
  token: string;
  hash: string;
  expiresAt: Date;
}

export interface PasswordResetTokenService {
  issue(): IssuedPasswordResetToken;
  hash(token: string): string;
}
