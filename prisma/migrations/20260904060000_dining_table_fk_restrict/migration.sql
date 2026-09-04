-- ============================================================================
-- Correccion de las FK compuestas contra dining_tables.
--
-- Estaban declaradas ON DELETE SET NULL sobre (table_id, location_id). En una
-- FK compuesta, Postgres pone NULL en *todas* las columnas, y location_id es
-- NOT NULL: borrar una mesa habria fallado siempre.
--
-- Se cambia a RESTRICT, que ademas es la semantica que pide AN-05: una mesa con
-- historial no se borra, se desactiva (status = 'inactiva') y deja de contar
-- para nuevas reservas sin tocar las ya confirmadas.
-- ============================================================================

ALTER TABLE public.reservations DROP CONSTRAINT reservations_table_fk;
ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_table_fk FOREIGN KEY (table_id, location_id)
  REFERENCES public.dining_tables (id, location_id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.orders DROP CONSTRAINT orders_table_fk;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_table_fk FOREIGN KEY (table_id, location_id)
  REFERENCES public.dining_tables (id, location_id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.bills DROP CONSTRAINT bills_table_fk;
ALTER TABLE public.bills
  ADD CONSTRAINT bills_table_fk FOREIGN KEY (table_id, location_id)
  REFERENCES public.dining_tables (id, location_id)
  ON UPDATE CASCADE ON DELETE RESTRICT;
