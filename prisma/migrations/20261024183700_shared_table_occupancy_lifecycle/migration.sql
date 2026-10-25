ALTER TABLE public.shared_table_orders
  DROP CONSTRAINT shared_table_orders_status_check,
  ADD CONSTRAINT shared_table_orders_status_check
    CHECK (status IN ('abierto', 'actualizando', 'confirmando', 'enviado', 'expirado', 'cerrado'));

ALTER TABLE public.orders
  ADD COLUMN table_session_id uuid
    REFERENCES public.shared_table_orders(id) ON DELETE SET NULL;

CREATE INDEX orders_table_session_idx
  ON public.orders(table_session_id)
  WHERE table_session_id IS NOT NULL;
