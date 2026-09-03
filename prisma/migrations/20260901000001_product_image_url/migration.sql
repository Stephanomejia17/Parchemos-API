ALTER TABLE public.products ADD COLUMN image_url text;
ALTER TABLE public.products ADD CONSTRAINT products_image_url_chk
  CHECK (image_url IS NULL OR length(image_url) BETWEEN 1 AND 2048);
