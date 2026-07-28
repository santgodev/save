-- =====================================================================
-- Fix: quedó UNA instancia sin arreglar de la trampa "record IS NOT NULL"
-- =====================================================================
-- La migración 20260726000003 arregló get_cycle_state línea ~102
-- (IF FOUND THEN para v_prev_income/v_prev_spent) pero se saltó una
-- SEGUNDA aparición del mismo patrón, 30 líneas más abajo, en el mismo
-- SELECT de v_prev_cycle: el `CASE WHEN v_prev_cycle IS NOT NULL THEN`
-- que arma el campo `previous_month` del JSON de respuesta.
--
-- No se puede arreglar con otro `IF FOUND THEN` en ese punto -- `FOUND`
-- ya fue pisado por las consultas de v_prev_income/v_prev_spent (y las
-- de pockets/top_merchants) que corren en el medio. Hace falta capturar
-- el resultado en una variable propia justo después del SELECT original
-- y usar esa variable, no releer FOUND ni comparar el record contra NULL.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_cycle_state(p_cycle_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
  v_cycle record;
  v_income numeric;
  v_spent numeric;
  v_alloc_total numeric;
  v_avail_total numeric;
  v_pockets jsonb;
  v_top_merch jsonb;
  v_prev_cycle record;
  v_has_prev_cycle boolean := false;
  v_prev_income numeric := 0;
  v_prev_spent numeric := 0;
BEGIN
  SELECT * INTO v_cycle FROM user_budget_cycles WHERE id = p_cycle_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Ciclo no encontrado o no autorizado'; END IF;
  v_user_id := v_cycle.user_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_income FROM transactions WHERE cycle_id = p_cycle_id AND category = 'Ingreso';

  SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_spent FROM transactions
  WHERE cycle_id = p_cycle_id AND amount < 0 AND category NOT IN ('Ingreso','Traslado') AND COALESCE(metadata->>'type','') NOT IN ('internal_transfer_out','internal_transfer_in');

  SELECT * INTO v_prev_cycle FROM user_budget_cycles
  WHERE user_id = v_user_id AND end_date <= v_cycle.start_date AND id != p_cycle_id ORDER BY end_date DESC LIMIT 1;

  -- FIX: capturamos el resultado real de ESTE SELECT en una variable
  -- propia, antes de que cualquier otro SELECT/UPDATE de más abajo pise
  -- el valor de FOUND.
  v_has_prev_cycle := FOUND;

  IF v_has_prev_cycle THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_prev_income FROM transactions WHERE cycle_id = v_prev_cycle.id AND category = 'Ingreso';
    SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_prev_spent FROM transactions
    WHERE cycle_id = v_prev_cycle.id AND amount < 0 AND category NOT IN ('Ingreso','Traslado') AND COALESCE(metadata->>'type','') NOT IN ('internal_transfer_out','internal_transfer_in');
  END IF;

  WITH spent_by_cat AS (
    SELECT category, SUM(ABS(amount)) AS spent_month FROM transactions
    WHERE cycle_id = p_cycle_id AND amount < 0 AND category NOT IN ('Ingreso','Traslado') AND COALESCE(metadata->>'type','') NOT IN ('internal_transfer_out','internal_transfer_in') GROUP BY category
  )
  SELECT jsonb_agg(
      jsonb_build_object(
        'id', p.id, 'name', p.name, 'category', p.category, 'icon', p.icon, 'is_default_free', p.is_default_free,
        'allocated', p.allocated_budget, 'available', p.allocated_budget - COALESCE(s.spent_month, 0),
        'spent_month', COALESCE(s.spent_month, 0),
        'pct_used', CASE WHEN p.allocated_budget > 0 THEN ROUND((COALESCE(s.spent_month,0) / p.allocated_budget * 100)::numeric, 2) ELSE NULL END
      ) ORDER BY p.allocated_budget DESC
    ),
    SUM(p.allocated_budget), SUM(p.allocated_budget - COALESCE(s.spent_month, 0))
  INTO v_pockets, v_alloc_total, v_avail_total
  FROM pockets p LEFT JOIN spent_by_cat s ON s.category = p.category WHERE p.user_id = v_user_id;

  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'total')::numeric DESC), '[]'::jsonb) INTO v_top_merch
  FROM (
    SELECT jsonb_build_object('merchant', canonical_merchant, 'display', MIN(merchant), 'total', SUM(ABS(amount)), 'count', COUNT(*)) AS t
    FROM transactions WHERE cycle_id = p_cycle_id AND amount < 0 AND category NOT IN ('Ingreso','Traslado') AND COALESCE(metadata->>'type','') NOT IN ('internal_transfer_out','internal_transfer_in') AND canonical_merchant IS NOT NULL
    GROUP BY canonical_merchant ORDER BY SUM(ABS(amount)) DESC LIMIT 5
  ) sub;

  RETURN jsonb_build_object(
    'cycle_id', v_cycle.id, 'cycle_name', v_cycle.name, 'start_date', v_cycle.start_date, 'end_date', v_cycle.end_date, 'is_active', v_cycle.end_date IS NULL,
    'income_month', v_income, 'spent_month', v_spent, 'net_month', v_income - v_spent, 'allocated_total', COALESCE(v_alloc_total, 0), 'available_total', COALESCE(v_avail_total, 0),
    'pockets', COALESCE(v_pockets, '[]'::jsonb), 'top_merchants', v_top_merch, 'previous_month',
      -- FIX: v_has_prev_cycle (variable propia) en vez de "v_prev_cycle IS NOT NULL"
      CASE WHEN v_has_prev_cycle THEN
        jsonb_build_object('id', v_prev_cycle.id, 'name', v_prev_cycle.name, 'income', v_prev_income, 'spent', v_prev_spent, 'net', v_prev_income - v_prev_spent)
      ELSE NULL END,
    'prev_month_closed', COALESCE(v_prev_cycle.user_closed, true)
  );
END;
$function$
;
