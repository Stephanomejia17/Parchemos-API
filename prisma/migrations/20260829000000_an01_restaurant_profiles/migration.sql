-- AN-01: perfil, horarios, imagenes y autorizacion de establecimientos.
CREATE TYPE public.location_status AS ENUM (
  'pendiente_aprobacion', 'activa', 'rechazada'
);

CREATE TABLE public.restaurants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  business_name varchar(160) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurants_business_name_chk CHECK (length(btrim(business_name)) BETWEEN 2 AND 160)
);
CREATE INDEX restaurants_owner_id_idx ON public.restaurants(owner_id);

CREATE TABLE public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  description varchar(2000) NOT NULL,
  address varchar(250) NOT NULL,
  latitude double precision,
  longitude double precision,
  logo_url text,
  cover_url text,
  status public.location_status NOT NULL DEFAULT 'rechazada',
  rejection_reason varchar(500),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT locations_name_chk CHECK (length(btrim(name)) BETWEEN 2 AND 120),
  CONSTRAINT locations_description_chk CHECK (length(btrim(description)) BETWEEN 20 AND 2000),
  CONSTRAINT locations_address_chk CHECK (length(btrim(address)) BETWEEN 5 AND 250),
  CONSTRAINT locations_coordinates_chk CHECK (
    (latitude IS NULL AND longitude IS NULL) OR
    (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
  ),
  CONSTRAINT locations_rejection_reason_chk CHECK (
    status = 'rechazada' OR rejection_reason IS NULL
  )
);
CREATE INDEX locations_restaurant_id_idx ON public.locations(restaurant_id);
CREATE INDEX locations_status_idx ON public.locations(status);

CREATE TABLE public.location_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL,
  starts_at varchar(5) NOT NULL,
  ends_at varchar(5) NOT NULL,
  CONSTRAINT location_schedules_day_chk CHECK (day_of_week BETWEEN 0 AND 6),
  CONSTRAINT location_schedules_start_format_chk CHECK (starts_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT location_schedules_end_format_chk CHECK (ends_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT location_schedules_order_chk CHECK (starts_at < ends_at)
);
CREATE INDEX location_schedules_location_day_idx ON public.location_schedules(location_id, day_of_week);

CREATE TABLE public.location_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT location_images_url_chk CHECK (length(url) BETWEEN 1 AND 2048)
);
CREATE INDEX location_images_location_id_idx ON public.location_images(location_id);

CREATE TRIGGER restaurants_set_updated_at BEFORE UPDATE ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER locations_set_updated_at BEFORE UPDATE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_images ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.restaurants, public.locations, public.location_schedules, public.location_images FROM anon, authenticated;
