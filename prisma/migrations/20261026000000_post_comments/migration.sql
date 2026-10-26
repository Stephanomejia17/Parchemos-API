-- Comentarios de las publicaciones del feed (PARCHE-4 / DO-04 + DO-03).
-- Los likes ya existen (post_likes + trigger que mantiene posts.like_count).
CREATE TABLE public.post_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES public.posts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_comments_body_chk CHECK (length(btrim(body)) BETWEEN 1 AND 500)
);
COMMENT ON TABLE public.post_comments IS 'Comentarios de una publicacion. Se borran con ella; el autor del comentario o de la publicacion puede retirarlos.';

-- Paginacion por cursor (created_at, id) de la mas reciente a la mas antigua, sin OFFSET.
CREATE INDEX post_comments_post_idx   ON public.post_comments (post_id, created_at DESC, id DESC);
CREATE INDEX post_comments_author_idx ON public.post_comments (author_id);

-- Igual que el resto de tablas: RLS activo y sin politicas; solo accede el API.
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
