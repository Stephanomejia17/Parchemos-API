-- ============================================================================
-- Parchemos - Modelo entidad-relacion v2 (PARCHE-450)
-- ----------------------------------------------------------------------------
-- Reestructura la base para cubrir todo el backlog del proyecto:
--   GU-01..GU-09  Gestion de usuarios y moderacion
--   PU-01..PU-08  Perfil, preferencias, puntos y perfiles de negocio
--   AN-01..AN-05  Administracion del negocio (perfil, carta, disponibilidad,
--                 descuentos y mesas)
--   R-01..R-04    Reservas
--   GP-01..GP-10  Pedidos, QR de mesa, pagos, division de cuenta y delivery
--   RC-01, RC-02  Calificaciones de sede y de producto
--   DO-01..DO-05  Descubrimiento, feed, publicaciones y favoritos
--   MB-01, MB-02  Filtros, orden y busqueda
--   AE-01..AE-03  Ingresos, comisiones y tendencias
--
-- Principios aplicados:
--   * Tablas en plural, columnas snake_case.
--   * `users` queda como tabla de identidad/acceso; los datos personales pasan
--     a `user_profiles` (1:1) y las preferencias a sus propias tablas.
--   * Ninguna imagen vive en la base: solo URL/clave del objeto en el bucket.
--     Un CHECK bloquea explicitamente los data URI (base64).
--   * Integridad declarativa con FKs compuestas donde una FK simple permitiria
--     mezclar datos de restaurantes o sedes distintas.
--   * Importes en numeric(12,2); nada de float para dinero.
--   * Agregados de solo lectura (calificacion promedio, saldo de puntos, total
--     pagado de una cuenta) los mantienen triggers, no la aplicacion.
-- ============================================================================

SET search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 0. Extensiones
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto"   WITH SCHEMA extensions;  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";                             -- correo case-insensitive
CREATE EXTENSION IF NOT EXISTS "pg_trgm";                            -- MB-02 busqueda parcial por nombre
CREATE EXTENSION IF NOT EXISTS "unaccent";                           -- MB-02 busqueda sin tildes
CREATE EXTENSION IF NOT EXISTS "btree_gist";                         -- EXCLUDE con = sobre uuid/smallint
CREATE EXTENSION IF NOT EXISTS "postgis"    WITH SCHEMA extensions;  -- DO-01 cercania (PARCHE-53/54/55)

-- Rango de horas: soporta el EXCLUDE que impide franjas horarias solapadas.
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'timerange' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.timerange AS RANGE (subtype = time without time zone);
  END IF;
END
$do$;

-- ---------------------------------------------------------------------------
-- 1. Higiene de datos: fuera las imagenes embebidas en la base
--    Las columnas de imagen deben guardar una URL/clave de objeto, nunca el
--    binario en base64. Se limpian los valores existentes antes de imponer el
--    CHECK; el equipo migrara esos archivos al bucket de objetos.
-- ---------------------------------------------------------------------------
UPDATE public.users     SET profile_photo_url = NULL WHERE profile_photo_url ILIKE 'data:%';
UPDATE public.locations SET logo_url          = NULL WHERE logo_url          ILIKE 'data:%';
UPDATE public.locations SET cover_url         = NULL WHERE cover_url         ILIKE 'data:%';
UPDATE public.products  SET image_url         = NULL WHERE image_url         ILIKE 'data:%';
DELETE FROM public.location_images WHERE url ILIKE 'data:%';

-- Una referencia de imagen valida es una URL o una clave relativa del bucket;
-- jamas un data URI.
CREATE OR REPLACE FUNCTION public.is_media_reference(value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $fn$
  SELECT value IS NULL
      OR (length(value) BETWEEN 1 AND 2048 AND value !~* '^[[:space:]]*data:');
$fn$;

-- ---------------------------------------------------------------------------
-- 2. users -> identidad; user_profiles -> datos personales (PU-01)
-- ---------------------------------------------------------------------------
CREATE TABLE public.user_profiles (
  user_id     uuid PRIMARY KEY REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  full_name   text        NOT NULL,
  phone       text,
  photo_url   text,
  city        text,
  birth_date  date,
  bio         text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT user_profiles_full_name_chk  CHECK (length(btrim(full_name)) BETWEEN 2 AND 120),
  CONSTRAINT user_profiles_phone_chk      CHECK (phone IS NULL OR phone ~ '^[+]?[0-9 ()-]{7,20}$'),
  CONSTRAINT user_profiles_city_chk       CHECK (city IS NULL OR length(btrim(city)) BETWEEN 2 AND 120),
  CONSTRAINT user_profiles_bio_chk        CHECK (bio IS NULL OR length(bio) <= 500),
  CONSTRAINT user_profiles_birth_date_chk CHECK (birth_date IS NULL OR birth_date < CURRENT_DATE),
  CONSTRAINT user_profiles_photo_chk      CHECK (public.is_media_reference(photo_url))
);
COMMENT ON TABLE public.user_profiles IS 'Datos personales del usuario (PU-01). Separados de users para no cargar la tabla de autenticacion.';

INSERT INTO public.user_profiles (user_id, full_name, phone, photo_url, city, created_at, updated_at)
SELECT id, full_name, phone, profile_photo_url, city, created_at, updated_at
FROM public.users;

ALTER TABLE public.users
  DROP COLUMN full_name,
  DROP COLUMN phone,
  DROP COLUMN profile_photo_url,
  DROP COLUMN city;

-- Retencion legal de la solicitud de eliminacion (GU-07 / PU-01).
ALTER TABLE public.users
  ADD CONSTRAINT users_deletion_window_chk
  CHECK (
    (deletion_requested_at IS NULL AND deletion_effective_at IS NULL)
    OR (deletion_requested_at IS NOT NULL AND deletion_effective_at > deletion_requested_at)
  );

-- ---------------------------------------------------------------------------
-- 3. restaurant_staff: reemplaza users.sede_id (GU-05)
--    Una cuenta de personal puede vincularse a mas de una sede y su historial
--    se conserva al revocar el acceso (PARCHE-284/285/286).
-- ---------------------------------------------------------------------------
CREATE TABLE public.restaurant_staff (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES public.users(id)     ON UPDATE CASCADE ON DELETE CASCADE,
  location_id uuid        NOT NULL REFERENCES public.locations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  position    text,
  is_active   boolean     NOT NULL DEFAULT true,
  hired_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT restaurant_staff_user_location_key UNIQUE (user_id, location_id),
  CONSTRAINT restaurant_staff_position_chk CHECK (position IS NULL OR length(btrim(position)) BETWEEN 2 AND 80),
  CONSTRAINT restaurant_staff_revoked_chk  CHECK ((is_active AND revoked_at IS NULL) OR (NOT is_active AND revoked_at IS NOT NULL))
);
COMMENT ON TABLE public.restaurant_staff IS 'Vinculo entre una cuenta personal_restaurante y las sedes donde opera (GU-05).';

INSERT INTO public.restaurant_staff (user_id, location_id, is_active, hired_at, created_at, updated_at)
SELECT id, sede_id, status <> 'deshabilitada', created_at, created_at, updated_at
FROM public.users
WHERE sede_id IS NOT NULL;

UPDATE public.restaurant_staff SET revoked_at = now() WHERE NOT is_active;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_personal_location_chk;
ALTER TABLE public.users DROP COLUMN sede_id;

CREATE INDEX restaurant_staff_location_idx ON public.restaurant_staff (location_id) WHERE is_active;
CREATE INDEX restaurant_staff_user_idx     ON public.restaurant_staff (user_id);

-- ---------------------------------------------------------------------------
-- 4. Auditoria y notificaciones transversales
-- ---------------------------------------------------------------------------

-- Bitacora generica: cambios de rol (GU-06/PARCHE-290), suspensiones (GU-07),
-- eliminacion de contenido (GU-08/PARCHE-300) y acciones sobre pedidos.
CREATE TABLE public.audit_logs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id    uuid REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  action      text        NOT NULL,
  entity_type text        NOT NULL,
  entity_id   uuid,
  reason      text,
  metadata    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ip_address  inet,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT audit_logs_action_chk      CHECK (length(btrim(action)) BETWEEN 3 AND 80),
  CONSTRAINT audit_logs_entity_type_chk CHECK (length(btrim(entity_type)) BETWEEN 3 AND 60)
);
COMMENT ON TABLE public.audit_logs IS 'Bitacora de acciones administrativas y de moderacion (GU-06, GU-07, GU-08).';

