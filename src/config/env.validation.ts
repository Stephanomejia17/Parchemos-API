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
  /** Ruta del frontend a la que Supabase redirige tras el enlace de recuperacion. */
  PASSWORD_RESET_URL: string;
  /** Cuanto tiempo sigue el navegador enviando la cookie del refresh token. */
  JWT_REFRESH_TTL: string;
  LOGIN_MAX_ATTEMPTS: number;
  LOGIN_LOCK_MINUTES: number;
  PORT: number;
  CORS_ORIGINS: string[];
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_STORAGE_BUCKET: string;
}

export function validateEnv(
  config: Record<string, unknown>,
): AppEnv & Record<string, unknown> {
  const validated: AppEnv = {
    DATABASE_URL: requireString(config, 'DATABASE_URL'),
    PASSWORD_RESET_URL: requireString(config, 'PASSWORD_RESET_URL'),
    JWT_REFRESH_TTL: (config.JWT_REFRESH_TTL as string) ?? '30d',
    LOGIN_MAX_ATTEMPTS: requireInt(config, 'LOGIN_MAX_ATTEMPTS', 5),
    LOGIN_LOCK_MINUTES: requireInt(config, 'LOGIN_LOCK_MINUTES', 15),
    PORT: requireInt(config, 'PORT', 3001),
    CORS_ORIGINS: ((config.CORS_ORIGINS as string) ?? 'http://localhost:3000')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    SUPABASE_URL: requireString(config, 'SUPABASE_URL'),
    SUPABASE_ANON_KEY: requireString(config, 'SUPABASE_ANON_KEY'),
    SUPABASE_SERVICE_ROLE_KEY: requireSecret(
      config,
      'SUPABASE_SERVICE_ROLE_KEY',
    ),
    SUPABASE_STORAGE_BUCKET: requireString(config, 'SUPABASE_STORAGE_BUCKET'),
  };

  return { ...config, ...validated };
}
