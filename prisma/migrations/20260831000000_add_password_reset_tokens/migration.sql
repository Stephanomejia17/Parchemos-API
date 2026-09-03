-- Tokens de recuperación de contraseña. Solo se almacena el HMAC.
CREATE TABLE public.password_reset_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  ip_address  inet,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT password_reset_tokens_expiry_chk CHECK (expires_at > created_at),
  CONSTRAINT password_reset_tokens_used_chk CHECK (used_at IS NULL OR used_at >= created_at)
);
CREATE INDEX password_reset_tokens_user_expiry_idx ON public.password_reset_tokens (user_id, expires_at);
CREATE INDEX password_reset_tokens_expiry_idx ON public.password_reset_tokens (expires_at);
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.password_reset_tokens FROM anon, authenticated;
