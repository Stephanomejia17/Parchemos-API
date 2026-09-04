-- ============================================================================
-- Ajustes finos sobre el modelo v2.
--  1. orders.restaurant_id gana su propia FK a restaurants, para poder navegar
--     directo del pedido al negocio en los reportes de AE-01/AE-02. La FK
--     compuesta contra locations sigue garantizando la coherencia sede/negocio.
--  2. Se retira restaurants_id_key: era redundante con la clave primaria.
-- ============================================================================

ALTER TABLE public.orders
  ADD CONSTRAINT orders_restaurant_fk
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.restaurants DROP CONSTRAINT IF EXISTS restaurants_id_key;
