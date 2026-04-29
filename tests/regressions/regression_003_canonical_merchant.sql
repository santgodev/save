-- regression_003_canonical_merchant.sql
--
-- Cubre el bug #11 BAJO del TEST_REPORT (2026-04-22):
--   "canonical_merchant es null en todas las transacciones recientes."
--
-- Diseño de la solución:
--   - Función `canonicalize_merchant(text)` IMMUTABLE: lower + trim + strip
--     puntuación común + colapsar espacios.
--   - Trigger BEFORE INSERT/UPDATE en transactions que rellena
--     canonical_merchant si no se pasó explícito (preserva labels especiales
--     como 'ingreso_nuevo' o 'traslado_bolsillos' que RPCs setean a mano).
--   - Backfill de los rows existentes con canonical_merchant IS NULL.
--
-- Cómo correr:
--   psql $DB_URL -f tests/regressions/regression_003_canonical_merchant.sql
--   o copiar cada bloque y envolver en BEGIN/ROLLBACK vía MCP.

\echo '====================================================='
\echo ' regression_003_canonical_merchant.sql'
\echo '====================================================='

-- =====================================================================
-- Caso 1: la función canonicalize_merchant existe y normaliza correcto
-- =====================================================================
BEGIN;
DO $$
DECLARE
  v_out TEXT;
BEGIN
  -- a) lowercase + strip puntos
  v_out := canonicalize_merchant('HELADOS POPSY COMERCIAL ALLAN S.A.S.');
  IF v_out <> 'helados popsy comercial allan sas' THEN
    RAISE EXCEPTION '#11 FAIL: HELADOS POPSY ... esperado "helados popsy comercial allan sas", obtuve "%"', v_out;
  END IF;
  RAISE NOTICE '#11 OK (a): "HELADOS POPSY..." -> "%"', v_out;

  -- b) lowercase simple
  v_out := canonicalize_merchant('Tiendas ARA');
  IF v_out <> 'tiendas ara' THEN
    RAISE EXCEPTION '#11 FAIL: "Tiendas ARA" -> "%"', v_out;
  END IF;
  RAISE NOTICE '#11 OK (b): "Tiendas ARA" -> "%"', v_out;

  -- c) collapse de espacios múltiples + trim
  v_out := canonicalize_merchant('   El   Corral    ');
  IF v_out <> 'el corral' THEN
    RAISE EXCEPTION '#11 FAIL: trim/collapse -> "%"', v_out;
  END IF;
  RAISE NOTICE '#11 OK (c): "   El   Corral    " -> "%"', v_out;

  -- d) NULL-safe → string vacío
  v_out := canonicalize_merchant(NULL);
  IF v_out <> '' THEN
    RAISE EXCEPTION '#11 FAIL: NULL no devuelve string vacío, obtuve "%"', v_out;
  END IF;
  RAISE NOTICE '#11 OK (d): NULL -> ""';

  -- e) caracteres con tilde se preservan (es español, no queremos romper "Diversión")
  v_out := canonicalize_merchant('Ocio y Diversión');
  IF v_out <> 'ocio y diversión' THEN
    RAISE EXCEPTION '#11 FAIL: tildes rotas -> "%"', v_out;
  END IF;
  RAISE NOTICE '#11 OK (e): tildes preservadas: "%"', v_out;

  -- f) puntuación variada se elimina
  v_out := canonicalize_merchant('"COMBOY-PIZZA, S.A.S."');
  IF v_out <> 'comboy-pizza sas' THEN
    RAISE EXCEPTION '#11 FAIL: puntuación -> "%"', v_out;
  END IF;
  RAISE NOTICE '#11 OK (f): puntuación: "%"', v_out;
END $$;
ROLLBACK;

-- =====================================================================
-- Caso 2: el trigger rellena canonical_merchant en INSERT
-- =====================================================================
BEGIN;
DO $$
DECLARE
  v_uid UUID;
  v_canon TEXT;
