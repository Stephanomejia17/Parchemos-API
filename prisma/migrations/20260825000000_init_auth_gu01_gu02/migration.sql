-- ============================================================================
-- Parchemos - Migracion inicial de autenticacion
-- Cubre unicamente GU-01 (Registro) y GU-02 (Inicio y cierre de sesion)
-- Jira: PARCHE-169 / PARCHE-170
-- ============================================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";    -- correo case-insensitive

-- ---------------------------------------------------------------------------
-- 1. Tipos de dominio
-- ---------------------------------------------------------------------------

-- Roles de la plataforma. GU-01 solo permite auto-registro de comensal y
-- restaurante; los demas roles se crean desde otras historias (GU-05, GU-06).
CREATE TYPE public.user_role AS ENUM (
  'comensal',
  'restaurante',
  'personal_restaurante',
  'repartidor',
  'administrador'
);

-- Estados de la cuenta.
--   pendiente_aprobacion -> GU-01 Esc. 2 (restaurante recien registrado)
--   activa               -> GU-01 Esc. 1 / GU-02 Esc. 1
--   suspendida           -> GU-02 Esc. 3
--   deshabilitada        -> acceso revocado
CREATE TYPE public.account_status AS ENUM (
  'pendiente_aprobacion',
  'activa',
  'suspendida',
  'deshabilitada'
);

-- Motivo por el que una sesion deja de ser valida (GU-02 Esc. 5 y 6).
CREATE TYPE public.session_revoke_reason AS ENUM (
  'logout',
  'logout_all',
  'rotacion',
  'expiracion',
  'cambio_password',
  'cuenta_suspendida',
  'revocada_por_admin'
);

-- ---------------------------------------------------------------------------
-- 2. users - cuenta de acceso (GU-01)
-- ---------------------------------------------------------------------------
CREATE TABLE public.users (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Credenciales
  email                   citext NOT NULL,
  password_hash           text   NOT NULL,
  password_updated_at     timestamptz NOT NULL DEFAULT now(),

  -- Datos basicos del registro
  full_name               text   NOT NULL,
  phone                   text,

  -- Rol y estado
  role                    public.user_role      NOT NULL,
  status                  public.account_status NOT NULL DEFAULT 'activa',
  suspension_reason       text,
  status_changed_at       timestamptz NOT NULL DEFAULT now(),

  -- Aceptacion de terminos y politica de datos (GU-01 Esc. 6)
  terms_accepted_at       timestamptz NOT NULL,
  terms_version           text        NOT NULL DEFAULT '1.0',
  privacy_accepted_at     timestamptz NOT NULL,

  -- Control de acceso (GU-02 Esc. 4)
  failed_login_attempts   smallint    NOT NULL DEFAULT 0,
  locked_until            timestamptz,
  last_login_at           timestamptz,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  -- Formato de correo valido (GU-01 Esc. 1 y 2)
  CONSTRAINT users_email_format_chk
    CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[A-Za-z]{2,}$'),

  -- El hash nunca puede quedar vacio ni guardar la contrasena en claro
  CONSTRAINT users_password_hash_chk
    CHECK (length(password_hash) >= 20),

  CONSTRAINT users_full_name_chk
    CHECK (length(btrim(full_name)) BETWEEN 2 AND 120),

  -- Solo las cuentas de restaurante nacen "Pendiente de aprobacion" (GU-01 Esc. 2)
  CONSTRAINT users_pendiente_solo_restaurante_chk
    CHECK (status <> 'pendiente_aprobacion' OR role = 'restaurante'),

  -- Una suspension siempre debe tener motivo (GU-02 Esc. 3)
  CONSTRAINT users_suspension_reason_chk
    CHECK (
      (status = 'suspendida'
         AND suspension_reason IS NOT NULL
         AND length(btrim(suspension_reason)) > 0)
      OR
      (status <> 'suspendida' AND suspension_reason IS NULL)
    ),

  CONSTRAINT users_failed_attempts_chk
    CHECK (failed_login_attempts >= 0 AND failed_login_attempts <= 100)
);

