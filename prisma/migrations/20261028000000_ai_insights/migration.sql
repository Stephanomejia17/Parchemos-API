-- Insights de IA de los dashboards de restaurante y administrador.
-- La clave unica (user_id, scope, insight_date) impone el limite de una
-- solicitud por usuario, dashboard y dia (hora de Colombia), incluso con
-- peticiones concurrentes.
CREATE TYPE public.insight_scope AS ENUM ('restaurante', 'administrador');
CREATE TYPE public.insight_status AS ENUM ('generando', 'listo');

CREATE TABLE public.ai_insights (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  scope         public.insight_scope NOT NULL,
  insight_date  date NOT NULL,
  status        public.insight_status NOT NULL DEFAULT 'generando',
  range_from    date NOT NULL,
  range_to      date NOT NULL,
  restaurant_id uuid,
  content       jsonb,
  model         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_insights_range_chk CHECK (range_to >= range_from),
  CONSTRAINT ai_insights_content_chk CHECK (status = 'generando' OR content IS NOT NULL)
);
COMMENT ON TABLE public.ai_insights IS 'Insights generados con Claude para los dashboards. Una fila por usuario, dashboard y dia.';

CREATE UNIQUE INDEX ai_insights_user_scope_day_key ON public.ai_insights (user_id, scope, insight_date);

-- Igual que el resto de tablas: RLS activo y sin politicas; solo accede el API.
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;
