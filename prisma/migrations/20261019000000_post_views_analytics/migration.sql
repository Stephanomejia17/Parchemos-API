CREATE TABLE public.post_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  view_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Bogota')::date),
  CONSTRAINT post_views_post_user_day_key UNIQUE (post_id, user_id, view_date)
);

CREATE INDEX post_views_post_date_idx ON public.post_views (post_id, viewed_at DESC);
ALTER TABLE public.post_views ENABLE ROW LEVEL SECURITY;
