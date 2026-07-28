-- 1. Ensure close_and_start_new_cycle uses the cycle's start_date for monthly_closures
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

    -- Registrar el ahorro del mes en monthly_closures
    -- FIX: Extraer el año y el mes de la fecha de INICIO del ciclo que estamos cerrando, no de 'now()'.
    INSERT INTO monthly_closures (user_id, year, month, closed_at, saved_amount, pockets_snapshot)
    VALUES (p_user_id, EXTRACT(YEAR FROM v_current_cycle.start_date)::int, EXTRACT(MONTH FROM v_current_cycle.start_date)::int, now(), v_total_sweep, v_pockets_snapshot);

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

-- 2. Evitar multiples ciclos abiertos
CREATE UNIQUE INDEX IF NOT EXISTS one_active_cycle_per_user 
ON user_budget_cycles (user_id) 
WHERE end_date IS NULL;

-- 3. Borrar código muerto
DROP FUNCTION IF EXISTS confirm_pending_income(uuid, uuid);
DROP FUNCTION IF EXISTS confirm_pending_income(uuid);
DROP FUNCTION IF EXISTS confirm_pending_income();

-- 4. Crear RPC para leer el ahorro total (opcional, pero útil para HistoryScreen)
CREATE OR REPLACE FUNCTION public.get_total_savings(p_user_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_total numeric;
BEGIN
  SELECT COALESCE(SUM(saved_amount), 0) INTO v_total
  FROM monthly_closures
  WHERE user_id = p_user_id;
  
  RETURN v_total;
END;
$function$;
