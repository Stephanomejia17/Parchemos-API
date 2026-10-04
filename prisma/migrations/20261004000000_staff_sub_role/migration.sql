-- GU-05: permite identificar la funcion del personal dentro de una sede.
-- Los registros existentes reciben un cargo neutro por defecto.
UPDATE public.restaurant_staff
SET position = 'Caja'
WHERE position IS NULL;

ALTER TABLE public.restaurant_staff
  ALTER COLUMN position SET DEFAULT 'Caja',
  ALTER COLUMN position SET NOT NULL;
