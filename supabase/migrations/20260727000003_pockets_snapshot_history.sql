-- Add pockets_snapshot column to user_budget_cycles to make past cycles immutable
ALTER TABLE user_budget_cycles ADD COLUMN pockets_snapshot jsonb;

-- Update close_and_start_new_cycle to save the full snapshot of pockets upon closure
CREATE OR REPLACE FUNCTION public.close_and_start_new_cycle(p_user_id uuid, p_new_cycle_name text DEFAULT NULL::text, p_rollover_mode text DEFAULT 'carry_over'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_current_cycle record;
  v_new_cycle_id uuid;
  v_default_name text;
  v_pocket record;
  v_leftover numeric;
  v_count int;
  v_total_sweep numeric := 0;
  v_pockets_snapshot jsonb;
BEGIN
  IF p_user_id IS NULL THEN 
    p_user_id := auth.uid();
    IF p_user_id IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;
  END IF;

  SELECT * INTO v_current_cycle FROM user_budget_cycles WHERE user_id = p_user_id AND end_date IS NULL ORDER BY start_date DESC LIMIT 1;

  IF v_current_cycle.id IS NOT NULL THEN
    -- TAKE FULL SNAPSHOT OF POCKETS BEFORE ZEROING
    SELECT jsonb_agg(jsonb_build_object(
      'id', id, 
      'name', name,
      'category', category,
      'icon', icon,
      'is_default_free', is_default_free,
      'allocated_budget', allocated_budget, 
      'budget', budget
    ))
    INTO v_pockets_snapshot
    FROM pockets WHERE user_id = p_user_id;

    FOR v_pocket IN SELECT id, category, allocated_budget FROM pockets WHERE user_id = p_user_id LOOP
      SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_leftover
      FROM transactions
      WHERE cycle_id = v_current_cycle.id AND amount < 0 AND category = v_pocket.category
      AND category NOT IN ('Ingreso','Traslado') AND COALESCE(metadata->>'type','') NOT IN ('internal_transfer_out','internal_transfer_in');

      v_leftover := COALESCE(v_pocket.allocated_budget, 0) - v_leftover;
      IF v_leftover < 0 THEN v_leftover := 0; END IF;

      v_total_sweep := v_total_sweep + v_leftover;
      
      -- Barrer todos los bolsillos a 0
      UPDATE pockets SET allocated_budget = 0 WHERE id = v_pocket.id;
    END LOOP;

    -- Registrar el ahorro del mes en monthly_closures en vez de inflar el bolsillo
    INSERT INTO monthly_closures (user_id, year, month, closed_at, saved_amount, pockets_snapshot)
    VALUES (p_user_id, EXTRACT(YEAR FROM now())::int, EXTRACT(MONTH FROM now())::int, now(), v_total_sweep, v_pockets_snapshot);

    UPDATE user_budget_cycles SET end_date = now(), user_closed = true, pockets_snapshot = v_pockets_snapshot WHERE id = v_current_cycle.id;
  END IF;

  IF p_new_cycle_name IS NULL THEN
    v_default_name := (ARRAY['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'])[EXTRACT(MONTH FROM now())::int] || ' ' || EXTRACT(YEAR FROM now())::int;
    SELECT count(*) INTO v_count FROM user_budget_cycles WHERE user_id = p_user_id AND name LIKE v_default_name || '%';
    IF v_count > 0 THEN
      v_default_name := v_default_name || ' #' || (v_count + 1);
    END IF;
  ELSE
    v_default_name := p_new_cycle_name;
  END IF;

  INSERT INTO user_budget_cycles (user_id, name, start_date, end_date) VALUES (p_user_id, v_default_name, now(), NULL) RETURNING id INTO v_new_cycle_id;
  RETURN v_new_cycle_id;
END;
$function$;

-- Update get_cycle_state to render past cycles using the static snapshot
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
  -- SI EL CICLO ESTA CERRADO Y TIENE FOTO, LEEMOS DE LA FOTO PARA INMUTABILIDAD HISTORICA
  SELECT
    jsonb_agg(
      jsonb_build_object(
        'id', p.id, 'name', p.name, 'category', p.category, 'icon', p.icon, 'is_default_free', COALESCE(p.is_default_free, false),
        'allocated', p.allocated_budget, 'available', p.allocated_budget - COALESCE(s.spent_month, 0),
        'spent_month', COALESCE(s.spent_month, 0),
        'pct_used', CASE WHEN p.allocated_budget > 0 THEN ROUND((COALESCE(s.spent_month,0) / p.allocated_budget * 100)::numeric, 2) ELSE NULL END
      ) ORDER BY p.allocated_budget DESC
    ),
    SUM(p.allocated_budget), SUM(p.allocated_budget - COALESCE(s.spent_month, 0))
  INTO v_pockets, v_alloc_total, v_avail_total
  FROM (
    SELECT id, name, category, icon, is_default_free, allocated_budget, budget
    FROM pockets WHERE user_id = v_user_id AND (v_cycle.end_date IS NULL OR v_cycle.pockets_snapshot IS NULL)
    UNION ALL
    SELECT 
      (value->>'id')::uuid as id,
      value->>'name' as name,
      value->>'category' as category,
      value->>'icon' as icon,
      (value->>'is_default_free')::boolean as is_default_free,
      (value->>'allocated_budget')::numeric as allocated_budget,
      (value->>'budget')::numeric as budget
    FROM jsonb_array_elements(v_cycle.pockets_snapshot)
    WHERE v_cycle.end_date IS NOT NULL AND v_cycle.pockets_snapshot IS NOT NULL
  ) p 
  LEFT JOIN spent_by_cat s ON s.category = p.category;

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
      CASE WHEN v_has_prev_cycle THEN
        jsonb_build_object('id', v_prev_cycle.id, 'name', v_prev_cycle.name, 'income', v_prev_income, 'spent', v_prev_spent, 'net', v_prev_income - v_prev_spent)
      ELSE NULL END,
    'prev_month_closed', COALESCE(v_prev_cycle.user_closed, true)
  );
END;
$function$;
