-- Fix critical bugs in pocket transfer and deletion

CREATE OR REPLACE FUNCTION public.transfer_between_pockets(p_user_id uuid, p_from_id uuid, p_to_id uuid, p_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_from_name   TEXT;
  v_to_name     TEXT;
  v_from_cat    TEXT;
  v_to_cat      TEXT;
BEGIN
  -- 🔒 Seguridad
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  p_amount := ROUND(p_amount, 2);
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser positivo' USING ERRCODE = '22023';
  END IF;
  IF p_from_id = p_to_id THEN
    RAISE EXCEPTION 'No puedes transferir al mismo bolsillo' USING ERRCODE = '22023';
  END IF;

  -- Origen
  SELECT name, category
  INTO v_from_name, v_from_cat
  FROM pockets WHERE id = p_from_id AND user_id = p_user_id FOR UPDATE;

  IF v_from_name IS NULL THEN
    RAISE EXCEPTION 'Bolsillo origen no existe' USING ERRCODE = '42501';
  END IF;

  -- Destino
  SELECT name, category
  INTO v_to_name, v_to_cat
  FROM pockets WHERE id = p_to_id AND user_id = p_user_id FOR UPDATE;

  IF v_to_name IS NULL THEN
    RAISE EXCEPTION 'Bolsillo destino no existe' USING ERRCODE = '42501';
  END IF;

  -- 🔁 Movimiento de Presupuesto
  UPDATE pockets SET allocated_budget = ROUND(COALESCE(allocated_budget, 0) - p_amount, 2) WHERE id = p_from_id;
  UPDATE pockets SET allocated_budget = ROUND(COALESCE(allocated_budget, 0) + p_amount, 2) WHERE id = p_to_id;

  -- 🧾 Historial doble (El trigger trg_assign_cycle_to_transaction inyecta el cycle_id si es NULL)
  INSERT INTO transactions (user_id, merchant, amount, category, icon, date_string, metadata)
  VALUES
    (p_user_id, 'Hacia: ' || v_to_name, -p_amount, v_from_cat, 'repeat', to_char(NOW() AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD'), jsonb_build_object('type', 'internal_transfer_out', 'from_id', p_from_id, 'to_id', p_to_id)),
    (p_user_id, 'Desde: ' || v_from_name, p_amount, v_to_cat, 'repeat', to_char(NOW() AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD'), jsonb_build_object('type', 'internal_transfer_in', 'from_id', p_from_id, 'to_id', p_to_id));

  RETURN jsonb_build_object('success', true, 'transferred', p_amount);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_pocket_safe(p_pocket_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_allocated numeric;
  v_name text;
  v_cat text;
  v_is_default_free boolean;
  v_libre_id uuid;
  v_active_cycle_id uuid;
BEGIN
  -- Validar usuario
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  -- Obtener info del bolsillo a borrar
  SELECT allocated_budget, name, category, is_default_free
  INTO v_allocated, v_name, v_cat, v_is_default_free
  FROM pockets
  WHERE id = p_pocket_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bolsillo no encontrado o no autorizado' USING ERRCODE = '42501';
  END IF;

  IF v_is_default_free THEN
    RAISE EXCEPTION 'No puedes eliminar el bolsillo Libre por defecto' USING ERRCODE = '22023';
  END IF;

  -- Buscar ciclo activo para acotar el UPDATE de transacciones
  SELECT id INTO v_active_cycle_id
  FROM user_budget_cycles
  WHERE user_id = p_user_id AND end_date IS NULL
  ORDER BY start_date DESC LIMIT 1;

  -- Transferir fondos asignados al bolsillo Libre y reasignar transacciones
  SELECT id INTO v_libre_id
  FROM pockets
  WHERE user_id = p_user_id AND is_default_free = true
  LIMIT 1;

  IF v_libre_id IS NOT NULL THEN
    IF COALESCE(v_allocated, 0) != 0 THEN
      -- Acreditar al Libre
      UPDATE pockets SET allocated_budget = COALESCE(allocated_budget, 0) + COALESCE(v_allocated, 0) WHERE id = v_libre_id;

      -- Registrar la transferencia de saldo para mantener consistencia
      INSERT INTO transactions (user_id, merchant, amount, category, icon, date_string, metadata)
      VALUES (
        p_user_id,
        'Saldo rescatado de: ' || v_name,
        COALESCE(v_allocated, 0),
        'Otros',
        'repeat',
        to_char(NOW(), 'YYYY-MM-DD'),
        jsonb_build_object('type', 'system_pocket_deleted', 'from_name', v_name)
      );
    END IF;

    -- Re-categorizar transacciones huérfanas al Libre ('Otros') SOLO EN EL CICLO ACTIVO
    IF v_active_cycle_id IS NOT NULL THEN
      UPDATE transactions 
      SET category = 'Otros' 
      WHERE category = v_cat AND user_id = p_user_id AND cycle_id = v_active_cycle_id;
    END IF;
  END IF;

  -- Ahora sí, borrar el bolsillo
  DELETE FROM pockets WHERE id = p_pocket_id;

  RETURN jsonb_build_object('success', true, 'rescued_budget', COALESCE(v_allocated, 0));
END;
$function$;