CREATE INDEX audit_logs_entity_idx ON public.audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX audit_logs_actor_idx  ON public.audit_logs (actor_id, created_at DESC);

-- Notificaciones in-app (PARCHE-198, 211, 296, 299, 428).
CREATE TABLE public.notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  type        text        NOT NULL,
  title       text        NOT NULL,
  body        text,
  entity_type text,
  entity_id   uuid,
  data        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT notifications_type_chk  CHECK (length(btrim(type)) BETWEEN 3 AND 60),
  CONSTRAINT notifications_title_chk CHECK (length(btrim(title)) BETWEEN 3 AND 160)
);
CREATE INDEX notifications_inbox_idx  ON public.notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON public.notifications (user_id, created_at DESC) WHERE read_at IS NULL;

-- ---------------------------------------------------------------------------
-- 5. Catalogos de gustos (PU-02, PU-03, MB-01)
-- ---------------------------------------------------------------------------
CREATE TABLE public.cuisine_types (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       citext      NOT NULL UNIQUE,
  name       text        NOT NULL,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cuisine_types_slug_chk CHECK (slug ~ '^[a-z0-9_-]{2,40}$'),
  CONSTRAINT cuisine_types_name_chk CHECK (length(btrim(name)) BETWEEN 2 AND 60)
);
COMMENT ON TABLE public.cuisine_types IS 'Tipos de cocina usados para filtrar (MB-01) y para las preferencias del comensal (PU-02).';

CREATE TABLE public.dietary_restrictions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       citext      NOT NULL UNIQUE,
  name       text        NOT NULL,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT dietary_restrictions_slug_chk CHECK (slug ~ '^[a-z0-9_-]{2,40}$'),
  CONSTRAINT dietary_restrictions_name_chk CHECK (length(btrim(name)) BETWEEN 2 AND 60)
);
COMMENT ON TABLE public.dietary_restrictions IS 'Restricciones alimentarias declarables por el comensal (PU-02 Esc. 3).';

INSERT INTO public.cuisine_types (slug, name) VALUES
  ('colombiana','Colombiana'), ('italiana','Italiana'), ('mexicana','Mexicana'),
  ('asiatica','Asiatica'), ('japonesa','Japonesa'), ('hamburguesas','Hamburguesas'),
  ('pizza','Pizza'), ('mariscos','Mariscos'), ('parrilla','Parrilla'),
  ('vegetariana','Vegetariana'), ('postres','Postres'), ('cafe','Cafe')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.dietary_restrictions (slug, name) VALUES
  ('vegetariano','Vegetariano'), ('vegano','Vegano'), ('sin_gluten','Sin gluten'),
  ('sin_lactosa','Sin lactosa'), ('sin_frutos_secos','Sin frutos secos'),
  ('halal','Halal'), ('kosher','Kosher'), ('bajo_en_sodio','Bajo en sodio')
ON CONFLICT (slug) DO NOTHING;

-- Preferencias del comensal (PU-02) y su uso en recomendaciones (PU-03).
CREATE TABLE public.user_preferences (
  user_id         uuid PRIMARY KEY REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  price_range_min smallint,
  price_range_max smallint,
  max_distance_km numeric(5,1),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT user_preferences_price_range_chk CHECK (
    (price_range_min IS NULL AND price_range_max IS NULL)
    OR (price_range_min BETWEEN 1 AND 4 AND price_range_max BETWEEN 1 AND 4 AND price_range_min <= price_range_max)
  ),
  CONSTRAINT user_preferences_distance_chk CHECK (max_distance_km IS NULL OR max_distance_km BETWEEN 0.5 AND 100)
);

CREATE TABLE public.user_cuisine_preferences (
  user_id         uuid NOT NULL REFERENCES public.users(id)         ON UPDATE CASCADE ON DELETE CASCADE,
  cuisine_type_id uuid NOT NULL REFERENCES public.cuisine_types(id) ON UPDATE CASCADE ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, cuisine_type_id)
);

CREATE TABLE public.user_dietary_restrictions (
  user_id                uuid NOT NULL REFERENCES public.users(id)                ON UPDATE CASCADE ON DELETE CASCADE,
  dietary_restriction_id uuid NOT NULL REFERENCES public.dietary_restrictions(id) ON UPDATE CASCADE ON DELETE CASCADE,
  created_at             timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, dietary_restriction_id)
);

-- ---------------------------------------------------------------------------
-- 6. Direcciones del usuario (GP-03, GP-10)
-- ---------------------------------------------------------------------------
CREATE TABLE public.user_addresses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  label        text,
  address_line text        NOT NULL,
  details      text,
  city         text        NOT NULL,
  latitude     double precision,
  longitude    double precision,
  is_default   boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT user_addresses_line_chk  CHECK (length(btrim(address_line)) BETWEEN 5 AND 250),
  CONSTRAINT user_addresses_city_chk  CHECK (length(btrim(city)) BETWEEN 2 AND 120),
  CONSTRAINT user_addresses_label_chk CHECK (label IS NULL OR length(btrim(label)) BETWEEN 2 AND 40),
  CONSTRAINT user_addresses_coords_chk CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
  )
);
CREATE INDEX user_addresses_user_idx ON public.user_addresses (user_id);
CREATE UNIQUE INDEX user_addresses_one_default_idx ON public.user_addresses (user_id) WHERE is_default;

-- ---------------------------------------------------------------------------
-- 7. Ajustes a restaurants / locations / products / schedules
-- ---------------------------------------------------------------------------

-- 7.1 restaurants: datos legales y comision pactada (AE-01, AE-02).
ALTER TABLE public.restaurants
  ADD COLUMN legal_name      text,
  ADD COLUMN tax_id          text,
  ADD COLUMN commission_rate numeric(6,4) NOT NULL DEFAULT 0.1000;

ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_tax_id_chk          CHECK (tax_id IS NULL OR tax_id ~ '^[0-9A-Za-z.-]{5,20}$'),
  ADD CONSTRAINT restaurants_legal_name_chk      CHECK (legal_name IS NULL OR length(btrim(legal_name)) BETWEEN 2 AND 160),
  ADD CONSTRAINT restaurants_commission_rate_chk CHECK (commission_rate >= 0 AND commission_rate <= 1),
  -- Objetivo de las FKs compuestas: nada puede mezclar sedes/productos de
  -- restaurantes distintos.
  ADD CONSTRAINT restaurants_id_key UNIQUE (id);

CREATE UNIQUE INDEX restaurants_tax_id_key ON public.restaurants (tax_id) WHERE tax_id IS NOT NULL;