-- Correo unico en toda la plataforma, sin importar el rol (GU-01 Esc. 3)
CREATE UNIQUE INDEX users_email_key ON public.users (email);
CREATE INDEX users_status_idx       ON public.users (status);
CREATE INDEX users_role_idx         ON public.users (role);

COMMENT ON TABLE  public.users IS 'Cuentas de acceso a Parchemos (GU-01, GU-02).';
COMMENT ON COLUMN public.users.password_hash IS 'Hash Argon2id/bcrypt. NUNCA texto plano.';
COMMENT ON COLUMN public.users.locked_until  IS 'Bloqueo temporal por intentos fallidos (GU-02 Esc. 4).';

-- ---------------------------------------------------------------------------
-- 3. sessions - refresh tokens vigentes (GU-02 Esc. 1, 5 y 6)
-- ---------------------------------------------------------------------------
CREATE TABLE public.sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,

  -- Se guarda SOLO el hash (SHA-256) del refresh token; el valor en claro
  -- unicamente viaja al cliente. Asi un dump de la BD no permite suplantar.
  refresh_token_hash  text NOT NULL,

  issued_at           timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  last_used_at        timestamptz,

  -- Cierre de sesion: invalida el token (GU-02 Esc. 5)
  revoked_at          timestamptz,
  revoked_reason      public.session_revoke_reason,

  -- Contexto del dispositivo, para auditoria
  ip_address          inet,
  user_agent          text,

  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sessions_expires_after_issue_chk CHECK (expires_at > issued_at),
  CONSTRAINT sessions_revoked_pair_chk
    CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL))
);

CREATE UNIQUE INDEX sessions_refresh_token_hash_key ON public.sessions (refresh_token_hash);
CREATE INDEX sessions_user_id_idx ON public.sessions (user_id);
CREATE INDEX sessions_activas_idx ON public.sessions (user_id, expires_at)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE public.sessions IS 'Refresh tokens vigentes. El logout marca revoked_at (GU-02 Esc. 5 y 6).';

-- ---------------------------------------------------------------------------
-- 4. login_attempts - bitacora de intentos (GU-02 Esc. 2 y 4)
-- ---------------------------------------------------------------------------
CREATE TABLE public.login_attempts (
  id                bigserial PRIMARY KEY,

  -- Se registra el correo tecleado aunque no exista la cuenta, para poder
  -- limitar por identificador sin revelar si el correo esta registrado.
  email_attempted   citext NOT NULL,
  user_id           uuid REFERENCES public.users (id) ON DELETE SET NULL,

  successful        boolean NOT NULL,
  failure_reason    text,

  ip_address        inet,
  user_agent        text,

  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT login_attempts_failure_reason_chk
    CHECK (successful = false OR failure_reason IS NULL)
);

CREATE INDEX login_attempts_email_created_idx ON public.login_attempts (email_attempted, created_at DESC);
CREATE INDEX login_attempts_user_created_idx  ON public.login_attempts (user_id, created_at DESC);
CREATE INDEX login_attempts_ip_created_idx    ON public.login_attempts (ip_address, created_at DESC);

COMMENT ON TABLE public.login_attempts IS 'Bitacora de inicios de sesion para bloqueo temporal y auditoria (GU-02 Esc. 4).';

-- ---------------------------------------------------------------------------
-- 5. Triggers de mantenimiento
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Marca la fecha del cambio de estado (aprobacion / suspension / reactivacion)
CREATE OR REPLACE FUNCTION public.touch_status_changed_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER users_touch_status_changed_at
  BEFORE UPDATE OF status ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.touch_status_changed_at();

-- ---------------------------------------------------------------------------
-- 6. Blindaje de acceso
--    Supabase expone estas tablas por PostgREST con la anon key publica.
--    La API NestJS se conecta como rol propietario (no pasa por PostgREST),
--    asi que aqui se cierra por completo el acceso anonimo.
-- ---------------------------------------------------------------------------
ALTER TABLE public.users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- Sin politicas definidas => todo rol sujeto a RLS queda sin acceso.
REVOKE ALL ON public.users          FROM anon, authenticated;
REVOKE ALL ON public.sessions       FROM anon, authenticated;
REVOKE ALL ON public.login_attempts FROM anon, authenticated;
