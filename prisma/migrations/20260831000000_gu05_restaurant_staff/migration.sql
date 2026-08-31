-- GU-05: el diagrama de dominio establece USUARIO.sede_id solo para personal.
ALTER TABLE public.users ADD COLUMN sede_id uuid REFERENCES public.locations(id) ON DELETE RESTRICT;
CREATE INDEX users_sede_id_idx ON public.users(sede_id);
ALTER TABLE public.users ADD CONSTRAINT users_personal_location_chk CHECK (
  (role = 'personal_restaurante' AND sede_id IS NOT NULL) OR
  (role <> 'personal_restaurante' AND sede_id IS NULL)
);
