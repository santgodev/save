-- =====================================================================
-- Fix real: la trampa de "record IS NOT NULL" en close_and_start_new_cycle
-- =====================================================================
-- La migración 20260726000001 agregó `user_closed = true` al cerrar un
-- ciclo, pero esa línea vivía DENTRO de `IF v_current_cycle IS NOT NULL
-- THEN ... END IF;` -- y esa condición NUNCA era verdadera, así que el
-- bloque completo (reparto de sobrante + cierre) nunca se ejecutaba.
-- El fix de la migración anterior era correcto en intención pero quedó
-- neutralizado por este bug más profundo, que solo se pudo confirmar con
-- acceso directo a la base de datos (GET DIAGNOSTICS + FOUND).
--
-- CAUSA RAÍZ REAL: en Postgres, una variable `record` con una MEZCLA de
-- campos NULL y no-NULL hace que tanto `IS NULL` como `IS NOT NULL`
-- evalúen a FALSO para los dos (comportamiento documentado del tipo fila
-- compuesto, no un bug de Postgres -- es intencional del estándar SQL).
--
-- `v_current_cycle` se llena con:
--   SELECT * INTO v_current_cycle FROM user_budget_cycles
--   WHERE user_id = v_user_id AND end_date IS NULL ...
--
-- Como el propio WHERE exige `end_date IS NULL`, CUALQUIER fila que esta
-- consulta encuentre va a tener `end_date = NULL` y el resto de columnas
-- con valor -- es decir, siempre un registro "mixto". Por eso
-- `IF v_current_cycle IS NOT NULL THEN` nunca entraba, aunque sí se
-- hubiera encontrado un ciclo abierto real.
--
-- FIX: usar la variable especial `FOUND` de PL/pgSQL (se actualiza sola
-- después de cualquier SELECT INTO, y SÍ refleja correctamente "se
-- encontró una fila" sin importar qué columnas sean NULL en ella) en vez
-- de comparar el record completo contra NULL.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.close_and_start_new_cycle(p_new_cycle_name text DEFAULT NULL::text, p_rollover_mode text DEFAULT 'carry_over'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_current_cycle record;
  v_new_cycle_id uuid;
  v_default_name text;
  v_pocket record;
  v_leftover numeric;
  v_savings_pocket_id uuid;
  v_total_savings_transfer numeric := 0;
  v_count int;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;

  SELECT * INTO v_current_cycle FROM user_budget_cycles WHERE user_id = v_user_id AND end_date IS NULL ORDER BY start_date DESC LIMIT 1;

  -- FIX: FOUND en vez de "v_current_cycle IS NOT NULL" -- ver nota arriba.
  IF FOUND THEN
    FOR v_pocket IN SELECT id, category, allocated_budget FROM pockets WHERE user_id = v_user_id LOOP
      SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_leftover
      FROM transactions
      WHERE cycle_id = v_current_cycle.id AND amount < 0 AND category = v_pocket.category
      AND category NOT IN ('Ingreso','Traslado') AND COALESCE(metadata->>'type','') NOT IN ('internal_transfer_out','internal_transfer_in');

      v_leftover := COALESCE(v_pocket.allocated_budget, 0) - v_leftover;
      IF v_leftover < 0 THEN v_leftover := 0; END IF;

      IF p_rollover_mode = 'carry_over' THEN
        UPDATE pockets SET allocated_budget = v_leftover WHERE id = v_pocket.id;
      ELSIF p_rollover_mode = 'sweep_to_savings' THEN
        IF v_pocket.category NOT ILIKE '%Ahorro%' THEN
          UPDATE pockets SET allocated_budget = 0 WHERE id = v_pocket.id;
          v_total_savings_transfer := v_total_savings_transfer + v_leftover;
        ELSE
          UPDATE pockets SET allocated_budget = v_leftover WHERE id = v_pocket.id;
        END IF;
      END IF;
    END LOOP;

    IF p_rollover_mode = 'sweep_to_savings' AND v_total_savings_transfer > 0 THEN
      SELECT id INTO v_savings_pocket_id FROM pockets WHERE user_id = v_user_id AND (category ILIKE '%Ahorro%' OR name ILIKE '%Ahorro%') LIMIT 1;
      IF v_savings_pocket_id IS NULL THEN
        INSERT INTO pockets (user_id, name, category, icon, budget, allocated_budget, is_default_free)
        VALUES (v_user_id, 'Ahorros', 'Ahorros', 'PiggyBank', 0, v_total_savings_transfer, false)
        RETURNING id INTO v_savings_pocket_id;
      ELSE
        UPDATE pockets SET allocated_budget = COALESCE(allocated_budget, 0) + v_total_savings_transfer WHERE id = v_savings_pocket_id;
      END IF;
    END IF;

    -- Cierra el ciclo Y lo marca como ya procesado (fix de la migración
    -- 20260726000001, ahora sí alcanzable gracias al fix de FOUND).
    UPDATE user_budget_cycles SET end_date = now(), user_closed = true WHERE user_id = v_user_id AND end_date IS NULL;
  END IF;

  IF p_new_cycle_name IS NULL THEN
    v_default_name := (ARRAY['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'])[EXTRACT(MONTH FROM now())::int] || ' ' || EXTRACT(YEAR FROM now())::int;

    SELECT count(*) INTO v_count FROM user_budget_cycles WHERE user_id = v_user_id AND name LIKE v_default_name || '%';
    IF v_count > 0 THEN
      v_default_name := v_default_name || ' #' || (v_count + 1);
    END IF;
  ELSE
    v_default_name := p_new_cycle_name;
  END IF;

  INSERT INTO user_budget_cycles (user_id, name, start_date, end_date) VALUES (v_user_id, v_default_name, now(), NULL) RETURNING id INTO v_new_cycle_id;
  RETURN v_new_cycle_id;
END;
$function$
;

-- NOTA para auditorías futuras: revisar si el mismo patrón
-- ("record IS NOT NULL" justo después de un SELECT filtrado por una
-- columna NULL) aparece en otras funciones. Se revisó get_cycle_state y
-- execute_cycle_closure -- ahí los `IS NULL`/`IS NOT NULL` se usan sobre
-- registros que, cuando SÍ se encuentran, no tienen ninguna columna
-- garantizada en NULL por el propio WHERE, así que no son vulnerables a
-- esta misma trampa. Pero vale la pena que quien siga tocando estas
-- funciones tenga el patrón en la cabeza.
