-- 1. register_expense
CREATE OR REPLACE FUNCTION public.register_expense(p_user_id uuid, p_merchant text, p_amount numeric, p_category text, p_icon text DEFAULT NULL::text, p_date_string text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_pocket_id     UUID;
  v_effective_cat TEXT;
  v_tx_id         UUID;
  v_today         TEXT;
  v_cycle_id      UUID;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No autorizado'
      USING ERRCODE = '42501';
  END IF;

  p_amount := ROUND(p_amount, 2);

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser positivo (recibido: %)', p_amount
      USING ERRCODE = '22023';
  END IF;

  IF p_merchant IS NULL OR btrim(p_merchant) = '' THEN
    RAISE EXCEPTION 'El nombre del comercio no puede estar vacío'
      USING ERRCODE = '22023';
  END IF;

  IF p_category IS NULL OR btrim(p_category) = '' THEN
    RAISE EXCEPTION 'La categoría no puede estar vacía'
      USING ERRCODE = '22023';
  END IF;

  v_today         := COALESCE(p_date_string, to_char(NOW(), 'YYYY-MM-DD'));
  v_effective_cat := p_category;

  SELECT id
  INTO v_pocket_id
  FROM pockets
  WHERE user_id = p_user_id AND category = p_category
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_pocket_id IS NULL THEN
    SELECT id
    INTO v_pocket_id
    FROM pockets
    WHERE user_id = p_user_id AND category = 'Otros'
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_pocket_id IS NOT NULL THEN
      v_effective_cat := 'Otros';
    ELSE
      RAISE EXCEPTION 'No existe bolsillo para "%" ni para "Otros".', p_category
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT id INTO v_cycle_id FROM user_budget_cycles WHERE user_id = p_user_id AND end_date IS NULL LIMIT 1;
  IF v_cycle_id IS NULL THEN
    v_cycle_id := close_and_start_new_cycle(p_user_id);
  END IF;

  INSERT INTO transactions (user_id, merchant, amount, category, icon, date_string, metadata, cycle_id)
  VALUES (
    p_user_id,
    btrim(p_merchant),
    -ABS(p_amount),
    v_effective_cat,
    p_icon,
    v_today,
    p_metadata || jsonb_build_object('requested_category', p_category),
    v_cycle_id
  )
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'pocket_id', v_pocket_id,
    'effective_category', v_effective_cat,
    'new_pocket_budget', 0,
    'cycle_id', v_cycle_id
  );
END;
$function$;

-- 2. delete_transaction_with_reversal
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
  v_cycle_reverted BOOLEAN := false;
  v_cycle_deleted BOOLEAN := false;
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
          SET allocated_budget = allocated_budget - v_sub_amt
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
    -- No actualizamos la tabla pockets aquí para gastos (antes se descontaba budget)
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
      v_cycle_deleted := true;
      
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
            SET allocated_budget = COALESCE((v_snap_item->>'allocated_budget')::NUMERIC, 0)
            WHERE id = (v_snap_item->>'id')::UUID;
          END LOOP;
        END IF;
        
        -- Delete the closure record
        DELETE FROM monthly_closures 
        WHERE id = (SELECT id FROM monthly_closures WHERE user_id = p_user_id ORDER BY closed_at DESC LIMIT 1);
        
        v_cycle_reverted := true;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'reversed_amount', v_amount, 'cycle_deleted', v_cycle_deleted, 'cycle_reverted', v_cycle_reverted);
END;
$function$;

