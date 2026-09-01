# Parchemos API

API de Parchemos: NestJS + Prisma 7 + PostgreSQL (Supabase).

Alcance implementado: **GU-01 Registro** (PARCHE-169) y **GU-02 Gestión de sesión** (PARCHE-170).

## Puesta en marcha

```bash
npm install                 # postinstall corre `prisma generate`
cp .env.example .env        # y completa los valores
npm run db:deploy           # aplica las migraciones
npm run db:seed:admin       # crea la cuenta de administrador
npm run start:dev           # http://localhost:3001/api
```

Genera cada secreto con:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## Endpoints

| Método | Ruta                 | Público | Qué hace |
|--------|----------------------|---------|----------|
| POST   | `/api/auth/register` | sí      | GU-01. Crea la cuenta y devuelve al login. No inicia sesión. |
| POST   | `/api/auth/login`    | sí      | GU-02 Esc. 1-4. Devuelve `accessToken` y deja el refresh token en cookie httpOnly. |
| POST   | `/api/auth/refresh`  | sí      | Renueva el access token con la cookie. Rota el refresh token. |
| POST   | `/api/auth/logout`   | sí      | GU-02 Esc. 5. Revoca la sesión y borra la cookie. |
| GET    | `/api/auth/me`       | no      | Datos del usuario autenticado. |
| POST   | `/api/auth/forgot-password` | sí | Solicita un enlace de recuperación por correo. |
| POST   | `/api/auth/reset-password` | sí | Cambia la contraseña usando un token de un solo uso. |

Todo endpoint nuevo nace protegido: el `JwtAuthGuard` es global y solo lo
esquivan los marcados con `@Public()`.

## Decisiones de seguridad

- **Argon2id** para las contraseñas (`@node-rs/argon2`), con parámetros en `.env`.
- **Access token JWT de 15 min** + **refresh token opaco de 30 días**. El refresh
  es aleatorio, no un JWT, para poder revocarlo de verdad en el logout.
- Del refresh token la base de datos guarda solo un **HMAC-SHA256** con un pepper
  (`REFRESH_TOKEN_PEPPER`): un volcado de la BD no permite suplantar sesiones.
- **Rotación**: cada refresh revoca el token anterior.
- La cookie del refresh es `httpOnly`, con `path=/api/auth`; en producción sale
  `secure` y `sameSite=none`.
- **Error genérico** ante credenciales malas y hash de relleno cuando el correo
  no existe, para no filtrar qué correos están registrados (ni por mensaje ni
  por tiempo de respuesta).
- **Bloqueo temporal** tras 5 intentos fallidos (`LOGIN_MAX_ATTEMPTS`), resuelto
  en una sola sentencia SQL para que no haya carreras.
- **Rate limit** por IP: 10 registros/min y 20 logins/min.
- `ValidationPipe` con `whitelist` y `forbidNonWhitelisted`.
- Las tablas tienen **RLS activo sin políticas** y sin permisos para `anon` /
  `authenticated`: aunque Supabase las exponga por PostgREST, no son accesibles.

## Base de datos

Tres tablas, solo lo que GU-01 y GU-02 necesitan:

- `users` — cuenta, rol, estado, aceptación de términos, contador de fallos.
- `sessions` — refresh tokens vigentes; el logout marca `revoked_at`.
- `login_attempts` — bitácora de accesos para el bloqueo y la auditoría.

Las reglas que Prisma no modela (CHECKs, triggers, RLS) viven en
`prisma/migrations/20260825000000_init_auth_gu01_gu02/migration.sql`.

`prisma/reset-public-schema.mjs --yes` deja el esquema `public` vacío
(operación destructiva, pensada solo para desarrollo).

> Las migraciones usan `DIRECT_URL` (puerto 5432). En Prisma 7 el
> `datasource` del config no acepta `directUrl` y lo ignora en silencio, por eso
> `prisma.config.ts` asigna `url: DIRECT_URL`.

## Recuperación de contraseña con Brevo

La autenticación continúa siendo propia de la API. Supabase almacena los
tokens en `password_reset_tokens` y solo conserva su HMAC; Brevo envía el
enlace de recuperación.

Configura en `.env` `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`,
`BREVO_SENDER_NAME`, `PASSWORD_RESET_URL`, `PASSWORD_RESET_TOKEN_PEPPER` y
opcionalmente `PASSWORD_RESET_TTL` (por defecto `30m`). El remitente debe estar
verificado en Brevo.

La solicitud responde con un mensaje genérico para no revelar si el correo
existe. Al completar el cambio, el token se invalida y se revocan todas las
sesiones activas del usuario.
