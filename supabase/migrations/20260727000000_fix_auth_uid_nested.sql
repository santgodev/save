-- Fix nested SECURITY DEFINER functions relying on auth.uid()
-- Pass p_user_id explicitly to avoid relying on auth.uid() in nested RPCs

-- 1. DROP the old function since we are changing its signature
DROP FUNCTION IF EXISTS public.close_and_start_new_cycle(text, text);
DROP FUNCTION IF EXISTS public.close_and_start_new_cycle();

-- 2. Re-create with p_user_id
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
BEGIN
  IF p_user_id IS NULL THEN 
    -- Fallback for backwards compatibility, but shouldn't be used
    p_user_id := auth.uid();
    IF p_user_id IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;
  END IF;

  SELECT * INTO v_current_cycle FROM user_budget_cycles WHERE user_id = p_user_id AND end_date IS NULL ORDER BY start_date DESC LIMIT 1;

  IF v_current_cycle.id IS NOT NULL THEN
    FOR v_pocket IN SELECT id, category, allocated_budget FROM pockets WHERE user_id = p_user_id LOOP
      SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_leftover
      FROM transactions
      WHERE cycle_id = v_current_cycle.id AND amount < 0 AND category = v_pocket.category
      AND category NOT IN ('Ingreso','Traslado') AND COALESCE(metadata->>'type','') NOT IN ('internal_transfer_out','internal_transfer_in');

      v_leftover := COALESCE(v_pocket.allocated_budget, 0) - v_leftover;
      IF v_leftover < 0 THEN v_leftover := 0; END IF;

      IF p_rollover_mode = 'carry_over' THEN
        UPDATE pockets SET allocated_budget = v_leftover WHERE id = v_pocket.id;
      ELSIF p_rollover_mode = 'sweep_to_savings' THEN
        UPDATE pockets SET allocated_budget = 0 WHERE id = v_pocket.id;
      END IF;
    END LOOP;

    -- FIX: marcar user_closed = true.
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

-- 3. Update register_income to pass p_user_id
CREATE OR REPLACE FUNCTION public.register_income(p_user_id uuid, p_amount numeric, p_distribution jsonb, p_mode text DEFAULT 'equal'::text, p_merchant text DEFAULT 'Depósito de Capital'::text, p_cycle_mode text DEFAULT 'accumulate'::text, p_rollover_mode text DEFAULT 'carry_over'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_tx_id UUID; v_key TEXT; v_add_amt NUMERIC; v_total_dist NUMERIC := 0; v_remainder NUMERIC := 0; v_libre_id UUID; v_full_dist JSONB; v_cycle_id UUID;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Monto inválido'; END IF;
  
  IF p_cycle_mode = 'start_fresh' THEN
    v_cycle_id := close_and_start_new_cycle(p_user_id, NULL, p_rollover_mode);
  ELSE
    SELECT id INTO v_cycle_id FROM user_budget_cycles WHERE user_id = p_user_id AND end_date IS NULL LIMIT 1;
    IF v_cycle_id IS NULL THEN v_cycle_id := close_and_start_new_cycle(p_user_id, NULL, p_rollover_mode); END IF;
  END IF;

  INSERT INTO transactions (user_id, amount, category, merchant, canonical_merchant, date_string, cycle_id, metadata)
  VALUES (p_user_id, p_amount, 'Ingreso', p_merchant, p_merchant, to_char(now(), 'YYYY-MM-DD'), v_cycle_id, jsonb_build_object('mode', p_mode)) RETURNING id INTO v_tx_id;

  v_full_dist := COALESCE(p_distribution, '{}'::jsonb);

  FOR v_key IN SELECT jsonb_object_keys(p_distribution) LOOP
    v_add_amt := (p_distribution->>v_key)::numeric;
    IF v_add_amt > 0 THEN
      UPDATE pockets SET allocated_budget = COALESCE(allocated_budget, 0) + v_add_amt WHERE id = v_key::uuid AND user_id = p_user_id;
      v_total_dist := v_total_dist + v_add_amt;
    END IF;
  END LOOP;

  v_remainder := p_amount - v_total_dist;
  IF v_remainder > 0 THEN
    SELECT id INTO v_libre_id FROM pockets WHERE user_id = p_user_id AND is_default_free = true LIMIT 1;
    IF v_libre_id IS NOT NULL THEN
      UPDATE pockets SET allocated_budget = COALESCE(allocated_budget, 0) + v_remainder WHERE id = v_libre_id;
      v_full_dist := jsonb_set(v_full_dist, array[v_libre_id::text], to_jsonb( COALESCE((v_full_dist->>v_libre_id::text)::numeric, 0) + v_remainder ));
    END IF;
  END IF;

  UPDATE transactions SET metadata = jsonb_set(metadata, '{distribution}', v_full_dist) WHERE id = v_tx_id;

  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx_id, 'cycle_id', v_cycle_id);