-- 3. close_and_start_new_cycle
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
    -- TAKE FULL SNAPSHOT OF POCKETS BEFORE ZEROING (without budget)
    SELECT jsonb_agg(jsonb_build_object(
      'id', id, 
      'name', name,
      'category', category,
      'icon', icon,
      'is_default_free', is_default_free,
      'allocated_budget', allocated_budget
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

-- 4. get_cycle_state
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
    SELECT id, name, category, icon, is_default_free, allocated_budget
    FROM pockets WHERE user_id = v_user_id AND (v_cycle.end_date IS NULL OR v_cycle.pockets_snapshot IS NULL)
    UNION ALL
    SELECT 
      (value->>'id')::uuid as id,
      value->>'name' as name,
      value->>'category' as category,
      value->>'icon' as icon,
      (value->>'is_default_free')::boolean as is_default_free,
      (value->>'allocated_budget')::numeric as allocated_budget
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

-- 5. tg_pockets_emit_event
CREATE OR REPLACE FUNCTION public.tg_pockets_emit_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid;
  v_type text;
  v_data jsonb;
begin
  if tg_op = 'INSERT' then
    v_user := new.user_id;
    v_type := 'pocket.created';
    v_data := jsonb_build_object(
      'pocket_id', new.id,
      'name',      new.name,
      'category',  new.category
    );
  elsif tg_op = 'UPDATE' then
    v_user := new.user_id;
    v_type := 'pocket.updated';
    v_data := jsonb_build_object(
      'pocket_id', new.id,
      'before', to_jsonb(old) - 'user_id' - 'budget',
      'after',  to_jsonb(new) - 'user_id' - 'budget'
    );
  else
    v_user := old.user_id;
    v_type := 'pocket.deleted';
    v_data := jsonb_build_object('pocket_id', old.id, 'name', old.name);
  end if;

  perform public.emit_user_event(v_user, v_type, v_data);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

-- 6. get_monthly_state
CREATE OR REPLACE FUNCTION public.get_monthly_state(p_user_id uuid, p_year integer DEFAULT NULL::integer, p_month integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_year         int;
  v_month        int;
  v_month_start  date;
  v_month_end    date;
  v_prev_start   date;
  v_prev_end     date;
  v_prev_year    int;
  v_prev_month   int;
  v_income       numeric;
  v_spent        numeric;
  v_pockets      jsonb;
  v_top_merch    jsonb;
  v_alloc_total  numeric;
  v_avail_total  numeric;
  v_prev_income  numeric;
  v_prev_spent   numeric;
  v_currency     text;
  v_prev_month_closed boolean;
BEGIN
  v_year  := COALESCE(p_year,  EXTRACT(YEAR  FROM CURRENT_DATE)::int);
  v_month := COALESCE(p_month, EXTRACT(MONTH FROM CURRENT_DATE)::int);

  v_month_start := make_date(v_year, v_month, 1);
  v_month_end   := (v_month_start + INTERVAL '1 month')::date;

  IF v_month = 1 THEN
    v_prev_start := make_date(v_year - 1, 12, 1);
    v_prev_year := v_year - 1;
    v_prev_month := 12;
  ELSE
    v_prev_start := make_date(v_year, v_month - 1, 1);
    v_prev_year := v_year;
    v_prev_month := v_month - 1;
  END IF;
  v_prev_end := v_month_start;

  SELECT EXISTS (
    SELECT 1 FROM monthly_closures 
    WHERE user_id = p_user_id AND year = v_prev_year AND month = v_prev_month
  ) INTO v_prev_month_closed;

  SELECT COALESCE(preferred_currency, 'COP') INTO v_currency
  FROM profiles WHERE id = p_user_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_income
  FROM transactions
  WHERE user_id = p_user_id AND category = 'Ingreso' AND date_string::date >= v_month_start AND date_string::date <  v_month_end;

  SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_spent
  FROM transactions
  WHERE user_id = p_user_id AND amount < 0 AND category NOT IN ('Ingreso','Traslado') AND COALESCE(metadata->>'type','') NOT IN ('internal_transfer_out','internal_transfer_in') AND date_string::date >= v_month_start AND date_string::date <  v_month_end;

  SELECT COALESCE(SUM(amount), 0) INTO v_prev_income
  FROM transactions
  WHERE user_id = p_user_id AND category = 'Ingreso' AND date_string::date >= v_prev_start AND date_string::date <  v_prev_end;

  SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_prev_spent
  FROM transactions
  WHERE user_id = p_user_id AND amount < 0 AND category NOT IN ('Ingreso','Traslado') AND COALESCE(metadata->>'type','') NOT IN ('internal_transfer_out','internal_transfer_in') AND date_string::date >= v_prev_start AND date_string::date <  v_prev_end;

  WITH spent_by_cat AS (
    SELECT category, SUM(ABS(amount)) AS spent_month FROM transactions
    WHERE user_id = p_user_id AND amount < 0 AND category NOT IN ('Ingreso','Traslado') AND COALESCE(metadata->>'type','') NOT IN ('internal_transfer_out','internal_transfer_in') AND date_string::date >= v_month_start AND date_string::date <  v_month_end
    GROUP BY category
  )
  SELECT
    jsonb_agg(
      jsonb_build_object(
        'id',         p.id,
        'name',       p.name,
        'category',   p.category,
        'icon',       p.icon,
        'is_default_free', p.is_default_free,
        'allocated',  p.allocated_budget,
        'available',  p.allocated_budget - COALESCE(s.spent_month, 0),
        'spent_month', COALESCE(s.spent_month, 0),
        'pct_used', CASE WHEN p.allocated_budget > 0 THEN ROUND((COALESCE(s.spent_month,0) / p.allocated_budget * 100)::numeric, 2) ELSE NULL END
      ) ORDER BY p.allocated_budget DESC
    ),
    SUM(p.allocated_budget),
    SUM(p.allocated_budget - COALESCE(s.spent_month, 0))
  INTO v_pockets, v_alloc_total, v_avail_total
  FROM pockets p
  LEFT JOIN spent_by_cat s ON s.category = p.category
  WHERE p.user_id = p_user_id;

  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'total')::numeric DESC), '[]'::jsonb) INTO v_top_merch
  FROM (
    SELECT jsonb_build_object('merchant', canonical_merchant, 'display', MIN(merchant), 'total', SUM(ABS(amount)), 'count', COUNT(*)) AS t
    FROM transactions
    WHERE user_id = p_user_id AND amount < 0 AND category NOT IN ('Ingreso','Traslado') AND COALESCE(metadata->>'type','') NOT IN ('internal_transfer_out','internal_transfer_in') AND date_string::date >= v_month_start AND date_string::date <  v_month_end AND canonical_merchant IS NOT NULL
    GROUP BY canonical_merchant ORDER BY SUM(ABS(amount)) DESC LIMIT 5
  ) sub;

  RETURN jsonb_build_object(
    'year',             v_year, 'month', v_month, 'month_start', v_month_start, 'month_end', v_month_end, 'currency', COALESCE(v_currency, 'COP'),
    'income_month',     v_income, 'spent_month', v_spent, 'net_month', v_income - v_spent,
    'allocated_total',  COALESCE(v_alloc_total, 0), 'available_total',  COALESCE(v_avail_total, 0),
    'pockets',          COALESCE(v_pockets, '[]'::jsonb), 'top_merchants', v_top_merch, 'prev_month_closed', v_prev_month_closed,
    'previous_month', jsonb_build_object('year', v_prev_year, 'month', v_prev_month, 'income', v_prev_income, 'spent', v_prev_spent, 'net', v_prev_income - v_prev_spent)
  );
