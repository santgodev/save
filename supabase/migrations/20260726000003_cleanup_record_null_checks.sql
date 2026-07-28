-- =====================================================================
-- Refactor: limpieza de comprobaciones `record IS NULL` y `IS NOT NULL`
-- =====================================================================
-- Como se descubrió en la migración 20260726000002, evaluar variables de
-- tipo `record` contra NULL (`IS NULL` o `IS NOT NULL`) en PL/pgSQL es
-- extremadamente frágil, ya que la evaluación de un `record IS NOT NULL`
-- falla si CUALQUIER columna del registro es NULL.
--
-- Aunque la nota anterior sugería que funciones como `get_cycle_state` y
-- `execute_cycle_closure` no eran vulnerables porque el WHERE no forzaba
-- un NULL explícito, ¡SÍ son vulnerables a la presencia de datos NULL
-- intrínsecos! Por ejemplo, si una fila de `user_budget_cycles` antigua
-- tiene `user_closed = NULL` o `created_at = NULL`, la evaluación
-- `IF v_prev_cycle IS NOT NULL` fallaría silenciosamente y la UI no
-- mostraría los datos del mes anterior.
--
-- FIX: Reemplazar de raíz estas evaluaciones frágiles usando `IF FOUND` 
-- o `IF NOT FOUND`, que chequean el éxito de la consulta `SELECT INTO` 
-- de manera segura sin importar el contenido de las columnas.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.execute_cycle_closure(p_user_id uuid, p_cycle_id uuid, p_sweeps jsonb DEFAULT NULL::jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cycle record;
  v_libre_id uuid;
  v_key text;
  v_amount numeric;
BEGIN
  -- Verificar ciclo
  SELECT * INTO v_cycle FROM user_budget_cycles WHERE id = p_cycle_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ciclo no encontrado';
  END IF;

  -- FIX: idempotencia
  IF v_cycle.user_closed THEN
    RETURN true;
  END IF;

  -- Realizar barrido a libre si es necesario
  IF p_sweeps IS NOT NULL THEN
    SELECT id INTO v_libre_id FROM pockets WHERE user_id = p_user_id AND is_default_free = true LIMIT 1;
    IF v_libre_id IS NULL THEN
      RAISE EXCEPTION 'Bolsillo Libre no encontrado';
    END IF;

    FOR v_key IN SELECT jsonb_object_keys(p_sweeps) LOOP
      v_amount := (p_sweeps->>v_key)::numeric;
      IF v_amount > 0 THEN
        -- Restar del bolsillo original
        UPDATE pockets SET allocated_budget = allocated_budget - v_amount WHERE id = v_key::uuid AND user_id = p_user_id;
        -- Sumar al bolsillo libre
        UPDATE pockets SET allocated_budget = allocated_budget + v_amount WHERE id = v_libre_id;
      END IF;
    END LOOP;
  END IF;

  -- Marcar ciclo como cerrado
  UPDATE user_budget_cycles SET user_closed = true WHERE id = p_cycle_id;

  RETURN true;
END;
$function$
;

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

  IF FOUND THEN
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
      CASE WHEN v_prev_cycle IS NOT NULL THEN
        jsonb_build_object('id', v_prev_cycle.id, 'name', v_prev_cycle.name, 'income', v_prev_income, 'spent', v_prev_spent, 'net', v_prev_income - v_prev_spent)
      ELSE NULL END,
    'prev_month_closed', COALESCE(v_prev_cycle.user_closed, true)
  );
END;
$function$
;