END;
$function$;


-- 4. Update register_expense
CREATE OR REPLACE FUNCTION public.register_expense(p_user_id uuid, p_merchant text, p_amount numeric, p_category text, p_icon text DEFAULT NULL::text, p_date_string text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_pocket_id     UUID;
  v_pocket_budget NUMERIC;
  v_effective_cat TEXT;
  v_tx_id         UUID;
  v_today         TEXT;
  v_cycle_id      UUID;
BEGIN
  -- 🔒 Seguridad
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No autorizado'
      USING ERRCODE = '42501';
  END IF;

  -- 🔢 Normalización
  p_amount := ROUND(p_amount, 2);

  -- Guards
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

  -- Buscar bolsillo principal
  SELECT id, budget
  INTO v_pocket_id, v_pocket_budget
  FROM pockets
  WHERE user_id = p_user_id AND category = p_category
  ORDER BY created_at ASC
  LIMIT 1;

  -- Fallback a "Otros"
  IF v_pocket_id IS NULL THEN
    SELECT id, budget
    INTO v_pocket_id, v_pocket_budget
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

  -- Buscar ciclo activo
  SELECT id INTO v_cycle_id FROM user_budget_cycles WHERE user_id = p_user_id AND end_date IS NULL LIMIT 1;
  IF v_cycle_id IS NULL THEN
    v_cycle_id := close_and_start_new_cycle(p_user_id);
  END IF;

  -- Insertar transacción
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

  -- Actualizar bolsillo
  UPDATE pockets
  SET budget = ROUND(v_pocket_budget - ABS(p_amount), 2)
  WHERE id = v_pocket_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Error actualizando bolsillo';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'pocket_id', v_pocket_id,
    'effective_category', v_effective_cat,
    'new_pocket_budget', ROUND(v_pocket_budget - ABS(p_amount), 2),
    'cycle_id', v_cycle_id
  );
END;
$function$;


-- 5. Update confirm_pending_income
CREATE OR REPLACE FUNCTION public.confirm_pending_income(p_event_id uuid, p_actual_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_id uuid;
  v_source_name text;
  v_tx_id uuid;
  v_cycle_id uuid;
BEGIN
  -- 1. Obtener datos del evento
  SELECT e.user_id, s.name 
  INTO v_user_id, v_source_name
  FROM pending_income_events e
  JOIN income_sources s ON e.source_id = s.id
  WHERE e.id = p_event_id;

  IF v_user_id IS NULL OR v_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Evento no encontrado o acceso denegado';
  END IF;

  -- 2. Buscar ciclo activo
  SELECT id INTO v_cycle_id 
  FROM user_budget_cycles 
  WHERE user_id = v_user_id AND end_date IS NULL 
  LIMIT 1;

  IF v_cycle_id IS NULL THEN
    v_cycle_id := public.close_and_start_new_cycle(v_user_id);
  END IF;

  -- 3. Marcar evento como completado
  UPDATE pending_income_events
  SET status = 'completed', updated_at = now()
  WHERE id = p_event_id;

  -- 4. Registrar la transacción con el cycle_id correcto
  INSERT INTO transactions (
    user_id, amount, category, merchant, canonical_merchant, type, date_string, status, cycle_id, metadata
  )
  VALUES (
    v_user_id, p_actual_amount, 'Ingreso', v_source_name, v_source_name, 'deposit', 
    to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'completed', v_cycle_id, 
    jsonb_build_object('source', 'pending_income_event', 'event_id', p_event_id)
  ) RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx_id, 'cycle_id', v_cycle_id);
END;
$function$;


-- 6. Cleanup duplicate cycles for any user (close older open cycles)
WITH ranked_cycles AS (
  SELECT id, 
         ROW_NUMBER() OVER(PARTITION BY user_id ORDER BY start_date DESC) as rnk
  FROM user_budget_cycles
  WHERE end_date IS NULL
)
UPDATE user_budget_cycles 
SET end_date = now(), user_closed = true
WHERE id IN (SELECT id FROM ranked_cycles WHERE rnk > 1);