END;
$function$;

-- 7. execute_monthly_closure
CREATE OR REPLACE FUNCTION public.execute_monthly_closure(p_user_id uuid, p_year integer, p_month integer, p_sweeps jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_libre_id uuid;
  v_key text;
  v_sweep_amt numeric;
  v_total_swept numeric := 0;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;

  IF EXISTS (SELECT 1 FROM monthly_closures WHERE user_id = p_user_id AND year = p_year AND month = p_month) THEN
    RETURN jsonb_build_object('success', true, 'already_closed', true);
  END IF;

  SELECT id INTO v_libre_id FROM pockets WHERE user_id = p_user_id AND is_default_free = true LIMIT 1;
  IF v_libre_id IS NULL THEN RAISE EXCEPTION 'Bolsillo Libre no encontrado'; END IF;

  IF p_sweeps IS NOT NULL THEN
    FOR v_key IN SELECT key FROM jsonb_each_text(p_sweeps) ORDER BY key LOOP
      v_sweep_amt := (p_sweeps->>v_key)::numeric;
      IF v_sweep_amt > 0 THEN
        UPDATE pockets 
        SET allocated_budget = allocated_budget - v_sweep_amt 
        WHERE id = v_key::uuid AND user_id = p_user_id AND allocated_budget >= v_sweep_amt;
        
        IF FOUND THEN
          UPDATE pockets SET allocated_budget = allocated_budget + v_sweep_amt WHERE id = v_libre_id;
          
          INSERT INTO transactions (user_id, merchant, amount, category, icon, date_string, metadata)
          VALUES (
            p_user_id, 'Barrido de fin de mes', v_sweep_amt, 'Otros', 'corner-down-right', to_char(NOW(), 'YYYY-MM-DD'),
            jsonb_build_object('type', 'eom_sweep', 'from_pocket_id', v_key, 'year', p_year, 'month', p_month)
          );
          
          v_total_swept := v_total_swept + v_sweep_amt;
        END IF;
      END IF;
    END LOOP;
  END IF;

  INSERT INTO monthly_closures (user_id, year, month) VALUES (p_user_id, p_year, p_month);
  RETURN jsonb_build_object('success', true, 'total_swept', v_total_swept);
END;
$function$;

-- Y FINALMENTE ELIMINAR LA COLUMNA:
ALTER TABLE public.pockets DROP COLUMN IF EXISTS budget;
