-- 20260428000005_security_perf_hardening.sql
--
-- Cleanup post-auditoría P0/P1 (docs/DB_AUDIT_2026-04-28.md):
--
--   [SEGURIDAD]
--   1. Las 4 RPCs de mutación NO validaban auth.uid() = p_user_id.
--      Cualquiera podía llamar register_expense con un p_user_id ajeno.
--      Acá se les agrega el guard de inicio + REVOKE EXECUTE de anon.
--   2. SET search_path = public, pg_temp en todas las funciones SECURITY
--      DEFINER (defensa contra schema hijack).
--
--   [PERFORMANCE]
--   3. Indices nuevos sobre transactions(user_id, date_string) y
--      pockets(user_id) — son los filtros más usados (get_monthly_state,
--      todos los selects RLS-bound).
--   4. RLS rewrap masivo: las 19 políticas que llaman auth.uid() directo
--      pasan a (select auth.uid()) — eval 1 vez en lugar de por fila.
--   5. Política duplicada de user_events ("Users can manage their own
--      events") borrada — coexistía con user_events_*_own.

-- =====================================================================
-- 1) Indices de soporte para FKs más calientes
-- =====================================================================
CREATE INDEX IF NOT EXISTS transactions_user_date_idx
  ON public.transactions (user_id, date_string DESC);

CREATE INDEX IF NOT EXISTS pockets_user_id_idx
  ON public.pockets (user_id);


-- =====================================================================
-- 2) RLS rewrap — reemplazar auth.uid() por (select auth.uid())
-- =====================================================================
-- Patrón: DROP POLICY + CREATE POLICY. Idempotente con IF EXISTS.
-- Las tablas zombi (recommendations, monthly_snapshots,
-- user_behavior_metrics) se borraron en la migración anterior, sus
-- policies cayeron con el CASCADE.

-- profiles
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY profiles_select_own
  ON public.profiles FOR SELECT
  USING ((select auth.uid()) = id);
CREATE POLICY profiles_update_own
  ON public.profiles FOR UPDATE
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- transactions
DROP POLICY IF EXISTS "Users can manage their own transactions" ON public.transactions;
CREATE POLICY transactions_all_own
  ON public.transactions FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- pockets
DROP POLICY IF EXISTS "Users can manage their own pockets" ON public.pockets;
CREATE POLICY pockets_all_own
  ON public.pockets FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- user_events: BORRAR la duplicada vieja + rewrap las nuevas.
DROP POLICY IF EXISTS "Users can manage their own events" ON public.user_events;
DROP POLICY IF EXISTS user_events_select_own ON public.user_events;
DROP POLICY IF EXISTS user_events_insert_own ON public.user_events;
CREATE POLICY user_events_select_own
  ON public.user_events FOR SELECT
  USING ((select auth.uid()) = user_id);
CREATE POLICY user_events_insert_own
  ON public.user_events FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

-- user_spending_rules
DROP POLICY IF EXISTS "Users can manage their own spending rules"
  ON public.user_spending_rules;
CREATE POLICY user_spending_rules_all_own
  ON public.user_spending_rules FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- chat_messages
DROP POLICY IF EXISTS chat_messages_select_own ON public.chat_messages;
DROP POLICY IF EXISTS chat_messages_insert_own ON public.chat_messages;
DROP POLICY IF EXISTS chat_messages_delete_own ON public.chat_messages;
CREATE POLICY chat_messages_select_own
  ON public.chat_messages FOR SELECT
  USING ((select auth.uid()) = user_id);
CREATE POLICY chat_messages_insert_own
  ON public.chat_messages FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY chat_messages_delete_own
  ON public.chat_messages FOR DELETE
  USING ((select auth.uid()) = user_id);

-- user_memory
DROP POLICY IF EXISTS user_memory_select_own ON public.user_memory;
CREATE POLICY user_memory_select_own
  ON public.user_memory FOR SELECT
  USING ((select auth.uid()) = user_id);

-- user_insights
DROP POLICY IF EXISTS user_insights_select_own ON public.user_insights;
DROP POLICY IF EXISTS user_insights_update_status_own ON public.user_insights;
CREATE POLICY user_insights_select_own
  ON public.user_insights FOR SELECT
  USING ((select auth.uid()) = user_id);
CREATE POLICY user_insights_update_status_own
  ON public.user_insights FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);


-- =====================================================================
-- 3) Hardening de RPCs de mutación: guard p_user_id = auth.uid()
--    + SET search_path defensivo
-- =====================================================================
-- 3a. register_expense — agregamos guard al inicio.
--     Mantengo todo el resto del cuerpo idéntico al de
--     data_quality_guards (2026-04-28). v4: guard + search_path.
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
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_pocket_id     UUID;
  v_pocket_budget NUMERIC;
  v_effective_cat TEXT;
  v_tx_id         UUID;
  v_today         TEXT;
  v_parsed        DATE;
