-- 20260429000002_fix_stale_triggers.sql
--
-- Resuelve el error "record 'new' has no field 'category_id'" que ocurre al
-- registrar gastos. El problema es que el trigger function `tg_transactions_emit_event`
-- (definido en 20260418000005) quedó con referencias a la estructura antigua
-- de la tabla `transactions` tras el cleanup masivo (20260428000004).
--
-- También aprovechamos para limpiar `tg_pockets_emit_event` y asegurar que
-- ambos usen `jsonb_strip_nulls` y no referencien campos inexistentes.

-- 1. Redefinir tg_transactions_emit_event
CREATE OR REPLACE FUNCTION public.tg_transactions_emit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_type text;
  v_payload    jsonb;
  v_user_id    uuid;
BEGIN
  IF tg_op = 'INSERT' THEN
    v_event_type := 'transaction.created';
    v_user_id := NEW.user_id;
    -- Usamos solo columnas que EXISTEN tras la auditoría del 28 de abril.
    -- Evitamos referencias manuales a campos que podrían cambiar;
    -- en su lugar construimos un payload seguro.
    v_payload := jsonb_build_object(
      'transaction_id', NEW.id,
      'amount',         NEW.amount,
      'merchant',       NEW.merchant,
      'category',       NEW.category,
      'type',           CASE WHEN NEW.amount < 0 THEN 'expense' ELSE 'income' END,
      'date_string',    NEW.date_string
    );

  ELSIF tg_op = 'UPDATE' THEN
    v_event_type := 'transaction.updated';
    v_user_id := NEW.user_id;
    v_payload := jsonb_build_object(
      'transaction_id', NEW.id,
      'before', to_jsonb(OLD) - 'user_id',
      'after',  to_jsonb(NEW) - 'user_id'
    );

  ELSIF tg_op = 'DELETE' THEN
    v_event_type := 'transaction.deleted';
    v_user_id := OLD.user_id;
    v_payload := jsonb_build_object(
      'transaction_id', OLD.id,
      'amount',         OLD.amount,
      'merchant',       OLD.merchant,
      'category',       OLD.category
    );
  END IF;

  IF v_event_type IS NOT NULL THEN
    INSERT INTO public.user_events (user_id, event_type, event_data)
    VALUES (v_user_id, v_event_type, v_payload);
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Redefinir tg_pockets_emit_event
CREATE OR REPLACE FUNCTION public.tg_pockets_emit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_type text;
  v_payload    jsonb;
  v_user_id    uuid;
BEGIN
  IF tg_op = 'INSERT' THEN
    v_event_type := 'pocket.created';
    v_user_id := NEW.user_id;
    v_payload := jsonb_build_object(
      'pocket_id', NEW.id,
      'name',      NEW.name,
      'category',  NEW.category,
      'budget',    NEW.budget
    );

  ELSIF tg_op = 'UPDATE' THEN
    v_event_type := 'pocket.updated';
    v_user_id := NEW.user_id;
    -- Solo emitimos si cambió algo relevante (balance o plan) para no saturar.
    IF (OLD.budget IS DISTINCT FROM NEW.budget OR OLD.allocated_budget IS DISTINCT FROM NEW.allocated_budget) THEN
      v_payload := jsonb_build_object(
        'pocket_id', NEW.id,
        'before', jsonb_build_object('budget', OLD.budget, 'allocated', OLD.allocated_budget),
        'after',  jsonb_build_object('budget', NEW.budget, 'allocated', NEW.allocated_budget)
      );
    ELSE
      RETURN NEW;
    END IF;

  ELSIF tg_op = 'DELETE' THEN
    v_event_type := 'pocket.deleted';
    v_user_id := OLD.user_id;
    v_payload := jsonb_build_object(
      'pocket_id', OLD.id,
      'name',      OLD.name
    );
  END IF;

  IF v_event_type IS NOT NULL THEN
    INSERT INTO public.user_events (user_id, event_type, event_data)
    VALUES (v_user_id, v_event_type, v_payload);
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Asegurar que los triggers estén enganchados correctamente.
--    No hace falta re-crear el trigger si el nombre de la función no cambió,
--    pero lo hacemos por seguridad para purgar el cache de ejecución.
DROP TRIGGER IF EXISTS transactions_emit_event ON public.transactions;
CREATE TRIGGER transactions_emit_event
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_transactions_emit_event();

DROP TRIGGER IF EXISTS pockets_emit_event ON public.pockets;
CREATE TRIGGER pockets_emit_event
  AFTER INSERT OR UPDATE OR DELETE ON public.pockets
  FOR EACH ROW EXECUTE FUNCTION public.tg_pockets_emit_event();

COMMENT ON FUNCTION public.tg_transactions_emit_event() IS 
  'Emite eventos de transacciones. Fix category_id stale reference (2026-04-29).';
