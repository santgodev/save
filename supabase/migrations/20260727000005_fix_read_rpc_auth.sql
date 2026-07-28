-- =====================================================================
-- 1. Cerrar el hueco de autorizacion en las dos RPC de lectura
-- =====================================================================
-- get_total_savings y get_history_cycles son SECURITY DEFINER (corren con
-- permisos elevados, saltandose RLS) pero aceptaban cualquier p_user_id sin
-- compararlo contra auth.uid(). Cualquier usuario autenticado podia leer el
-- ahorro / historial de otra cuenta pasando su UUID.
--
-- El resto de RPC de dinero (register_income, register_expense,
-- transfer_between_pockets, delete_pocket_safe) ya hacen esta misma
-- validacion. Aqui solo se agrega el guard: la logica de cada funcion queda
-- EXACTAMENTE igual.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_total_savings(p_user_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_total numeric;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(SUM(saved_amount), 0) INTO v_total
  FROM monthly_closures
  WHERE user_id = p_user_id;

  RETURN v_total;
END;
$function$;


CREATE OR REPLACE FUNCTION public.get_history_cycles(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'start_date', c.start_date,
      'end_date', c.end_date,
      'is_active', c.end_date IS NULL,
      'income', COALESCE((SELECT SUM(amount) FROM transactions WHERE cycle_id = c.id AND category = 'Ingreso'), 0),
      'spent', COALESCE((SELECT SUM(ABS(amount)) FROM transactions WHERE cycle_id = c.id AND amount < 0 AND category NOT IN ('Ingreso', 'Traslado') AND COALESCE(metadata->>'type','') NOT IN ('internal_transfer_out','internal_transfer_in')), 0)
    ) ORDER BY c.start_date DESC
  ), '[]'::jsonb)
  INTO v_result
  FROM user_budget_cycles c
  WHERE c.user_id = p_user_id;

  RETURN v_result;
END;
$function$;


-- =====================================================================
-- 2. Borrar de verdad el codigo muerto
-- =====================================================================
-- La migracion 20260727000004 intento borrar confirm_pending_income con las
-- firmas (uuid, uuid), (uuid) y () -- ninguna existe. Al llevar IF EXISTS no
-- fallaron: no hicieron nada en silencio y la funcion sobrevivio.
--
-- La firma real es (p_event_id uuid, p_actual_amount numeric).
--
-- La funcion esta rota de todos modos: inserta las columnas `type` y `status`
-- que no existen en transactions, escribe un date_string con formato ISO que
-- viola el CHECK ^\d{4}-\d{2}-\d{2}$, y marca el evento como 'completed',
-- valor que no esta en el CHECK de pending_income_events. Ningun punto de la
-- app la llama.
-- =====================================================================

DROP FUNCTION IF EXISTS public.confirm_pending_income(uuid, numeric);
