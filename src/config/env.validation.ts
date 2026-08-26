/**
 * Validacion de variables de entorno al arrancar.
 * Si falta un secreto o es demasiado debil, la API no levanta: es preferible
 * fallar de inmediato a arrancar con una configuracion insegura.
 */

const MIN_SECRET_LENGTH = 32;

function requireString(env: Record<string, unknown>, key: string): string {
  const value = env[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      `Falta la variable de entorno ${key}. Copiala desde .env.example.`,
    );
  }
  return value;
}

function requireSecret(env: Record<string, unknown>, key: string): string {
  const value = requireString(env, key);
  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `${key} debe tener al menos ${MIN_SECRET_LENGTH} caracteres. Genera uno con: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`,
    );
  }
  if (value.startsWith('genera_')) {
    throw new Error(
      `${key} sigue con el valor de ejemplo. Genera un secreto propio.`,
    );
  }
  return value;
}

function requireInt(
  env: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} debe ser un entero positivo.`);
  }
  return parsed;
}

export interface AppEnv {
  DATABASE_URL: string;
  JWT_ACCESS_SECRET: string;
  REFRESH_TOKEN_PEPPER: string;
  JWT_ACCESS_TTL: string;
  JWT_REFRESH_TTL: string;
  JWT_ISSUER: string;
  JWT_AUDIENCE: string;
  LOGIN_MAX_ATTEMPTS: number;
  LOGIN_LOCK_MINUTES: number;
  PASSWORD_HASH_MEMORY_KIB: number;
  PASSWORD_HASH_ITERATIONS: number;
  PASSWORD_HASH_PARALLELISM: number;
  PORT: number;
  CORS_ORIGINS: string[];
}

export function validateEnv(
  config: Record<string, unknown>,
): AppEnv & Record<string, unknown> {
  const validated: AppEnv = {
    DATABASE_URL: requireString(config, 'DATABASE_URL'),
    JWT_ACCESS_SECRET: requireSecret(config, 'JWT_ACCESS_SECRET'),
    REFRESH_TOKEN_PEPPER: requireSecret(config, 'REFRESH_TOKEN_PEPPER'),
    JWT_ACCESS_TTL: (config.JWT_ACCESS_TTL as string) ?? '15m',
    JWT_REFRESH_TTL: (config.JWT_REFRESH_TTL as string) ?? '30d',
    JWT_ISSUER: (config.JWT_ISSUER as string) ?? 'parchemos-api',
    JWT_AUDIENCE: (config.JWT_AUDIENCE as string) ?? 'parchemos-app',
    LOGIN_MAX_ATTEMPTS: requireInt(config, 'LOGIN_MAX_ATTEMPTS', 5),
    LOGIN_LOCK_MINUTES: requireInt(config, 'LOGIN_LOCK_MINUTES', 15),
    PASSWORD_HASH_MEMORY_KIB: requireInt(
      config,
      'PASSWORD_HASH_MEMORY_KIB',
      65536,
    ),
    PASSWORD_HASH_ITERATIONS: requireInt(config, 'PASSWORD_HASH_ITERATIONS', 3),
    PASSWORD_HASH_PARALLELISM: requireInt(
      config,
      'PASSWORD_HASH_PARALLELISM',
      4,
    ),
    PORT: requireInt(config, 'PORT', 3001),
    CORS_ORIGINS: ((config.CORS_ORIGINS as string) ?? 'http://localhost:3000')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  };

  if (validated.JWT_ACCESS_SECRET === validated.REFRESH_TOKEN_PEPPER) {
    throw new Error(
      'JWT_ACCESS_SECRET y REFRESH_TOKEN_PEPPER deben ser distintos.',
    );
  }

  return { ...config, ...validated };
}