-- 7.2 locations: geolocalizacion, agregados de calificacion y rango de precio.
ALTER TABLE public.locations
  ALTER COLUMN status SET DEFAULT 'pendiente_aprobacion',
  ADD COLUMN phone        text,
  ADD COLUMN price_range  smallint,
  ADD COLUMN avg_rating   numeric(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN rating_count integer      NOT NULL DEFAULT 0,
  ADD COLUMN geog         geography(Point, 4326);

COMMENT ON COLUMN public.locations.price_range  IS 'Rango de precio 1..4 ($..$$$$) usado por el filtro de MB-01.';
COMMENT ON COLUMN public.locations.avg_rating   IS 'Promedio de location_reviews publicadas. Lo mantiene un trigger (PARCHE-65).';
COMMENT ON COLUMN public.locations.geog         IS 'Punto geografico derivado de latitude/longitude. Lo mantiene un trigger (PARCHE-54).';

ALTER TABLE public.locations
  ADD CONSTRAINT locations_phone_chk        CHECK (phone IS NULL OR phone ~ '^[+]?[0-9 ()-]{7,20}$'),
  ADD CONSTRAINT locations_price_range_chk  CHECK (price_range IS NULL OR price_range BETWEEN 1 AND 4),
  ADD CONSTRAINT locations_avg_rating_chk   CHECK (avg_rating BETWEEN 0 AND 5),
  ADD CONSTRAINT locations_rating_count_chk CHECK (rating_count >= 0),
  ADD CONSTRAINT locations_logo_chk         CHECK (public.is_media_reference(logo_url)),
  ADD CONSTRAINT locations_cover_chk        CHECK (public.is_media_reference(cover_url)),
  ADD CONSTRAINT locations_id_restaurant_key UNIQUE (id, restaurant_id);

-- 7.3 location_images: orden y validacion de la referencia (AN-01 galeria).
ALTER TABLE public.location_images
  ADD COLUMN position smallint NOT NULL DEFAULT 0,
  ADD COLUMN caption  text;

ALTER TABLE public.location_images
  DROP CONSTRAINT IF EXISTS location_images_url_chk;
ALTER TABLE public.location_images
  ADD CONSTRAINT location_images_url_chk     CHECK (public.is_media_reference(url) AND url IS NOT NULL),
  ADD CONSTRAINT location_images_caption_chk CHECK (caption IS NULL OR length(caption) <= 200),
  ADD CONSTRAINT location_images_position_chk CHECK (position BETWEEN 0 AND 100);

-- 7.4 location_schedules: horas reales y sin franjas solapadas (PARCHE-148).
DELETE FROM public.location_schedules a
USING public.location_schedules b
WHERE a.ctid > b.ctid
  AND a.location_id = b.location_id
  AND a.day_of_week = b.day_of_week
  AND a.starts_at < b.ends_at
  AND b.starts_at < a.ends_at;

ALTER TABLE public.location_schedules
  DROP CONSTRAINT IF EXISTS location_schedules_start_format_chk,
  DROP CONSTRAINT IF EXISTS location_schedules_end_format_chk,
  DROP CONSTRAINT IF EXISTS location_schedules_order_chk;

ALTER TABLE public.location_schedules
  ALTER COLUMN starts_at TYPE time USING starts_at::time,
  ALTER COLUMN ends_at   TYPE time USING ends_at::time;

ALTER TABLE public.location_schedules
  ADD CONSTRAINT location_schedules_order_chk CHECK (starts_at < ends_at),
  ADD CONSTRAINT location_schedules_no_overlap EXCLUDE USING gist (
    location_id WITH =,
    day_of_week WITH =,
    public.timerange(starts_at, ends_at) WITH &&
  );

-- 7.5 products: agregados de calificacion y validacion de imagen (RC-02).
ALTER TABLE public.products
  ADD COLUMN avg_rating   numeric(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN rating_count integer      NOT NULL DEFAULT 0;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_image_url_chk;
ALTER TABLE public.products
  ADD CONSTRAINT products_image_url_chk    CHECK (public.is_media_reference(image_url)),
  ADD CONSTRAINT products_avg_rating_chk   CHECK (avg_rating BETWEEN 0 AND 5),
  ADD CONSTRAINT products_rating_count_chk CHECK (rating_count >= 0),
  ADD CONSTRAINT products_id_restaurant_key UNIQUE (id, restaurant_id);

-- 7.6 location_products: disponibilidad y precio por sede (AN-03).
--     La FK compuesta impide asociar un producto a una sede de otro negocio.
CREATE TABLE public.location_products (
  location_id        uuid    NOT NULL,
  product_id         uuid    NOT NULL,
  restaurant_id      uuid    NOT NULL,
  is_available       boolean NOT NULL DEFAULT true,
  price_override     numeric(12,2),
  unavailable_reason text,
  updated_at         timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (location_id, product_id),
  CONSTRAINT location_products_location_fk FOREIGN KEY (location_id, restaurant_id)
    REFERENCES public.locations (id, restaurant_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT location_products_product_fk FOREIGN KEY (product_id, restaurant_id)
    REFERENCES public.products (id, restaurant_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT location_products_price_chk  CHECK (price_override IS NULL OR price_override > 0),
  CONSTRAINT location_products_reason_chk CHECK (
    unavailable_reason IS NULL OR (NOT is_available AND length(btrim(unavailable_reason)) BETWEEN 3 AND 200)
  )
);
COMMENT ON TABLE public.location_products IS 'Disponibilidad y precio del producto en cada sede (AN-03). Sin fila, la sede hereda el estado y precio del catalogo.';

CREATE INDEX location_products_available_idx ON public.location_products (location_id) WHERE is_available;

-- Toda sede activa arranca ofreciendo el catalogo vigente de su restaurante.
INSERT INTO public.location_products (location_id, product_id, restaurant_id, is_available)
SELECT l.id, p.id, p.restaurant_id, p.status = 'activo'
FROM public.locations l
JOIN public.products  p ON p.restaurant_id = l.restaurant_id
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 8. Mesas y codigo QR (AN-05, GP-04)
-- ---------------------------------------------------------------------------
CREATE TYPE public.table_status AS ENUM ('activa', 'inactiva');

CREATE TABLE public.dining_tables (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid        NOT NULL REFERENCES public.locations(id) ON UPDATE CASCADE ON DELETE CASCADE,
  code        text        NOT NULL,
  capacity    smallint    NOT NULL,
  status      public.table_status NOT NULL DEFAULT 'activa',
  qr_token    text        NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT dining_tables_code_key     UNIQUE (location_id, code),
  CONSTRAINT dining_tables_qr_token_key UNIQUE (qr_token),
  CONSTRAINT dining_tables_id_location_key UNIQUE (id, location_id),
  CONSTRAINT dining_tables_code_chk     CHECK (length(btrim(code)) BETWEEN 1 AND 20),
  CONSTRAINT dining_tables_capacity_chk CHECK (capacity > 0 AND capacity <= 50)
);
COMMENT ON TABLE public.dining_tables IS 'Mesas de la sede y su capacidad (AN-05). qr_token identifica la mesa al escanear el QR (GP-04).';

CREATE INDEX dining_tables_location_idx ON public.dining_tables (location_id) WHERE status = 'activa';

-- ---------------------------------------------------------------------------
-- 9. Descuentos (AN-04)
-- ---------------------------------------------------------------------------
CREATE TYPE public.discount_type AS ENUM ('porcentaje', 'monto_fijo');

CREATE TABLE public.discounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid        NOT NULL REFERENCES public.locations(id) ON UPDATE CASCADE ON DELETE CASCADE,
  name        text        NOT NULL,
  description text,
  type        public.discount_type NOT NULL,
  value       numeric(12,2) NOT NULL,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  is_featured boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT discounts_name_chk     CHECK (length(btrim(name)) BETWEEN 2 AND 120),
  CONSTRAINT discounts_desc_chk     CHECK (description IS NULL OR length(description) <= 500),
  CONSTRAINT discounts_period_chk   CHECK (ends_at > starts_at),
  CONSTRAINT discounts_value_chk    CHECK (
    (type = 'porcentaje' AND value > 0 AND value <= 100)
    OR (type = 'monto_fijo' AND value > 0)
  ),
  -- CA 13/14: un descuento inactivo no puede estar destacado.
  CONSTRAINT discounts_featured_chk CHECK (NOT is_featured OR is_active)
);
COMMENT ON TABLE public.discounts IS 'Promociones con vigencia y destacado en el perfil de la sede (AN-04).';

CREATE INDEX discounts_location_period_idx ON public.discounts (location_id, starts_at, ends_at) WHERE is_active;
CREATE INDEX discounts_featured_idx        ON public.discounts (location_id) WHERE is_featured;

CREATE TABLE public.discount_products (
  discount_id uuid NOT NULL REFERENCES public.discounts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES public.products(id)  ON UPDATE CASCADE ON DELETE CASCADE,
  PRIMARY KEY (discount_id, product_id)
);
COMMENT ON TABLE public.discount_products IS 'Alcance del descuento. Sin filas, el descuento aplica a toda la carta de la sede.';

-- ---------------------------------------------------------------------------
-- 10. Reservas (R-01..R-04)
-- ---------------------------------------------------------------------------
CREATE TYPE public.reservation_status AS ENUM (
  'pendiente', 'confirmada', 'cancelada', 'completada', 'no_show'
);

CREATE TABLE public.reservations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id         uuid        NOT NULL REFERENCES public.locations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  diner_id            uuid        NOT NULL REFERENCES public.users(id)     ON UPDATE CASCADE ON DELETE RESTRICT,
  table_id            uuid,
  reserved_for        timestamptz NOT NULL,
  party_size          smallint    NOT NULL,
  status              public.reservation_status NOT NULL DEFAULT 'confirmada',
  notes               text,
  confirmed_at        timestamptz,
  cancelled_at        timestamptz,
  cancelled_by        uuid REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  cancellation_reason text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- La mesa asignada debe pertenecer a la sede de la reserva.
  CONSTRAINT reservations_table_fk FOREIGN KEY (table_id, location_id)
    REFERENCES public.dining_tables (id, location_id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT reservations_party_size_chk CHECK (party_size > 0 AND party_size <= 50),
  CONSTRAINT reservations_notes_chk      CHECK (notes IS NULL OR length(notes) <= 500),
  CONSTRAINT reservations_cancel_chk     CHECK (
    (status <> 'cancelada' AND cancelled_at IS NULL)
    OR (status = 'cancelada' AND cancelled_at IS NOT NULL)
  )
);
COMMENT ON TABLE public.reservations IS 'Reservas del comensal en una sede (R-01..R-04).';

CREATE INDEX reservations_location_when_idx ON public.reservations (location_id, reserved_for);
CREATE INDEX reservations_diner_when_idx    ON public.reservations (diner_id, reserved_for DESC);
CREATE INDEX reservations_status_idx        ON public.reservations (location_id, status, reserved_for);
-- Una mesa no puede tener dos reservas vigentes al mismo instante.
CREATE UNIQUE INDEX reservations_table_slot_idx
  ON public.reservations (table_id, reserved_for)
  WHERE table_id IS NOT NULL AND status IN ('pendiente', 'confirmada');

CREATE TABLE public.reservation_status_history (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reservation_id uuid        NOT NULL REFERENCES public.reservations(id) ON UPDATE CASCADE ON DELETE CASCADE,
  from_status    public.reservation_status,
  to_status      public.reservation_status NOT NULL,
  changed_by     uuid REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reservation_status_history_idx ON public.reservation_status_history (reservation_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 11. Cuentas, pedidos y pagos (GP-01..GP-08)
-- ---------------------------------------------------------------------------
CREATE TYPE public.bill_status          AS ENUM ('abierta', 'parcial', 'conciliada', 'anulada');
CREATE TYPE public.order_fulfillment    AS ENUM ('en_mesa', 'para_llevar', 'domicilio');
CREATE TYPE public.order_status         AS ENUM (
  'borrador', 'pendiente', 'confirmado', 'en_preparacion', 'listo', 'en_camino', 'entregado', 'cancelado'
);
CREATE TYPE public.order_payment_status AS ENUM ('pendiente', 'parcial', 'pagado', 'reembolsado');
CREATE TYPE public.payment_method       AS ENUM (
  'tarjeta_credito', 'tarjeta_debito', 'pse', 'nequi', 'daviplata', 'efectivo', 'puntos'
);
CREATE TYPE public.payment_status       AS ENUM ('pendiente', 'aprobado', 'rechazado', 'reembolsado');

-- Cuenta de mesa: agrupa uno o varios pedidos para dividir el pago (GP-07).
CREATE TABLE public.bills (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid        NOT NULL REFERENCES public.locations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  table_id    uuid,
  status      public.bill_status NOT NULL DEFAULT 'abierta',
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  paid_amount  numeric(12,2) NOT NULL DEFAULT 0,
  opened_at   timestamptz NOT NULL DEFAULT now(),
  closed_at   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bills_table_fk FOREIGN KEY (table_id, location_id)
    REFERENCES public.dining_tables (id, location_id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT bills_amounts_chk CHECK (total_amount >= 0 AND paid_amount >= 0)
);
COMMENT ON TABLE public.bills IS 'Cuenta de una mesa. total_amount y paid_amount los mantiene un trigger (GP-07).';

CREATE INDEX bills_location_open_idx ON public.bills (location_id, opened_at DESC) WHERE status <> 'conciliada';
CREATE UNIQUE INDEX bills_open_per_table_idx ON public.bills (table_id) WHERE table_id IS NOT NULL AND status IN ('abierta', 'parcial');

CREATE SEQUENCE public.orders_order_number_seq AS bigint START 1000;

CREATE TABLE public.orders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number          bigint      NOT NULL DEFAULT nextval('public.orders_order_number_seq') UNIQUE,
  location_id           uuid        NOT NULL,
  restaurant_id         uuid        NOT NULL,
  bill_id               uuid REFERENCES public.bills(id) ON UPDATE CASCADE ON DELETE SET NULL,
  diner_id              uuid REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_by_staff_id   uuid REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  table_id              uuid,
  courier_id            uuid REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  fulfillment           public.order_fulfillment    NOT NULL,
  status                public.order_status         NOT NULL DEFAULT 'borrador',
  payment_status        public.order_payment_status NOT NULL DEFAULT 'pendiente',

  -- Importes. Los calcula un trigger a partir de order_items.
  subtotal              numeric(12,2) NOT NULL DEFAULT 0,
  discount_total        numeric(12,2) NOT NULL DEFAULT 0,
  delivery_fee          numeric(12,2) NOT NULL DEFAULT 0,
  total                 numeric(12,2) NOT NULL DEFAULT 0,
  currency              char(3)       NOT NULL DEFAULT 'COP',

  -- Direccion de entrega: se guarda la referencia y tambien una copia, para
  -- que el pedido conserve a donde se envio aunque el usuario borre la
  -- direccion (GP-03, GP-10).
  delivery_address_id   uuid REFERENCES public.user_addresses(id) ON UPDATE CASCADE ON DELETE SET NULL,
  delivery_address_line text,
  delivery_details      text,
  delivery_city         text,
  delivery_latitude     double precision,
  delivery_longitude    double precision,

  notes                 text,
  placed_at             timestamptz,
  delivered_at          timestamptz,
  cancelled_at          timestamptz,
  cancellation_reason   text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT orders_location_fk FOREIGN KEY (location_id, restaurant_id)
    REFERENCES public.locations (id, restaurant_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT orders_table_fk FOREIGN KEY (table_id, location_id)
    REFERENCES public.dining_tables (id, location_id) ON UPDATE CASCADE ON DELETE SET NULL,

  CONSTRAINT orders_actor_chk    CHECK (diner_id IS NOT NULL OR created_by_staff_id IS NOT NULL),
  CONSTRAINT orders_amounts_chk  CHECK (
    subtotal >= 0 AND discount_total >= 0 AND delivery_fee >= 0 AND total >= 0
    AND discount_total <= subtotal
  ),
  -- GP-03: consumo en mesa exige mesa; domicilio exige direccion.
  CONSTRAINT orders_en_mesa_chk  CHECK (fulfillment <> 'en_mesa' OR table_id IS NOT NULL),
  CONSTRAINT orders_delivery_chk CHECK (
    fulfillment <> 'domicilio'
    OR (delivery_address_line IS NOT NULL AND length(btrim(delivery_address_line)) >= 5 AND delivery_city IS NOT NULL)
  ),
  CONSTRAINT orders_cancel_chk   CHECK (
    (status <> 'cancelado' AND cancelled_at IS NULL) OR (status = 'cancelado' AND cancelled_at IS NOT NULL)
  ),
  CONSTRAINT orders_notes_chk    CHECK (notes IS NULL OR length(notes) <= 500)
);
COMMENT ON TABLE public.orders IS 'Pedido de un comensal en una sede (GP-01..GP-10).';

CREATE INDEX orders_location_status_idx ON public.orders (location_id, status, created_at DESC);
CREATE INDEX orders_diner_idx           ON public.orders (diner_id, created_at DESC);
CREATE INDEX orders_courier_idx         ON public.orders (courier_id, created_at DESC) WHERE courier_id IS NOT NULL;
CREATE INDEX orders_bill_idx            ON public.orders (bill_id) WHERE bill_id IS NOT NULL;
CREATE INDEX orders_table_open_idx      ON public.orders (table_id) WHERE table_id IS NOT NULL AND status <> 'cancelado';
-- AE-01: ventas por restaurante y periodo.
CREATE INDEX orders_restaurant_placed_idx ON public.orders (restaurant_id, placed_at DESC) WHERE placed_at IS NOT NULL;

CREATE TABLE public.order_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     uuid    NOT NULL REFERENCES public.orders(id)   ON UPDATE CASCADE ON DELETE CASCADE,
  product_id   uuid    REFERENCES public.products(id)          ON UPDATE CASCADE ON DELETE SET NULL,
  -- Copia del producto al momento del pedido: editar la carta no debe cambiar
  -- pedidos ya realizados (PARCHE-156).
  product_name text          NOT NULL,
  unit_price   numeric(12,2) NOT NULL,
  quantity     smallint      NOT NULL,
  line_total   numeric(12,2) NOT NULL DEFAULT 0,
  notes        text,
  created_at   timestamptz   NOT NULL DEFAULT now(),
  updated_at   timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT order_items_name_chk     CHECK (length(btrim(product_name)) BETWEEN 1 AND 160),
  CONSTRAINT order_items_price_chk    CHECK (unit_price >= 0),
  CONSTRAINT order_items_quantity_chk CHECK (quantity > 0 AND quantity <= 100),
  CONSTRAINT order_items_notes_chk    CHECK (notes IS NULL OR length(notes) <= 300)
);
CREATE INDEX order_items_order_idx   ON public.order_items (order_id);
CREATE INDEX order_items_product_idx ON public.order_items (product_id) WHERE product_id IS NOT NULL;

CREATE TABLE public.order_status_history (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id    uuid        NOT NULL REFERENCES public.orders(id) ON UPDATE CASCADE ON DELETE CASCADE,
  from_status public.order_status,
  to_status   public.order_status NOT NULL,
  changed_by  uuid REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.order_status_history IS 'Trazabilidad del pedido (GP-08, PARCHE-439). La alimenta un trigger.';
CREATE INDEX order_status_history_idx ON public.order_status_history (order_id, created_at DESC);

-- Pagos: uno por transaccion aprobada o rechazada (GP-06, GP-07).
CREATE TABLE public.payments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id             uuid REFERENCES public.bills(id)  ON UPDATE CASCADE ON DELETE SET NULL,
  order_id            uuid REFERENCES public.orders(id) ON UPDATE CASCADE ON DELETE SET NULL,
  payer_id            uuid REFERENCES public.users(id)  ON UPDATE CASCADE ON DELETE SET NULL,
  method              public.payment_method NOT NULL,
  status              public.payment_status NOT NULL DEFAULT 'pendiente',
  amount              numeric(12,2) NOT NULL,
  currency            char(3)       NOT NULL DEFAULT 'COP',
  provider            text,
  provider_payment_id text,
  -- GP-06 CA6: la clave de idempotencia impide registrar dos veces el mismo pago.
  idempotency_key     text          NOT NULL,
  failure_reason      text,
  authorized_at       timestamptz,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT payments_idempotency_key_key UNIQUE (idempotency_key),
  CONSTRAINT payments_target_chk  CHECK (num_nonnulls(bill_id, order_id) >= 1),
  CONSTRAINT payments_amount_chk  CHECK (amount > 0),
  CONSTRAINT payments_failure_chk CHECK ((status = 'rechazado') = (failure_reason IS NOT NULL)),
  CONSTRAINT payments_auth_chk    CHECK ((status = 'aprobado') = (authorized_at IS NOT NULL))
);
COMMENT ON TABLE public.payments IS 'Transacciones de pago sobre un pedido o sobre una cuenta de mesa (GP-06, GP-07).';

CREATE INDEX payments_bill_idx  ON public.payments (bill_id)  WHERE bill_id IS NOT NULL;
CREATE INDEX payments_order_idx ON public.payments (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX payments_payer_idx ON public.payments (payer_id, created_at DESC) WHERE payer_id IS NOT NULL;
CREATE UNIQUE INDEX payments_provider_ref_idx ON public.payments (provider, provider_payment_id)
  WHERE provider IS NOT NULL AND provider_payment_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 12. Delivery (GP-09, GP-10)
-- ---------------------------------------------------------------------------
CREATE TYPE public.delivery_assignment_status AS ENUM (
  'asignado', 'aceptado', 'rechazado', 'en_camino', 'entregado', 'cancelado'
);

CREATE TABLE public.delivery_assignments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid        NOT NULL REFERENCES public.orders(id) ON UPDATE CASCADE ON DELETE CASCADE,
  courier_id       uuid        NOT NULL REFERENCES public.users(id)  ON UPDATE CASCADE ON DELETE RESTRICT,
  status           public.delivery_assignment_status NOT NULL DEFAULT 'asignado',
  assigned_at      timestamptz NOT NULL DEFAULT now(),
  responded_at     timestamptz,
  picked_up_at     timestamptz,
  delivered_at     timestamptz,
  rejection_reason text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT delivery_assignments_rejection_chk CHECK ((status = 'rechazado') = (rejection_reason IS NOT NULL))
);
COMMENT ON TABLE public.delivery_assignments IS 'Asignaciones de un pedido a repartidores, con rechazos y reasignaciones (GP-09).';

CREATE INDEX delivery_assignments_courier_idx ON public.delivery_assignments (courier_id, assigned_at DESC);
CREATE INDEX delivery_assignments_order_idx   ON public.delivery_assignments (order_id, assigned_at DESC);
-- Un pedido solo puede tener una asignacion vigente a la vez.
CREATE UNIQUE INDEX delivery_assignments_active_idx ON public.delivery_assignments (order_id)
  WHERE status IN ('asignado', 'aceptado', 'en_camino');

-- ---------------------------------------------------------------------------
-- 13. Comisiones (AE-01, AE-02)
-- ---------------------------------------------------------------------------
CREATE TABLE public.commissions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid          NOT NULL UNIQUE REFERENCES public.orders(id) ON UPDATE CASCADE ON DELETE CASCADE,
  restaurant_id     uuid          NOT NULL REFERENCES public.restaurants(id) ON UPDATE CASCADE ON DELETE CASCADE,
  location_id       uuid          NOT NULL REFERENCES public.locations(id)   ON UPDATE CASCADE ON DELETE CASCADE,
  courier_id        uuid REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  gross_amount      numeric(12,2) NOT NULL,
  commission_rate   numeric(6,4)  NOT NULL,
  commission_amount numeric(12,2) NOT NULL,
  courier_payout    numeric(12,2) NOT NULL DEFAULT 0,
  net_amount        numeric(12,2) NOT NULL,
  settled_at        timestamptz,
  created_at        timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT commissions_amounts_chk CHECK (
    gross_amount >= 0 AND commission_amount >= 0 AND courier_payout >= 0 AND net_amount >= 0
    AND commission_rate BETWEEN 0 AND 1
  )
);
COMMENT ON TABLE public.commissions IS 'Liquidacion por pedido: ingreso bruto, comision de la plataforma y neto del afiliado (AE-01, AE-02).';

CREATE INDEX commissions_restaurant_idx ON public.commissions (restaurant_id, created_at DESC);
CREATE INDEX commissions_location_idx   ON public.commissions (location_id, created_at DESC);
CREATE INDEX commissions_courier_idx    ON public.commissions (courier_id, created_at DESC) WHERE courier_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 14. Fidelizacion (PU-05)
-- ---------------------------------------------------------------------------
CREATE TYPE public.loyalty_transaction_type AS ENUM ('acumulacion', 'redencion', 'ajuste', 'expiracion');

-- Tasa de conversion vigente. Los periodos no pueden solaparse.
CREATE TABLE public.loyalty_rates (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  points_per_currency     numeric(12,6) NOT NULL,
  currency_per_point      numeric(12,4) NOT NULL,
  effective_from          timestamptz   NOT NULL DEFAULT now(),
  effective_to            timestamptz,
  created_at              timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT loyalty_rates_values_chk CHECK (points_per_currency > 0 AND currency_per_point > 0),
  CONSTRAINT loyalty_rates_period_chk CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT loyalty_rates_no_overlap EXCLUDE USING gist (
    tstzrange(effective_from, effective_to) WITH &&
  )
);
COMMENT ON COLUMN public.loyalty_rates.points_per_currency IS 'Puntos acreditados por cada unidad monetaria gastada.';
COMMENT ON COLUMN public.loyalty_rates.currency_per_point  IS 'Valor en COP de un punto al redimir (ej. 10 => 100 puntos = $1.000).';

INSERT INTO public.loyalty_rates (points_per_currency, currency_per_point)
VALUES (0.010000, 10.0000);

CREATE TABLE public.loyalty_accounts (
  user_id    uuid PRIMARY KEY REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  balance    integer     NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT loyalty_accounts_balance_chk CHECK (balance >= 0)
);

CREATE TABLE public.loyalty_rewards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES public.locations(id) ON UPDATE CASCADE ON DELETE CASCADE,
  name        text        NOT NULL,
  description text,
  points_cost integer     NOT NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  valid_from  timestamptz,
  valid_to    timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT loyalty_rewards_name_chk   CHECK (length(btrim(name)) BETWEEN 2 AND 120),
  CONSTRAINT loyalty_rewards_points_chk CHECK (points_cost > 0),
  CONSTRAINT loyalty_rewards_period_chk CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to > valid_from)
);
COMMENT ON TABLE public.loyalty_rewards IS 'Beneficios redimibles con puntos. location_id nulo = beneficio de plataforma.';

CREATE TABLE public.loyalty_transactions (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        uuid    NOT NULL REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  type           public.loyalty_transaction_type NOT NULL,
  points         integer NOT NULL,
  balance_after  integer NOT NULL,
  order_id       uuid REFERENCES public.orders(id)          ON UPDATE CASCADE ON DELETE SET NULL,
  reservation_id uuid REFERENCES public.reservations(id)    ON UPDATE CASCADE ON DELETE SET NULL,
  reward_id      uuid REFERENCES public.loyalty_rewards(id) ON UPDATE CASCADE ON DELETE SET NULL,
  description    text,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT loyalty_transactions_points_chk CHECK (
    (type IN ('acumulacion') AND points > 0)
    OR (type IN ('redencion', 'expiracion') AND points < 0)
    OR (type = 'ajuste' AND points <> 0)
  ),
  CONSTRAINT loyalty_transactions_balance_chk CHECK (balance_after >= 0)
);
COMMENT ON TABLE public.loyalty_transactions IS 'Libro mayor de puntos (PU-05). El saldo de loyalty_accounts lo mantiene un trigger.';

CREATE INDEX loyalty_transactions_user_idx ON public.loyalty_transactions (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 15. Calificaciones (RC-01, RC-02)
-- ---------------------------------------------------------------------------
CREATE TYPE public.review_status AS ENUM ('publicada', 'oculta', 'eliminada');

CREATE TABLE public.location_reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid     NOT NULL REFERENCES public.locations(id) ON UPDATE CASCADE ON DELETE CASCADE,
  user_id     uuid     NOT NULL REFERENCES public.users(id)     ON UPDATE CASCADE ON DELETE CASCADE,
  rating      smallint NOT NULL,
  comment     text,
  status      public.review_status NOT NULL DEFAULT 'publicada',
  edited_at   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- PARCHE-107: una sola calificacion por comensal y sede (el POST hace upsert).
  CONSTRAINT location_reviews_user_key UNIQUE (location_id, user_id),
  CONSTRAINT location_reviews_rating_chk  CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT location_reviews_comment_chk CHECK (comment IS NULL OR length(btrim(comment)) BETWEEN 10 AND 500)
);
CREATE INDEX location_reviews_location_idx ON public.location_reviews (location_id, created_at DESC) WHERE status = 'publicada';
CREATE INDEX location_reviews_user_idx     ON public.location_reviews (user_id, created_at DESC);

CREATE TABLE public.product_reviews (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid     NOT NULL REFERENCES public.products(id) ON UPDATE CASCADE ON DELETE CASCADE,
  user_id    uuid     NOT NULL REFERENCES public.users(id)    ON UPDATE CASCADE ON DELETE CASCADE,
  rating     smallint NOT NULL,
  comment    text,
  status     public.review_status NOT NULL DEFAULT 'publicada',
  edited_at  timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- PARCHE-117: una sola calificacion por comensal y producto.
  CONSTRAINT product_reviews_user_key UNIQUE (product_id, user_id),
  CONSTRAINT product_reviews_rating_chk  CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT product_reviews_comment_chk CHECK (comment IS NULL OR length(btrim(comment)) BETWEEN 10 AND 500)
);
CREATE INDEX product_reviews_product_idx ON public.product_reviews (product_id, created_at DESC) WHERE status = 'publicada';
CREATE INDEX product_reviews_user_idx    ON public.product_reviews (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 16. Contenido social (DO-03, DO-04, DO-05) y moderacion (GU-08, GU-09)
-- ---------------------------------------------------------------------------
CREATE TYPE public.post_status AS ENUM ('publicada', 'oculta', 'eliminada');
CREATE TYPE public.media_type  AS ENUM ('imagen', 'video');

CREATE TABLE public.posts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id      uuid        NOT NULL REFERENCES public.users(id)     ON UPDATE CASCADE ON DELETE CASCADE,
  -- DO-04: se puede publicar sin asociar restaurante.
  location_id    uuid REFERENCES public.locations(id) ON UPDATE CASCADE ON DELETE SET NULL,
  caption        text,
  status         public.post_status NOT NULL DEFAULT 'publicada',
  like_count     integer     NOT NULL DEFAULT 0,
  removed_by     uuid REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  removal_reason text,
  removed_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT posts_caption_chk    CHECK (caption IS NULL OR length(caption) <= 1000),
  CONSTRAINT posts_like_count_chk CHECK (like_count >= 0),
  -- GU-08: eliminar contenido exige motivo.
  CONSTRAINT posts_removal_chk    CHECK (
    (status <> 'eliminada' AND removed_at IS NULL AND removal_reason IS NULL)
    OR (status = 'eliminada' AND removed_at IS NOT NULL AND length(btrim(removal_reason)) >= 3)
  )
);
COMMENT ON TABLE public.posts IS 'Publicaciones del feed (DO-03, DO-04) con estado de moderacion (GU-08).';

-- PARCHE-76/77: paginacion por cursor sobre (created_at, id), sin OFFSET.
CREATE INDEX posts_feed_idx     ON public.posts (created_at DESC, id DESC) WHERE status = 'publicada';
CREATE INDEX posts_author_idx   ON public.posts (author_id, created_at DESC);
CREATE INDEX posts_location_idx ON public.posts (location_id, created_at DESC) WHERE location_id IS NOT NULL;

CREATE TABLE public.post_media (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id          uuid    NOT NULL REFERENCES public.posts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  media_type       public.media_type NOT NULL,
  storage_key      text    NOT NULL,
  mime_type        text    NOT NULL,
  size_bytes       bigint  NOT NULL,
  duration_seconds integer,
  width            integer,
  height           integer,
  position         smallint NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT post_media_storage_key_chk CHECK (public.is_media_reference(storage_key) AND storage_key IS NOT NULL),
  CONSTRAINT post_media_mime_chk        CHECK (mime_type ~ '^(image|video)/[a-zA-Z0-9.+-]+$'),
  -- PARCHE-81/85: hasta 50 MB por archivo.
  CONSTRAINT post_media_size_chk        CHECK (size_bytes > 0 AND size_bytes <= 52428800),
  CONSTRAINT post_media_duration_chk    CHECK (
    (media_type = 'video' AND duration_seconds IS NOT NULL AND duration_seconds > 0)
    OR (media_type = 'imagen' AND duration_seconds IS NULL)
  ),
  CONSTRAINT post_media_position_chk    CHECK (position BETWEEN 0 AND 20)
);
COMMENT ON TABLE public.post_media IS 'Metadatos del archivo publicado (PARCHE-89). El binario vive en el bucket de objetos, nunca aqui.';
CREATE INDEX post_media_post_idx ON public.post_media (post_id, position);

CREATE TABLE public.post_likes (
  post_id    uuid NOT NULL REFERENCES public.posts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX post_likes_user_idx ON public.post_likes (user_id, created_at DESC);

-- DO-05: favoritos. La PK compuesta evita duplicados por doble clic (PARCHE-98).
CREATE TABLE public.favorites (
  user_id     uuid NOT NULL REFERENCES public.users(id)     ON UPDATE CASCADE ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON UPDATE CASCADE ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, location_id)
);
CREATE INDEX favorites_location_idx ON public.favorites (location_id);

-- GU-09: reportes de contenido. Se usan tres FKs reales en vez de un puntero
-- polimorfico para no perder integridad referencial.
CREATE TYPE public.report_reason AS ENUM ('spam', 'contenido_falso', 'contenido_ofensivo', 'otro');
CREATE TYPE public.report_status AS ENUM ('pendiente', 'en_revision', 'resuelto', 'descartado');

CREATE TABLE public.content_reports (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id        uuid NOT NULL REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  post_id            uuid REFERENCES public.posts(id)             ON UPDATE CASCADE ON DELETE CASCADE,
  location_review_id uuid REFERENCES public.location_reviews(id)  ON UPDATE CASCADE ON DELETE CASCADE,
  product_review_id  uuid REFERENCES public.product_reviews(id)   ON UPDATE CASCADE ON DELETE CASCADE,
  reason             public.report_reason NOT NULL,
  details            text,
  status             public.report_status NOT NULL DEFAULT 'pendiente',
  resolved_by        uuid REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  resolved_at        timestamptz,
  resolution_note    text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT content_reports_target_chk  CHECK (num_nonnulls(post_id, location_review_id, product_review_id) = 1),
  CONSTRAINT content_reports_details_chk CHECK (details IS NULL OR length(details) <= 500),
  CONSTRAINT content_reports_resolved_chk CHECK (
    (status IN ('pendiente', 'en_revision') AND resolved_at IS NULL)
    OR (status IN ('resuelto', 'descartado') AND resolved_at IS NOT NULL)
  )
);
COMMENT ON TABLE public.content_reports IS 'Cola de moderacion alimentada por los reportes de usuarios (GU-09).';

-- PARCHE-306: un mismo usuario no puede reportar dos veces el mismo contenido.
CREATE UNIQUE INDEX content_reports_post_key   ON public.content_reports (reporter_id, post_id)            WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX content_reports_lreview_key ON public.content_reports (reporter_id, location_review_id) WHERE location_review_id IS NOT NULL;
CREATE UNIQUE INDEX content_reports_preview_key ON public.content_reports (reporter_id, product_review_id)  WHERE product_review_id IS NOT NULL;
CREATE INDEX content_reports_queue_idx ON public.content_reports (status, created_at) WHERE status IN ('pendiente', 'en_revision');

-- ============================================================================
-- Parte 2: automatizacion (triggers), indices de consulta y RLS.
-- Se ejecuta a continuacion de migration.sql.
-- ============================================================================

SET search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 17. updated_at automatico en todas las tablas nuevas
--     Reutiliza public.set_updated_at(), ya presente desde la migracion inicial.
-- ---------------------------------------------------------------------------
DO $do$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'user_profiles', 'restaurant_staff', 'user_preferences', 'user_addresses',
    'location_products', 'dining_tables', 'discounts', 'reservations',
    'bills', 'orders', 'order_items', 'payments', 'delivery_assignments',
    'loyalty_accounts', 'loyalty_rewards', 'location_reviews', 'product_reviews',
    'posts', 'content_reports'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      t || '_set_updated_at', t
    );
  END LOOP;
END
$do$;

-- ---------------------------------------------------------------------------
-- 18. DO-01: punto geografico derivado de latitude/longitude (PARCHE-54)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_location_geog()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $fn$
BEGIN
  IF NEW.latitude IS NULL OR NEW.longitude IS NULL THEN
    NEW.geog := NULL;
  ELSE
    NEW.geog := extensions.st_setsrid(
                  extensions.st_makepoint(NEW.longitude, NEW.latitude), 4326
                )::extensions.geography;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER locations_sync_geog
  BEFORE INSERT OR UPDATE OF latitude, longitude ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.sync_location_geog();

UPDATE public.locations SET latitude = latitude WHERE latitude IS NOT NULL;

-- PARCHE-55: indice espacial para las consultas por cercania.
CREATE INDEX locations_geog_idx ON public.locations USING gist (geog);

-- ---------------------------------------------------------------------------
-- 19. RC-01 / RC-02: promedio de calificacion mantenido por la base
--     (PARCHE-63, 65, 106, 108, 116, 118)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_location_rating()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $fn$
DECLARE
  target uuid := COALESCE(NEW.location_id, OLD.location_id);
BEGIN
  UPDATE public.locations l
  SET avg_rating   = COALESCE(agg.avg_rating, 0),
      rating_count = COALESCE(agg.rating_count, 0)
  FROM (
    SELECT round(avg(rating)::numeric, 2) AS avg_rating, count(*) AS rating_count
    FROM public.location_reviews
    WHERE location_id = target AND status = 'publicada'
  ) agg
  WHERE l.id = target;
  RETURN NULL;
END;
$fn$;

CREATE TRIGGER location_reviews_refresh_rating
  AFTER INSERT OR UPDATE OF rating, status OR DELETE ON public.location_reviews
  FOR EACH ROW EXECUTE FUNCTION public.refresh_location_rating();

CREATE OR REPLACE FUNCTION public.refresh_product_rating()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $fn$
DECLARE
  target uuid := COALESCE(NEW.product_id, OLD.product_id);
BEGIN
  UPDATE public.products p
  SET avg_rating   = COALESCE(agg.avg_rating, 0),
      rating_count = COALESCE(agg.rating_count, 0)
  FROM (
    SELECT round(avg(rating)::numeric, 2) AS avg_rating, count(*) AS rating_count
    FROM public.product_reviews
    WHERE product_id = target AND status = 'publicada'
  ) agg
  WHERE p.id = target;
  RETURN NULL;
END;
$fn$;

CREATE TRIGGER product_reviews_refresh_rating
  AFTER INSERT OR UPDATE OF rating, status OR DELETE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.refresh_product_rating();

-- Marca la fecha de edicion cuando cambia el texto o la nota (RC-01 Esc. edicion).
CREATE OR REPLACE FUNCTION public.touch_review_edited_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $fn$
BEGIN
  IF NEW.rating IS DISTINCT FROM OLD.rating OR NEW.comment IS DISTINCT FROM OLD.comment THEN
    NEW.edited_at := now();
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER location_reviews_touch_edited BEFORE UPDATE ON public.location_reviews
  FOR EACH ROW EXECUTE FUNCTION public.touch_review_edited_at();
CREATE TRIGGER product_reviews_touch_edited  BEFORE UPDATE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.touch_review_edited_at();

-- ---------------------------------------------------------------------------
-- 20. GP-01: totales del pedido calculados a partir de sus items (PARCHE-237)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_order_item_line_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $fn$
BEGIN
  NEW.line_total := NEW.unit_price * NEW.quantity;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER order_items_set_line_total
  BEFORE INSERT OR UPDATE OF unit_price, quantity ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.set_order_item_line_total();

CREATE OR REPLACE FUNCTION public.refresh_order_totals()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $fn$
DECLARE
  target uuid := COALESCE(NEW.order_id, OLD.order_id);
BEGIN
  UPDATE public.orders o
  SET subtotal = COALESCE(agg.subtotal, 0),
      total    = GREATEST(COALESCE(agg.subtotal, 0) - o.discount_total + o.delivery_fee, 0)
  FROM (
    SELECT sum(line_total) AS subtotal
    FROM public.order_items
    WHERE order_id = target
  ) agg
  WHERE o.id = target;
  RETURN NULL;
END;
$fn$;

CREATE TRIGGER order_items_refresh_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.refresh_order_totals();

-- Recalcula el total tambien cuando cambian descuento o domicilio.
CREATE OR REPLACE FUNCTION public.recompute_order_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $fn$
BEGIN
  NEW.total := GREATEST(NEW.subtotal - NEW.discount_total + NEW.delivery_fee, 0);
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER orders_recompute_total
  BEFORE UPDATE OF discount_total, delivery_fee ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.recompute_order_total();

-- ---------------------------------------------------------------------------
-- 21. GP-08 / GP-09: trazabilidad automatica del estado (PARCHE-439)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.order_status_history (order_id, from_status, to_status)
    VALUES (NEW.id, NULL, NEW.status);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.order_status_history (order_id, from_status, to_status)
    VALUES (NEW.id, OLD.status, NEW.status);
  END IF;
  RETURN NULL;
END;
$fn$;

CREATE TRIGGER orders_log_status
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.log_order_status_change();

CREATE OR REPLACE FUNCTION public.log_reservation_status_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.reservation_status_history (reservation_id, from_status, to_status)
    VALUES (NEW.id, NULL, NEW.status);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.reservation_status_history (reservation_id, from_status, to_status)
    VALUES (NEW.id, OLD.status, NEW.status);
  END IF;
  RETURN NULL;
END;
$fn$;

CREATE TRIGGER reservations_log_status
  AFTER INSERT OR UPDATE OF status ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.log_reservation_status_change();

-- ---------------------------------------------------------------------------
-- 22. GP-07: conciliacion de la cuenta a partir de los pagos aprobados
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_bill_settlement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $fn$
DECLARE
  target uuid := COALESCE(NEW.bill_id, OLD.bill_id);
BEGIN
  IF target IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.bills b
  SET paid_amount = COALESCE(pagos.total, 0),
      status = CASE
                 WHEN b.status = 'anulada'                              THEN 'anulada'
                 WHEN b.total_amount > 0
                  AND COALESCE(pagos.total, 0) >= b.total_amount        THEN 'conciliada'
                 WHEN COALESCE(pagos.total, 0) > 0                      THEN 'parcial'
                 ELSE 'abierta'
               END,
      closed_at = CASE
                    WHEN b.total_amount > 0 AND COALESCE(pagos.total, 0) >= b.total_amount
                      THEN COALESCE(b.closed_at, now())
                    ELSE NULL
                  END
  FROM (
    SELECT sum(amount) AS total
    FROM public.payments
    WHERE bill_id = target AND status = 'aprobado'
  ) pagos
  WHERE b.id = target;

  RETURN NULL;
END;
$fn$;

CREATE TRIGGER payments_refresh_bill
  AFTER INSERT OR UPDATE OF status, amount, bill_id OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.refresh_bill_settlement();

-- El total de la cuenta es la suma de los pedidos no cancelados que la componen.
CREATE OR REPLACE FUNCTION public.refresh_bill_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $fn$
DECLARE
  target uuid := COALESCE(NEW.bill_id, OLD.bill_id);
BEGIN
  IF target IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.bills b
  SET total_amount = COALESCE(agg.total, 0)
  FROM (
    SELECT sum(total) AS total
    FROM public.orders
    WHERE bill_id = target AND status <> 'cancelado'
  ) agg
  WHERE b.id = target;

  RETURN NULL;
END;
$fn$;

CREATE TRIGGER orders_refresh_bill_total
  AFTER INSERT OR UPDATE OF total, status, bill_id OR DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.refresh_bill_total();

-- ---------------------------------------------------------------------------
-- 23. PU-05: saldo de puntos derivado del libro mayor
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_loyalty_transaction()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $fn$
DECLARE
  nuevo_saldo integer;
BEGIN
  INSERT INTO public.loyalty_accounts (user_id, balance)
  VALUES (NEW.user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.loyalty_accounts
  SET balance = balance + NEW.points,
      updated_at = now()
  WHERE user_id = NEW.user_id
  RETURNING balance INTO nuevo_saldo;

  -- El CHECK balance >= 0 ya bloquea redimir mas puntos de los disponibles
  -- (PU-05 Esc. 3); aqui solo se deja el saldo resultante en el asiento.
  NEW.balance_after := nuevo_saldo;
  RETURN NEW;
END;
$fn$;

-- Se ejecuta como BEFORE para poder escribir balance_after en la propia fila.
CREATE TRIGGER loyalty_transactions_apply
  BEFORE INSERT ON public.loyalty_transactions
  FOR EACH ROW EXECUTE FUNCTION public.apply_loyalty_transaction();

-- ---------------------------------------------------------------------------
-- 24. DO-03: contador de likes de la publicacion
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_post_like_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $fn$
DECLARE
  target uuid := COALESCE(NEW.post_id, OLD.post_id);
BEGIN
  UPDATE public.posts p
  SET like_count = (SELECT count(*) FROM public.post_likes WHERE post_id = target)
  WHERE p.id = target;
  RETURN NULL;
END;
$fn$;

CREATE TRIGGER post_likes_refresh_count
  AFTER INSERT OR DELETE ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.refresh_post_like_count();

-- ---------------------------------------------------------------------------
-- 25. MB-01 / MB-02 / DO-02: indices de busqueda, filtro y ordenamiento
-- ---------------------------------------------------------------------------

-- PARCHE-42: busqueda parcial por nombre de sede y de producto.
CREATE INDEX locations_name_trgm_idx ON public.locations USING gin (name gin_trgm_ops);
CREATE INDEX products_name_trgm_idx  ON public.products  USING gin (name gin_trgm_ops);

-- PARCHE-28 / PARCHE-61: filtros y orden del listado publico. El indice solo
-- cubre sedes aprobadas, que son las unicas visibles.
CREATE INDEX locations_public_rating_idx
  ON public.locations (avg_rating DESC, rating_count DESC)
  WHERE status = 'activa';

CREATE INDEX locations_public_price_idx
  ON public.locations (price_range, avg_rating DESC)
  WHERE status = 'activa';

-- ---------------------------------------------------------------------------
-- 26. Tipos de cocina por sede (MB-01, PU-03)
-- ---------------------------------------------------------------------------
CREATE TABLE public.location_cuisines (
  location_id     uuid NOT NULL REFERENCES public.locations(id)     ON UPDATE CASCADE ON DELETE CASCADE,
  cuisine_type_id uuid NOT NULL REFERENCES public.cuisine_types(id) ON UPDATE CASCADE ON DELETE CASCADE,
  PRIMARY KEY (location_id, cuisine_type_id)
);
COMMENT ON TABLE public.location_cuisines IS 'Tipos de cocina de cada sede: alimenta el filtro por categoria (MB-01) y las recomendaciones (PU-03).';

CREATE INDEX location_cuisines_cuisine_idx ON public.location_cuisines (cuisine_type_id);

-- ---------------------------------------------------------------------------
-- 27. AE-01 / AE-03: vistas de apoyo para los dashboards
-- ---------------------------------------------------------------------------
CREATE VIEW public.v_location_daily_sales AS
SELECT
  o.restaurant_id,
  o.location_id,
  date_trunc('day', o.placed_at)      AS day,
  count(*)                            AS orders_count,
  sum(o.total)                        AS gross_amount,
  COALESCE(sum(c.commission_amount), 0) AS commission_amount,
  COALESCE(sum(c.net_amount), 0)        AS net_amount
FROM public.orders o
LEFT JOIN public.commissions c ON c.order_id = o.id
WHERE o.placed_at IS NOT NULL
  AND o.status <> 'cancelado'
GROUP BY o.restaurant_id, o.location_id, date_trunc('day', o.placed_at);

COMMENT ON VIEW public.v_location_daily_sales IS 'Ventas y comisiones por sede y dia (AE-01).';

CREATE VIEW public.v_platform_daily_usage AS
SELECT
  d.day,
  (SELECT count(*) FROM public.users u        WHERE date_trunc('day', u.created_at) = d.day) AS new_users,
  (SELECT count(*) FROM public.orders o       WHERE date_trunc('day', o.placed_at)  = d.day) AS orders_count,
  (SELECT count(*) FROM public.reservations r WHERE date_trunc('day', r.created_at) = d.day) AS reservations_count,
  (SELECT count(*) FROM public.posts p        WHERE date_trunc('day', p.created_at) = d.day) AS posts_count
FROM (
  SELECT DISTINCT date_trunc('day', created_at) AS day FROM public.users
  UNION
  SELECT DISTINCT date_trunc('day', created_at) FROM public.orders
) d;

COMMENT ON VIEW public.v_platform_daily_usage IS 'Tendencias diarias de uso de la plataforma (AE-03).';

-- ---------------------------------------------------------------------------
-- 28. RLS: se habilita en las tablas nuevas, sin politicas.
--     El backend se conecta con un rol que la omite; anon/authenticated de
--     Supabase quedan sin acceso directo, que es justo lo que se busca.
-- ---------------------------------------------------------------------------
DO $do$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'user_profiles', 'restaurant_staff', 'audit_logs', 'notifications',
    'cuisine_types', 'dietary_restrictions', 'user_preferences',
    'user_cuisine_preferences', 'user_dietary_restrictions', 'user_addresses',
    'location_products', 'location_cuisines', 'dining_tables', 'discounts',
    'discount_products', 'reservations', 'reservation_status_history',
    'bills', 'orders', 'order_items', 'order_status_history', 'payments',
    'delivery_assignments', 'commissions', 'loyalty_rates', 'loyalty_accounts',
    'loyalty_rewards', 'loyalty_transactions', 'location_reviews',
    'product_reviews', 'posts', 'post_media', 'post_likes', 'favorites',
    'content_reports'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END
$do$;
