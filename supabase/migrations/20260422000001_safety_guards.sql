-- 20260422000001_safety_guards.sql
-- Versión endurecida nivel producción (fintech-grade)

-- ============================================================
-- transfer_between_pockets
-- ============================================================
CREATE OR REPLACE FUNCTION public.transfer_between_pockets(
  p_user_id uuid,
  p_from_id uuid,
  p_to_id   uuid,
  p_amount  numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_from_name   TEXT;
  v_to_name     TEXT;
  v_from_budget NUMERIC;
  v_from_cat    TEXT;
  v_to_cat      TEXT;
BEGIN
  -- 🔒 Seguridad: validar usuario autenticado
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No autorizado'
      USING ERRCODE = '42501';
  END IF;

  -- 🔢 Normalización monetaria
  p_amount := ROUND(p_amount, 2);

  -- Guard 1: monto válido
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser positivo (recibido: %)', p_amount
      USING ERRCODE = '22023';
  END IF;

  -- Guard 2: no mismo bolsillo
  IF p_from_id = p_to_id THEN
    RAISE EXCEPTION 'No puedes transferir al mismo bolsillo'
      USING ERRCODE = '22023';
  END IF;

  -- Guard 3: bolsillo origen válido
  SELECT name, budget, category
  INTO v_from_name, v_from_budget, v_from_cat
  FROM pockets
  WHERE id = p_from_id AND user_id = p_user_id
  FOR UPDATE;

  IF v_from_name IS NULL THEN
    RAISE EXCEPTION 'Bolsillo origen no existe o no te pertenece'
      USING ERRCODE = '42501';
  END IF;

  -- Guard 4: bolsillo destino válido
  SELECT name, category
  INTO v_to_name, v_to_cat
  FROM pockets
  WHERE id = p_to_id AND user_id = p_user_id
  FOR UPDATE;

  IF v_to_name IS NULL THEN
    RAISE EXCEPTION 'Bolsillo destino no existe o no te pertenece'
      USING ERRCODE = '42501';
  END IF;

  -- Guard 5: saldo suficiente
  IF v_from_budget < p_amount THEN
    RAISE EXCEPTION 'Saldo insuficiente. Disponible: %, requerido: %',
      v_from_budget, p_amount
      USING ERRCODE = '23514';
  END IF;

  -- 🔁 Movimiento
  UPDATE pockets SET budget = ROUND(budget - p_amount, 2)
  WHERE id = p_from_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Error actualizando bolsillo origen';
  END IF;

  UPDATE pockets SET budget = ROUND(budget + p_amount, 2)
  WHERE id = p_to_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Error actualizando bolsillo destino';
  END IF;

  -- 🧾 Historial doble
  INSERT INTO transactions (user_id, merchant, amount, category, icon, date_string, metadata)
  VALUES
    (
      p_user_id,
      'Hacia: ' || v_to_name,
      -p_amount,
      v_from_cat,
      'repeat',
      to_char(NOW(), 'YYYY-MM-DD'),
      jsonb_build_object('type', 'internal_transfer_out', 'from_id', p_from_id, 'to_id', p_to_id)
    ),
    (
      p_user_id,
      'Desde: ' || v_from_name,
      p_amount,
      v_to_cat,
      'repeat',
      to_char(NOW(), 'YYYY-MM-DD'),
      jsonb_build_object('type', 'internal_transfer_in', 'from_id', p_from_id, 'to_id', p_to_id)
    );

  RETURN jsonb_build_object('success', true, 'transferred', p_amount);
END;
$function$;


-- ============================================================
-- register_expense
-- ============================================================
CREATE OR REPLACE FUNCTION public.register_expense(
  p_user_id     uuid,
  p_merchant    text,
  p_amount      numeric,
  p_category    text,
  p_icon        text DEFAULT 'receipt-text',
  p_date_string text DEFAULT NULL,
  p_metadata    jsonb DEFAULT '{}'::jsonb
)
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

  -- Insertar transacción
  INSERT INTO transactions (user_id, merchant, amount, category, icon, date_string, metadata)
  VALUES (
    p_user_id,
    btrim(p_merchant),
    -ABS(p_amount),
    v_effective_cat,
    p_icon,
    v_today,
    p_metadata || jsonb_build_object('requested_category', p_category)
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
    'new_pocket_budget', ROUND(v_pocket_budget - ABS(p_amount), 2)
  );
END;
$function$;


-- ============================================================
-- Comentarios
-- ============================================================
COMMENT ON FUNCTION public.transfer_between_pockets(uuid, uuid, uuid, numeric) IS
  'Transferencia segura entre bolsillos con validación completa, redondeo y control de concurrencia. v3';

COMMENT ON FUNCTION public.register_expense(uuid, text, numeric, text, text, text, jsonb) IS
  'Registro de gasto con validaciones estrictas, fallback a Otros y consistencia monetaria. v3';
