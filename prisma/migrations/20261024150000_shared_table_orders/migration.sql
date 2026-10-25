ALTER TABLE public.order_items
  ADD COLUMN contributor_id uuid,
  ADD COLUMN contributor_name text;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_contributor_fk
  FOREIGN KEY (contributor_id) REFERENCES public.users(id) ON DELETE SET NULL;

CREATE TABLE public.shared_table_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES public.dining_tables(id) ON DELETE CASCADE,
  payer_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  order_id uuid UNIQUE REFERENCES public.orders(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'abierto'
    CHECK (status IN ('abierto', 'actualizando', 'confirmando', 'enviado', 'expirado')),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  submitted_at timestamptz(6)
);

CREATE INDEX shared_table_orders_table_status_idx
  ON public.shared_table_orders(table_id, status);

CREATE UNIQUE INDEX shared_table_orders_one_open_per_table_idx
  ON public.shared_table_orders(table_id)
  WHERE status = 'abierto';

CREATE TABLE public.shared_table_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.shared_table_orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  joined_at timestamptz(6) NOT NULL DEFAULT now(),
  contributed_at timestamptz(6),
  CONSTRAINT shared_table_participants_session_user_key UNIQUE (session_id, user_id)
);

CREATE INDEX shared_table_participants_user_idx
  ON public.shared_table_participants(user_id, joined_at DESC);

CREATE TABLE public.shared_table_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.shared_table_orders(id) ON DELETE CASCADE,
  contributor_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name text NOT NULL,
  unit_price numeric(12, 2) NOT NULL CHECK (unit_price >= 0),
  quantity smallint NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT shared_table_order_items_contributor_product_key
    UNIQUE (session_id, contributor_id, product_id)
);

CREATE INDEX shared_table_order_items_session_idx
  ON public.shared_table_order_items(session_id);
