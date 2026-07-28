-- =====================================================================
-- Fix: doble procesamiento del sobrante al cambiar de ciclo
-- =====================================================================
-- SÍNTOMA REPORTADO: al iniciar un ciclo nuevo desde AddIncome ("A un mes
-- nuevo"), el Dashboard vuelve a mostrar el modal de "¡Mes finalizado!"
-- para el ciclo que se ACABA de cerrar, y si el usuario llega a tocarlo,
-- los bolsillos quedan con números que no cuadran.
--
-- CAUSA RAÍZ: close_and_start_new_cycle() ya hace todo el trabajo de
-- repartir el sobrante (carry_over / sweep_to_savings) cuando cierra el
-- ciclo viejo, pero nunca marcaba ese ciclo como `user_closed = true`.
-- El Dashboard detecta "ciclo con end_date pero user_closed = false" como
-- señal de "todavía falta cerrarlo", así que vuelve a disparar el modal
-- de cierre (MonthClosureModal → execute_cycle_closure) para un ciclo
-- cuyo sobrante YA se procesó. Si el usuario sigue ese modal, se vuelve
-- a mover plata de los mismos bolsillos -- y como los bolsillos NO son
-- por ciclo (es la misma fila para todos los meses), el ciclo nuevo
-- hereda esos números ya duplicados desde el primer segundo.
--
-- FIX (dos partes, cada una cierra una punta distinta del mismo bug):
--   1. close_and_start_new_cycle ahora también marca user_closed = true
--      al cerrar el ciclo viejo -- ya no hay nada pendiente que preguntar,
--      así que el Dashboard no debe volver a ofrecer el modal de cierre.
--   2. execute_cycle_closure ahora es idempotente: si el ciclo ya estaba
--      cerrado (user_closed = true), no vuelve a barrer nada -- por si
--      llega a invocarse dos veces por cualquier otra razón futura.
--
-- NO se tocó: el resto de la lógica de reparto (carry_over/sweep), la
-- creación del ciclo nuevo, ni la resolución de "cuál es el ciclo activo"
-- en register_expense/register_income -- esas partes ya estaban correctas.
--
-- NOTA IMPORTANTE PARA QUIEN APLIQUE ESTO: este fix previene que el bug
-- vuelva a pasar de aquí en adelante. NO repara datos ya afectados -- si
-- ya pasaste por un cierre duplicado antes de este fix, algún bolsillo
-- puede tener un `allocated_budget` que no cuadra con la realidad. Vale
-- la pena revisar los bolsillos a mano una vez después de aplicar esto.
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

  IF v_current_cycle IS NOT NULL THEN
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

    -- FIX: además de cerrar (end_date), marcar user_closed = true. El
    -- rollover/sweep de arriba YA decidió qué hacer con el sobrante, así
    -- que este ciclo no debe volver a aparecer como "pendiente de cerrar"
    -- en el Dashboard (esa señal es justo end_date IS NOT NULL AND
    -- user_closed = false -- ver query en Dashboard.tsx).
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

CREATE OR REPLACE FUNCTION public.execute_cycle_closure(p_user_id uuid, p_cycle_id uuid, p_sweeps jsonb DEFAULT NULL::jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cycle record;
  v_libre_id uuid;
  v_key text;
  v_amount numeric;
BEGIN
  -- Verificar ciclo
  SELECT * INTO v_cycle FROM user_budget_cycles WHERE id = p_cycle_id AND user_id = p_user_id;
  IF v_cycle IS NULL THEN
    RAISE EXCEPTION 'Ciclo no encontrado';
  END IF;

  -- FIX: idempotencia -- si este ciclo ya fue cerrado (por este mismo RPC
  -- o por close_and_start_new_cycle), no volver a barrer plata de los
  -- bolsillos. Sin este guard, invocar el cierre dos veces sobre el mismo
  -- ciclo duplicaba el movimiento de saldos.
  IF v_cycle.user_closed THEN
    RETURN true;
  END IF;

  -- Realizar barrido a libre si es necesario
  IF p_sweeps IS NOT NULL THEN
    SELECT id INTO v_libre_id FROM pockets WHERE user_id = p_user_id AND is_default_free = true LIMIT 1;
    IF v_libre_id IS NULL THEN
      RAISE EXCEPTION 'Bolsillo Libre no encontrado';
    END IF;

    FOR v_key IN SELECT jsonb_object_keys(p_sweeps) LOOP
      v_amount := (p_sweeps->>v_key)::numeric;
      IF v_amount > 0 THEN
        -- Restar del bolsillo original
        UPDATE pockets SET allocated_budget = allocated_budget - v_amount WHERE id = v_key::uuid AND user_id = p_user_id;
        -- Sumar al bolsillo libre
        UPDATE pockets SET allocated_budget = allocated_budget + v_amount WHERE id = v_libre_id;
      END IF;
    END LOOP;
  END IF;

  -- Marcar ciclo como cerrado
  UPDATE user_budget_cycles SET user_closed = true WHERE id = p_cycle_id;

  RETURN true;
END;
$function$
;
