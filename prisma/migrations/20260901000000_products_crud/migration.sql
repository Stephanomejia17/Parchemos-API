-- CRUD de productos del menú por restaurante.
CREATE TYPE public.product_category AS ENUM (
  'entradas', 'platos_fuertes', 'postres', 'bebidas'
);

CREATE TYPE public.product_status AS ENUM ('activo', 'inactivo');

CREATE TABLE public.products (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  category      public.product_category NOT NULL,
  price         numeric(12, 2) NOT NULL,
  status        public.product_status NOT NULL DEFAULT 'activo',
  featured      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT products_name_chk CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  CONSTRAINT products_description_chk CHECK (description IS NULL OR length(description) <= 2000),
  CONSTRAINT products_price_chk CHECK (price > 0)
);

CREATE UNIQUE INDEX products_restaurant_name_key
  ON public.products (restaurant_id, lower(btrim(name)));
CREATE INDEX products_restaurant_status_idx ON public.products (restaurant_id, status);
CREATE INDEX products_restaurant_category_idx ON public.products (restaurant_id, category);
CREATE INDEX products_restaurant_featured_idx ON public.products (restaurant_id, featured);

CREATE TRIGGER products_set_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.products FROM anon, authenticated;
