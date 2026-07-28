ALTER TABLE public.monthly_closures ADD COLUMN IF NOT EXISTS pockets_snapshot JSONB;

-- Update close_and_start_new_cycle
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
    -- TAKE SNAPSHOT OF POCKETS BEFORE ZEROING
    SELECT jsonb_agg(jsonb_build_object('id', id, 'allocated_budget', allocated_budget, 'budget', budget))
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

    UPDATE user_budget_cycles SET end_date = now(), user_closed = true WHERE user_id = p_user_id AND end_date IS NULL;
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

-- Update delete_transaction_with_reversal
CREATE OR REPLACE FUNCTION public.delete_transaction_with_reversal(p_tx_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_amount    NUMERIC;
  v_category  TEXT;
  v_pocket_id UUID;
  v_metadata  JSONB;
  v_type      TEXT;
  v_key       TEXT;
  v_sub_amt   NUMERIC;
  v_cycle_id  UUID;
  v_tx_count  INT;
  v_prev_cycle UUID;
  v_snapshot  JSONB;
  v_snap_item JSONB;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  SELECT amount, category, metadata, cycle_id
  INTO v_amount, v_category, v_metadata, v_cycle_id
  FROM transactions
  WHERE id = p_tx_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transacción no encontrada' USING ERRCODE = '42501';
  END IF;

  v_type := v_metadata ->> 'type';

  IF v_category = 'Ingreso' THEN
    IF v_metadata ? 'distribution' THEN
      FOR v_key IN SELECT key FROM jsonb_each_text(v_metadata->'distribution') ORDER BY key
      LOOP
        v_sub_amt := (v_metadata->'distribution'->>v_key)::NUMERIC;
        IF v_sub_amt IS NOT NULL AND v_sub_amt > 0 THEN
          UPDATE pockets 
          SET budget = budget - v_sub_amt, allocated_budget = allocated_budget - v_sub_amt
          WHERE id = v_key::UUID AND user_id = p_user_id;
        END IF;
      END LOOP;
    END IF;
  ELSIF v_type IS DISTINCT FROM 'internal_transfer_out' AND v_type IS DISTINCT FROM 'internal_transfer_in' THEN
    SELECT id INTO v_pocket_id
    FROM pockets
    WHERE user_id = p_user_id AND category = v_category
    LIMIT 1;

    IF v_pocket_id IS NULL THEN
      SELECT id INTO v_pocket_id
      FROM pockets
      WHERE user_id = p_user_id AND category = 'Otros'
      LIMIT 1;
    END IF;

    IF v_pocket_id IS NOT NULL THEN
      UPDATE pockets
      SET budget = budget - v_amount -- amount es negativo, resta de un negativo suma
      WHERE id = v_pocket_id;
    END IF;
  END IF;

  -- 1. DELETE TRANSACTION
  DELETE FROM transactions WHERE id = p_tx_id;

  -- 2. CYCLE UNDO LOGIC
  IF v_category = 'Ingreso' THEN
    -- Check if it was the ONLY transaction in this cycle
    SELECT count(*) INTO v_tx_count FROM transactions WHERE cycle_id = v_cycle_id;
    IF v_tx_count = 0 THEN
      -- Delete the empty cycle
      DELETE FROM user_budget_cycles WHERE id = v_cycle_id AND user_id = p_user_id;
      
      -- Find previous closed cycle
      SELECT id INTO v_prev_cycle 
      FROM user_budget_cycles 
      WHERE user_id = p_user_id AND user_closed = true 
      ORDER BY start_date DESC LIMIT 1;
      
      IF v_prev_cycle IS NOT NULL THEN
        -- Reopen it
        UPDATE user_budget_cycles SET end_date = NULL, user_closed = false WHERE id = v_prev_cycle;
        
        -- Restore pocket snapshot if available
        SELECT pockets_snapshot INTO v_snapshot 
        FROM monthly_closures 
        WHERE user_id = p_user_id 
        ORDER BY closed_at DESC LIMIT 1;
        
        IF v_snapshot IS NOT NULL THEN
          FOR v_snap_item IN SELECT * FROM jsonb_array_elements(v_snapshot)
          LOOP
            UPDATE pockets 
            SET allocated_budget = COALESCE((v_snap_item->>'allocated_budget')::NUMERIC, 0),
                budget = COALESCE((v_snap_item->>'budget')::NUMERIC, 0)
            WHERE id = (v_snap_item->>'id')::UUID;
          END LOOP;
        END IF;
        
        -- Delete the closure record
        DELETE FROM monthly_closures 
        WHERE id = (SELECT id FROM monthly_closures WHERE user_id = p_user_id ORDER BY closed_at DESC LIMIT 1);
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'reversed_amount', v_amount);
END;
$function$;