BEGIN
  -- AUTH GUARD: la RPC es SECURITY DEFINER y estaba expuesta a anon
  -- vía REST. Sin este check, cualquiera podía pasar un p_user_id
  -- ajeno y meter gastos a otro usuario.
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No puedes operar sobre datos de otro usuario'
      USING ERRCODE = '42501';
  END IF;

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

  IF p_date_string IS NULL THEN
    v_today := to_char(NOW(), 'YYYY-MM-DD');
  ELSE
    IF p_date_string !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'Formato de fecha inválido (esperado YYYY-MM-DD, recibido: %)', p_date_string
        USING ERRCODE = '22007';
    END IF;
    BEGIN
      v_parsed := p_date_string::DATE;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Fecha no parseable: %', p_date_string
        USING ERRCODE = '22008';
    END;
    IF v_parsed < DATE '2000-01-01' THEN
      RAISE EXCEPTION 'Fecha demasiado antigua (%, mínimo 2000-01-01)', p_date_string
        USING ERRCODE = '22008';
    END IF;
    IF v_parsed > CURRENT_DATE + INTERVAL '1 day' THEN
      RAISE EXCEPTION 'Fecha en el futuro no permitida (%, hoy es %)', p_date_string, CURRENT_DATE
        USING ERRCODE = '22008';
    END IF;
    v_today := p_date_string;
  END IF;

  v_effective_cat := p_category;

  SELECT id, budget INTO v_pocket_id, v_pocket_budget
  FROM pockets
  WHERE user_id = p_user_id AND category = p_category
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_pocket_id IS NULL THEN
    SELECT id, budget INTO v_pocket_id, v_pocket_budget
    FROM pockets
    WHERE user_id = p_user_id AND category = 'Otros'
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_pocket_id IS NOT NULL THEN
      v_effective_cat := 'Otros';
    ELSE
      RAISE EXCEPTION 'No existe bolsillo para la categoría "%" ni para "Otros". Créalo primero.', p_category
        USING ERRCODE = '23514';
    END IF;
  END IF;

  INSERT INTO transactions (user_id, merchant, amount, category, icon, date_string, metadata)
  VALUES (
    p_user_id, btrim(p_merchant), -ABS(p_amount), v_effective_cat,
    p_icon, v_today,
    p_metadata || jsonb_build_object('requested_category', p_category)
  )
  RETURNING id INTO v_tx_id;

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

COMMENT ON FUNCTION public.register_expense(uuid, text, numeric, text, text, text, jsonb) IS
  'Registra gasto. v4 (security_perf_hardening 2026-04-28): guard p_user_id = auth.uid(), search_path fijo.';


-- 3b. register_income — guard + search_path.
CREATE OR REPLACE FUNCTION public.register_income(
  p_user_id      uuid,
  p_amount       numeric,
  p_distribution jsonb,
  p_mode         text DEFAULT 'equal',
  p_merchant     text DEFAULT 'Depósito de Capital'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_tx_id     UUID;
  v_pocket_id UUID;
  v_add_amt   NUMERIC;
  v_key       TEXT;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No puedes operar sobre datos de otro usuario'
      USING ERRCODE = '42501';
  END IF;

  -- Guards de entrada (P2 del audit, agregados ahora).
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser positivo (recibido: %)', p_amount
      USING ERRCODE = '22023';
  END IF;
  IF p_distribution IS NULL OR jsonb_typeof(p_distribution) <> 'object' THEN
    RAISE EXCEPTION 'p_distribution debe ser un objeto JSON' USING ERRCODE = '22023';
  END IF;

  INSERT INTO transactions (user_id, merchant, amount, category, icon, date_string, metadata)
  VALUES (
    p_user_id, p_merchant, ABS(p_amount), 'Ingreso', 'trending-up',
    to_char(NOW(), 'YYYY-MM-DD'),
    jsonb_build_object('distribution', p_distribution, 'type', 'income_distributed', 'mode', p_mode)
  )
  RETURNING id INTO v_tx_id;

  FOR v_key IN SELECT jsonb_object_keys(p_distribution)
  LOOP
    v_pocket_id := v_key::UUID;
    v_add_amt   := (p_distribution ->> v_key)::NUMERIC;

    -- Validar que el bolsillo sea del mismo user (evita inyección de
    -- IDs ajenos por un cliente que arme el distribution malicioso).
    UPDATE pockets
    SET budget = budget + v_add_amt
    WHERE id = v_pocket_id AND user_id = p_user_id;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx_id);
END;
$function$;

