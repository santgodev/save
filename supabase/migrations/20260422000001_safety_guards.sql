-- 20260422000001_safety_guards.sql
--
-- Safety guards para los RPCs que mueven plata. Encontrados por
-- tests/TEST_REPORT.md (2026-04-22):
--
--   Bug #1 (CRÍTICO) transfer_between_pockets aceptaba monto negativo
--                    → invertía el flujo de plata sin validar saldo.
--   Bug #4 (ALTO)    transfer_between_pockets aceptaba from=to
--                    → creaba transacciones falsas.
--   Bug #5 (ALTO)    transfer/expense aceptaban monto 0
--                    → basura en el historial.
--   Bug #3 (CRÍTICO) register_expense con categoría sin bolsillo
--                    → transacción huérfana (gasto invisible).
--   Bug #10 (MEDIO)  register_expense aceptaba merchant=''.
--
-- La cobertura de esta migración se verifica con
-- tests/regressions/regression_001_negative_amount.sql.

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
  -- Guard 1: monto debe ser positivo y no nulo.
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser positivo (recibido: %)', p_amount
      USING ERRCODE = '22023';  -- invalid_parameter_value
  END IF;

  -- Guard 2: no transferir al mismo bolsillo.
  IF p_from_id = p_to_id THEN
    RAISE EXCEPTION 'No puedes transferir al mismo bolsillo'
      USING ERRCODE = '22023';
  END IF;

  -- Guard 3: bolsillo origen debe existir y pertenecer al usuario.
  SELECT name, budget, category INTO v_from_name, v_from_budget, v_from_cat
  FROM pockets WHERE id = p_from_id AND user_id = p_user_id FOR UPDATE;

  IF v_from_name IS NULL THEN
    RAISE EXCEPTION 'Bolsillo origen no existe o no te pertenece'
      USING ERRCODE = '42501';  -- insufficient_privilege
  END IF;

  -- Guard 4: bolsillo destino debe existir y pertenecer al usuario.
  SELECT name, category INTO v_to_name, v_to_cat
  FROM pockets WHERE id = p_to_id AND user_id = p_user_id FOR UPDATE;

  IF v_to_name IS NULL THEN
    RAISE EXCEPTION 'Bolsillo destino no existe o no te pertenece'
      USING ERRCODE = '42501';
  END IF;

  -- Guard 5 (existente): saldo suficiente.
  IF v_from_budget < p_amount THEN
    RAISE EXCEPTION 'Saldo insuficiente en bolsillo origen. Disponible: %, Requerido: %',
      v_from_budget, p_amount
      USING ERRCODE = '23514';  -- check_violation
  END IF;

  -- Ejecución: mover plata y registrar historial.
  UPDATE pockets SET budget = budget - p_amount WHERE id = p_from_id;
  UPDATE pockets SET budget = budget + p_amount WHERE id = p_to_id;

  INSERT INTO transactions (user_id, merchant, amount, category, icon, date_string, metadata)
  VALUES
    (p_user_id, 'Hacia: ' || v_to_name,   -p_amount, v_from_cat, 'repeat',
     to_char(NOW(), 'YYYY-MM-DD'),
     jsonb_build_object('type', 'internal_transfer_out', 'from_id', p_from_id, 'to_id', p_to_id)),
    (p_user_id, 'Desde: ' || v_from_name,  p_amount, v_to_cat,   'repeat',
     to_char(NOW(), 'YYYY-MM-DD'),
     jsonb_build_object('type', 'internal_transfer_in',  'from_id', p_from_id, 'to_id', p_to_id));

  RETURN jsonb_build_object('success', true, 'transferred', p_amount);
END;
$function$;


-- ============================================================
-- register_expense
-- ============================================================
-- Cambios:
--   - Valida monto > 0.
--   - Valida merchant no vacío (trim + length > 0).
--   - Si no hay bolsillo para la categoría, intenta usar "Otros";
--     si tampoco existe, lanza excepción clara (el cliente debe
--     pedir al usuario que cree un bolsillo).
--   - Usa ORDER BY created_at ASC para desambiguar categorías duplicadas
--     (se descuenta siempre del bolsillo más antiguo de esa categoría).
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
  -- Guards de entrada
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

  -- Buscar bolsillo para la categoría pedida (más antiguo primero, determinista).
  SELECT id, budget INTO v_pocket_id, v_pocket_budget
  FROM pockets
  WHERE user_id = p_user_id AND category = p_category
  ORDER BY created_at ASC
  LIMIT 1;

  -- Fallback a "Otros" si no existe la categoría pedida.
  IF v_pocket_id IS NULL THEN
    SELECT id, budget INTO v_pocket_id, v_pocket_budget
    FROM pockets
    WHERE user_id = p_user_id AND category = 'Otros'
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_pocket_id IS NOT NULL THEN
      v_effective_cat := 'Otros';
    ELSE
      -- Sin bolsillo para esa categoría Y sin "Otros" → abortar.
      RAISE EXCEPTION 'No existe bolsillo para la categoría "%" ni para "Otros". Créalo primero.', p_category
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Insertar transacción en la categoría efectiva (la del bolsillo que sí existe).
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

  -- Descontar del bolsillo elegido.
  UPDATE pockets
  SET budget = v_pocket_budget - ABS(p_amount)
  WHERE id = v_pocket_id;

  RETURN jsonb_build_object(
    'success',           true,
    'transaction_id',    v_tx_id,
    'pocket_id',         v_pocket_id,
    'effective_category', v_effective_cat,
    'new_pocket_budget', v_pocket_budget - ABS(p_amount)
  );
END;
$function$;


-- ============================================================
-- Comentarios para facilitar debugging en el futuro.
-- ============================================================
COMMENT ON FUNCTION public.transfer_between_pockets(uuid, uuid, uuid, numeric) IS
  'Transfiere dinero entre bolsillos. Valida: monto > 0, from != to, ambos del mismo user, saldo suficiente. v2 (safety_guards 2026-04-22).';

COMMENT ON FUNCTION public.register_expense(uuid, text, numeric, text, text, text, jsonb) IS
  'Registra gasto. Valida: monto > 0, merchant no vacío, categoría no vacía. Fallback a "Otros" si la categoría no tiene bolsillo. v2 (safety_guards 2026-04-22).';
