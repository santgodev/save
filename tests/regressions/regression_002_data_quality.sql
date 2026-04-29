-- regression_002_data_quality.sql
--
-- Cubre los bugs de calidad de datos del TEST_REPORT (2026-04-22):
--   #7  preferred_currency default 'USD' en app colombiana.
--   #8  monthly_income default 0 (bloquea razonamiento del advisor).
--   #9  date_string sin validación (acepta '1970-01-01', '2099-12-31', '2019/06/19'...).
--   #12 chat_messages.session_id null por defecto (imposible agrupar).
--
-- Cómo correr:
--   - Branch / local : psql $DB_URL -f tests/regressions/regression_002_data_quality.sql
--   - MCP en prod    : copiar el bloque de cada caso, envolver en BEGIN/ROLLBACK.
--
-- Cada caso:
--   1. Crea un escenario fresco con ROLLBACK.
--   2. RAISE EXCEPTION si el guard NO funciona (rojo) o si la inserción
--      legal falla (rojo).
--   3. Si todos los casos terminan con NOTICE 'OK', el archivo pasó.

\echo '====================================================='
\echo ' regression_002_data_quality.sql'
\echo '====================================================='

-- =====================================================================
-- Caso 1: profiles.preferred_currency default debe ser 'COP'
-- =====================================================================
BEGIN;
DO $$
DECLARE
  v_def TEXT;
BEGIN
  SELECT column_default INTO v_def
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='profiles' AND column_name='preferred_currency';

  IF v_def IS NULL OR v_def NOT LIKE '%COP%' THEN
    RAISE EXCEPTION '#7 FAIL: preferred_currency default = %, esperado contener COP', v_def;
  END IF;
  RAISE NOTICE '#7 OK: preferred_currency default contiene COP (%)', v_def;
END $$;
ROLLBACK;

-- =====================================================================
-- Caso 2: profiles.monthly_income debe rechazar 0 y aceptar NULL/positivo
-- =====================================================================
BEGIN;
DO $$
DECLARE
  v_uid UUID := '00000000-0000-0000-0000-0000000000bb';
BEGIN
  -- Setup: insertar usuario fantasma sin pasar por auth (RLS off porque
  -- estamos como service_role en el MCP).
  INSERT INTO auth.users (id, email) VALUES (v_uid, 'rg002@test.local')
    ON CONFLICT DO NOTHING;
  INSERT INTO profiles (id, full_name, monthly_income)
    VALUES (v_uid, 'Test 002', NULL);  -- NULL debería ser válido

  -- monthly_income = NULL acepta
  UPDATE profiles SET monthly_income = NULL WHERE id = v_uid;

  -- monthly_income > 0 acepta
  UPDATE profiles SET monthly_income = 1500000 WHERE id = v_uid;

  -- monthly_income = 0 debe fallar
  BEGIN
    UPDATE profiles SET monthly_income = 0 WHERE id = v_uid;
    RAISE EXCEPTION '#8 FAIL: monthly_income=0 no fue rechazado';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE '#8 OK: monthly_income=0 rechazado';
  END;

  -- monthly_income negativo debe fallar
  BEGIN
    UPDATE profiles SET monthly_income = -100 WHERE id = v_uid;
    RAISE EXCEPTION '#8 FAIL: monthly_income=-100 no fue rechazado';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE '#8 OK: monthly_income negativo rechazado';
  END;
END $$;
ROLLBACK;

-- =====================================================================
-- Caso 3: register_expense debe rechazar date_string inválido y futuro
-- =====================================================================
BEGIN;
DO $$
DECLARE
  v_uid UUID;
  v_pid UUID;
BEGIN
  -- Buscar un usuario real con bolsillo "Otros" (santgodev).
  SELECT user_id, id INTO v_uid, v_pid
  FROM pockets WHERE category = 'Otros' LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE NOTICE '#9 SKIP: no hay bolsillo Otros para correr el test';
    RETURN;
  END IF;

  -- Formato bueno: pasa
  PERFORM register_expense(v_uid, 'Test fecha buena', 100, 'Otros', 'receipt-text', '2026-04-22');
  RAISE NOTICE '#9 OK: fecha válida acepta';

  -- Formato malo (con /)
  BEGIN
    PERFORM register_expense(v_uid, 'Test fecha mala', 100, 'Otros', 'receipt-text', '2026/04/22');
    RAISE EXCEPTION '#9 FAIL: date_string con / no fue rechazado';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('22023','22008','22007') THEN
      RAISE NOTICE '#9 OK: formato YYYY/MM/DD rechazado (%)', SQLERRM;
    ELSE
      RAISE EXCEPTION '#9 FAIL inesperado: % %', SQLSTATE, SQLERRM;
    END IF;
  END;

  -- Fecha futura (mañana + 30 días)
  BEGIN
    PERFORM register_expense(v_uid, 'Test fecha futura', 100, 'Otros', 'receipt-text',
      to_char(CURRENT_DATE + 30, 'YYYY-MM-DD'));
    RAISE EXCEPTION '#9 FAIL: fecha 30 días futura no fue rechazada';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('22023','22008') THEN
      RAISE NOTICE '#9 OK: fecha futura rechazada (%)', SQLERRM;
    ELSE
      RAISE EXCEPTION '#9 FAIL inesperado: % %', SQLSTATE, SQLERRM;
    END IF;
  END;

  -- Fecha demasiado vieja (1970)
  BEGIN
    PERFORM register_expense(v_uid, 'Test fecha vieja', 100, 'Otros', 'receipt-text', '1970-01-01');
    RAISE EXCEPTION '#9 FAIL: fecha 1970 no fue rechazada';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('22023','22008') THEN
      RAISE NOTICE '#9 OK: fecha pre-2000 rechazada (%)', SQLERRM;
    ELSE
      RAISE EXCEPTION '#9 FAIL inesperado: % %', SQLSTATE, SQLERRM;
    END IF;
  END;
END $$;
ROLLBACK;

-- =====================================================================
-- Caso 4: chat_messages.session_id default = uuid
-- =====================================================================
BEGIN;
DO $$
DECLARE
  v_uid UUID;
  v_def TEXT;
  v_session UUID;
BEGIN
  SELECT column_default INTO v_def
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='chat_messages' AND column_name='session_id';

  IF v_def IS NULL OR v_def NOT LIKE '%gen_random_uuid%' THEN
    RAISE EXCEPTION '#12 FAIL: session_id default = %, esperado contener gen_random_uuid', v_def;
  END IF;
  RAISE NOTICE '#12 OK: session_id default es gen_random_uuid (%)', v_def;

  -- Insertar sin session_id explícito y verificar que se generó uno.
  SELECT id INTO v_uid FROM profiles LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE NOTICE '#12 SKIP: no hay profile';
    RETURN;
  END IF;

  INSERT INTO chat_messages (user_id, role, content, prompt_version)
  VALUES (v_uid, 'user', 'rg002 session test', 'regression.v2')
  RETURNING session_id INTO v_session;

  IF v_session IS NULL THEN
    RAISE EXCEPTION '#12 FAIL: insert sin session_id quedó NULL';
  END IF;
  RAISE NOTICE '#12 OK: insert sin session_id se completó con %', v_session;
END $$;
ROLLBACK;

\echo '====================================================='
\echo ' regression_002 terminó. Si NOTICE = OK en todos, pasa.'
\echo '====================================================='
