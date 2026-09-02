ALTER TABLE public.users
  ADD COLUMN profile_photo_url text,
  ADD COLUMN city text,
  ADD COLUMN deletion_requested_at timestamptz,
  ADD COLUMN deletion_effective_at timestamptz;