BEGIN
  SELECT user_id INTO v_uid FROM pockets WHERE category = 'Otros' LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE NOTICE '#11 SKIP: no hay bolsillo Otros para correr el test';
    RETURN;
  END IF;

  -- Insert sin canonical_merchant explícito → trigger lo calcula
  INSERT INTO transactions (user_id, merchant, amount, category, icon, date_string)
  VALUES (v_uid, 'JERONIMO MARTINS Colombia S.A.S.', -100, 'Otros', 'receipt-text', '2026-04-28')
  RETURNING canonical_merchant INTO v_canon;

  IF v_canon <> 'jeronimo martins colombia sas' THEN
    RAISE EXCEPTION '#11 FAIL: trigger INSERT no normalizó. canonical = "%"', v_canon;
  END IF;
  RAISE NOTICE '#11 OK: trigger INSERT calculó "%"', v_canon;

  -- Insert pasando canonical_merchant explícito → trigger lo respeta
  INSERT INTO transactions (user_id, merchant, amount, category, icon, date_string, canonical_merchant)
  VALUES (v_uid, 'Traslado: A → B', 0, 'Otros', 'receipt-text', '2026-04-28', 'traslado_bolsillos')
  RETURNING canonical_merchant INTO v_canon;

  IF v_canon <> 'traslado_bolsillos' THEN
    RAISE EXCEPTION '#11 FAIL: trigger INSERT pisó canonical explícito. canonical = "%"', v_canon;
  END IF;
  RAISE NOTICE '#11 OK: trigger INSERT preservó canonical explícito';
END $$;
ROLLBACK;

-- =====================================================================
-- Caso 3: el trigger recalcula canonical en UPDATE si cambia merchant
-- =====================================================================
BEGIN;
DO $$
DECLARE
  v_uid UUID;
  v_tx_id UUID;
  v_canon TEXT;
BEGIN
  SELECT user_id INTO v_uid FROM pockets WHERE category = 'Otros' LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE NOTICE '#11 SKIP: no hay bolsillo Otros';
    RETURN;
  END IF;

  INSERT INTO transactions (user_id, merchant, amount, category, icon, date_string)
  VALUES (v_uid, 'Tienda Vieja', -50, 'Otros', 'receipt-text', '2026-04-28')
  RETURNING id INTO v_tx_id;

  -- a) Cambio el merchant; el trigger debe recalcular canonical.
  UPDATE transactions SET merchant = 'Tienda NUEVA S.A.' WHERE id = v_tx_id
    RETURNING canonical_merchant INTO v_canon;
  IF v_canon <> 'tienda nueva sa' THEN
    RAISE EXCEPTION '#11 FAIL: trigger UPDATE no recalculó al cambiar merchant. canonical = "%"', v_canon;
  END IF;
  RAISE NOTICE '#11 OK: trigger UPDATE recalculó "%"', v_canon;

  -- b) Cambio merchant Y canonical en el mismo UPDATE → respeta canonical explícito.
  UPDATE transactions
     SET merchant = 'Otra Cosa', canonical_merchant = 'manual_override'
   WHERE id = v_tx_id
   RETURNING canonical_merchant INTO v_canon;
  IF v_canon <> 'manual_override' THEN
    RAISE EXCEPTION '#11 FAIL: trigger UPDATE pisó canonical explícito. canonical = "%"', v_canon;
  END IF;
  RAISE NOTICE '#11 OK: trigger UPDATE respetó canonical explícito';
END $$;
ROLLBACK;

-- =====================================================================
-- Caso 4: backfill aplicado a rows existentes
-- =====================================================================
BEGIN;
DO $$
DECLARE
  v_null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_null_count
  FROM transactions
  WHERE canonical_merchant IS NULL;

  IF v_null_count > 0 THEN
    RAISE EXCEPTION '#11 FAIL: %% transacciones todavía tienen canonical_merchant = NULL', v_null_count;
  END IF;
  RAISE NOTICE '#11 OK: 0 transacciones con canonical_merchant NULL';
END $$;
ROLLBACK;

\echo '====================================================='
\echo ' regression_003 terminó. Si NOTICE = OK en todos, pasa.'
\echo '====================================================='
