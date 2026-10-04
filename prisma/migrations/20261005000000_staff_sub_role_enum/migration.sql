-- Restringe el cargo del personal a las opciones soportadas por la aplicación.
DO $$
BEGIN
  CREATE TYPE public.staff_sub_role AS ENUM ('mesero', 'caja', 'cocinero');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE public.restaurant_staff
  ALTER COLUMN position DROP DEFAULT,
  DROP CONSTRAINT IF EXISTS restaurant_staff_position_chk;

UPDATE public.restaurant_staff
SET position = (CASE lower(btrim(position::text))
  WHEN 'mesero' THEN 'mesero'
  WHEN 'cocinero' THEN 'cocinero'
  ELSE 'caja'
END)::public.staff_sub_role;

ALTER TABLE public.restaurant_staff
  ALTER COLUMN position TYPE public.staff_sub_role
    USING position::text::public.staff_sub_role,
  ALTER COLUMN position SET DEFAULT 'caja'::public.staff_sub_role;
