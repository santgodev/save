CREATE OR REPLACE FUNCTION public.register_expense(p_user_id uuid, p_merchant text, p_amount numeric, p_category text, p_icon text DEFAULT 'receipt-text'::text, p_date_string text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
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
    v_cycle_id := close_and_start_new_cycle();
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

UPDATE transactions t
SET cycle_id = (
  SELECT c.id 
  FROM user_budget_cycles c 
  WHERE c.user_id = t.user_id AND c.end_date IS NULL 
  LIMIT 1
)
WHERE t.cycle_id IS NULL;
