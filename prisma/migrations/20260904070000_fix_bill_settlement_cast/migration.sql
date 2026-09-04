-- ============================================================================
-- Correccion de public.refresh_bill_settlement().
--
-- La funcion corre con search_path vacio, asi que el CASE que asigna el nuevo
-- estado de la cuenta resolvia a `text` y Postgres no lo convertia a
-- public.bill_status. Se castea el resultado del CASE de forma explicita.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.refresh_bill_settlement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $fn$
DECLARE
  target uuid := COALESCE(NEW.bill_id, OLD.bill_id);
BEGIN
  IF target IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.bills b
  SET paid_amount = COALESCE(pagos.total, 0),
      status = (CASE
                  WHEN b.status = 'anulada'                       THEN 'anulada'
                  WHEN b.total_amount > 0
                   AND COALESCE(pagos.total, 0) >= b.total_amount THEN 'conciliada'
                  WHEN COALESCE(pagos.total, 0) > 0               THEN 'parcial'
                  ELSE 'abierta'
                END)::public.bill_status,
      closed_at = CASE
                    WHEN b.total_amount > 0 AND COALESCE(pagos.total, 0) >= b.total_amount
                      THEN COALESCE(b.closed_at, now())
                    ELSE NULL
                  END
  FROM (
    SELECT sum(amount) AS total
    FROM public.payments
    WHERE bill_id = target AND status = 'aprobado'
  ) pagos
  WHERE b.id = target;

  RETURN NULL;
END;
$fn$;
