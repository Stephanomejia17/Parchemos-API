/** Puerto de hashing: la aplicación conoce el contrato, no Argon2 ni Nest. */
export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');

export interface PasswordHasher {
  hash(plainPassword: string): Promise<string>;
}