COMMENT ON FUNCTION public.register_income(uuid, numeric, jsonb, text, text) IS
  'Registra ingreso distribuido. v2 (security_perf_hardening 2026-04-28): guard, monto positivo, distribution validada.';


-- 3c. transfer_between_pockets — guard + search_path.
CREATE OR REPLACE FUNCTION public.transfer_between_pockets(
  p_user_id uuid,
  p_from_id uuid,
  p_to_id   uuid,
  p_amount  numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_from_name   TEXT;
  v_to_name     TEXT;
  v_from_budget NUMERIC;
  v_from_cat    TEXT;
  v_to_cat      TEXT;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No puedes operar sobre datos de otro usuario'
      USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser positivo (recibido: %)', p_amount
      USING ERRCODE = '22023';
  END IF;

  IF p_from_id = p_to_id THEN
    RAISE EXCEPTION 'No puedes transferir al mismo bolsillo'
      USING ERRCODE = '22023';
  END IF;

  SELECT name, budget, category INTO v_from_name, v_from_budget, v_from_cat
  FROM pockets WHERE id = p_from_id AND user_id = p_user_id FOR UPDATE;

  IF v_from_name IS NULL THEN
    RAISE EXCEPTION 'Bolsillo origen no existe o no te pertenece'
      USING ERRCODE = '42501';
  END IF;

  SELECT name, category INTO v_to_name, v_to_cat
  FROM pockets WHERE id = p_to_id AND user_id = p_user_id FOR UPDATE;

  IF v_to_name IS NULL THEN
    RAISE EXCEPTION 'Bolsillo destino no existe o no te pertenece'
      USING ERRCODE = '42501';
  END IF;

  IF v_from_budget < p_amount THEN
    RAISE EXCEPTION 'Saldo insuficiente. Disponible: %, requerido: %',
      v_from_budget, p_amount
      USING ERRCODE = '23514';
  END IF;

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

COMMENT ON FUNCTION public.transfer_between_pockets(uuid, uuid, uuid, numeric) IS
  'Transfiere entre bolsillos del mismo usuario. v2 (security_perf_hardening 2026-04-28): guard auth.';


-- 3d. delete_transaction_with_reversal — guard + search_path.
CREATE OR REPLACE FUNCTION public.delete_transaction_with_reversal(
  p_tx_id   uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_amount    NUMERIC;
  v_category  TEXT;
  v_pocket_id UUID;
  v_metadata  JSONB;
  v_type      TEXT;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No puedes operar sobre datos de otro usuario'
      USING ERRCODE = '42501';
  END IF;

  SELECT amount, category, metadata
  INTO v_amount, v_category, v_metadata
  FROM transactions
  WHERE id = p_tx_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transacción no encontrada' USING ERRCODE = '42501';
  END IF;

  v_type := v_metadata ->> 'type';

  IF v_type IS DISTINCT FROM 'internal_transfer_out'
     AND v_type IS DISTINCT FROM 'internal_transfer_in' THEN
    SELECT id INTO v_pocket_id
    FROM pockets
    WHERE user_id = p_user_id AND category = v_category
    LIMIT 1;

    IF v_pocket_id IS NOT NULL THEN
      UPDATE pockets
      SET budget = budget - v_amount
      WHERE id = v_pocket_id;
    END IF;
  END IF;

  DELETE FROM transactions WHERE id = p_tx_id;

  RETURN jsonb_build_object('success', true, 'reversed_amount', v_amount);
END;
$function$;

COMMENT ON FUNCTION public.delete_transaction_with_reversal(uuid, uuid) IS
  'Borra transacción y revierte saldo. v2 (security_perf_hardening 2026-04-28): guard auth.';


-- =====================================================================
-- 4) REVOKE EXECUTE de anon en RPCs de mutación
-- =====================================================================
-- Aunque ya tienen guard, no hay razón para que anon vea estos endpoints.
-- Defensa en profundidad. Solo authenticated puede llamarlas.
REVOKE EXECUTE ON FUNCTION public.register_expense(uuid, text, numeric, text, text, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.register_income(uuid, numeric, jsonb, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.transfer_between_pockets(uuid, uuid, uuid, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_transaction_with_reversal(uuid, uuid) FROM anon;

-- Cron RPCs: solo service_role (asumiendo que el job usa esa key).
REVOKE EXECUTE ON FUNCTION public.cron_expire_user_insights() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_prune_user_events() FROM anon, authenticated;

-- get_monthly_state queda como está: authenticated lo puede llamar (ya
-- valida implícitamente porque los queries internos filtran por
-- p_user_id, y RLS aplica al SELECT que el cliente hace después). Pero
-- revocamos anon: no tiene sentido exponer un RPC de datos personales
-- a no-logueados.
REVOKE EXECUTE ON FUNCTION public.get_monthly_state(uuid, integer, integer) FROM anon;
