-- 20260428000001_data_quality_guards.sql
--
-- Tercera tanda de fixes del TEST_REPORT (2026-04-22). Cubre cuatro
-- bugs de calidad de datos que ya están afectando al usuario actual o
-- que romperán al asesor el día que tengamos N usuarios:
--
--   #7  CRÍTICO-de-producto:  preferred_currency default 'USD' en una
--                             app colombiana — confunde al UI y al advisor.
--   #8  ALTO:                 monthly_income default 0 — el LLM no puede
--                             razonar "¿alcanzo a fin de mes?" si el ingreso
--                             es 0. Hoy santgodev tiene 0 declarado.
--   #9  MEDIO:                date_string sin validación. Hoy hay un row
--                             de SIIGO con '2019/06/19' (formato con /).
--                             Mañana puede entrar '2099-12-31' o '1970-01-01'.
--   #12 MEDIO:                chat_messages.session_id null por defecto.
--                             Hoy 2 mensajes históricos quedaron sin
--                             session — imposible agrupar la conversación.
--
-- Cobertura: tests/regressions/regression_002_data_quality.sql.
--
-- IMPORTANTE: esta migración hace cuatro cosas independientes en cuatro
-- bloques separados. Si una falla, idealmente la otra puede aplicarse
-- después. Pero como Postgres ejecuta una migración como una sola
-- transacción, el todo o nada está garantizado.

-- =====================================================================
-- BUG #7 — preferred_currency
-- =====================================================================
-- 7a. Backfill seguro: cualquier perfil con USD o NULL → COP.
--     Es app colombiana; si en el futuro abrimos a otro mercado, ese flujo
--     deberá setear la moneda explícitamente al onboarding.
UPDATE public.profiles
SET preferred_currency = 'COP'
WHERE preferred_currency IS NULL OR preferred_currency = 'USD';

-- 7b. Default oficial: COP.
ALTER TABLE public.profiles
  ALTER COLUMN preferred_currency SET DEFAULT 'COP';

-- 7c. Constraint laxa: COP por ahora, USD/EUR para apertura futura.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_preferred_currency_valid;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_preferred_currency_valid
  CHECK (preferred_currency IS NULL OR preferred_currency IN ('COP','USD','EUR'));

COMMENT ON COLUMN public.profiles.preferred_currency IS
  'Moneda preferida del usuario para mostrar montos. Default COP (app colombiana). Permite COP/USD/EUR.';


-- =====================================================================
-- BUG #8 — monthly_income
-- =====================================================================
-- 8a. Backfill: 0 → NULL. NULL ahora significa "no respondió todavía";
--     0 dejaría de tener sentido (si alguien gana 0 el problema es otro).
UPDATE public.profiles
SET monthly_income = NULL
WHERE monthly_income = 0;

-- 8b. Default oficial: NULL (más honesto que 0).
ALTER TABLE public.profiles
  ALTER COLUMN monthly_income DROP DEFAULT;

-- 8c. Constraint: si tiene valor, debe ser positivo.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_monthly_income_positive;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_monthly_income_positive
  CHECK (monthly_income IS NULL OR monthly_income > 0);

COMMENT ON COLUMN public.profiles.monthly_income IS
  'Ingreso mensual declarado. NULL = no declarado todavía. >0 = declarado. 0 NO se permite (no es semántico).';


-- =====================================================================
-- BUG #9 — date_string
-- =====================================================================
-- 9a. Backfill del row histórico de SIIGO: '2019/06/19' → '2019-06-19'.
--     Si aparece otro formato podrido, lo migraremos en futuras tandas;
--     hoy sólo conocemos este caso (queries en tests/RESULTS.md).
UPDATE public.transactions
SET date_string = REPLACE(date_string, '/', '-')
WHERE date_string ~ '^\d{4}/\d{2}/\d{2}$';

-- 9b. CHECK de formato: la columna sólo acepta YYYY-MM-DD (parseable como date).
--     Nota: NO ponemos rango de fecha en la columna porque hay rows
--     históricos legítimamente viejos (ej. SIIGO 2019). El rango lo
--     hace cumplir register_expense para inserts NUEVOS.
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_date_string_format;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_date_string_format
  CHECK (date_string ~ '^\d{4}-\d{2}-\d{2}$');

COMMENT ON COLUMN public.transactions.date_string IS
  'Fecha de la transacción en formato YYYY-MM-DD. CHECK de formato; rango lo valida register_expense para inserts nuevos.';

-- 9c. register_expense: validar fecha legible + rango razonable
--     (>= 2000-01-01, <= today + 1 día). Mantenemos el resto del cuerpo
--     idéntico al safety_guards (fallback Otros, monto positivo, merchant
--     no vacío, etc.).
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
  v_parsed        DATE;
BEGIN
  -- Guards de entrada (heredados de safety_guards 2026-04-22)
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

  -- Guards nuevos de fecha (Bug #9).
  -- Si llega NULL → usar hoy.
  -- Si llega texto → debe matchear YYYY-MM-DD y caer en rango razonable.
  IF p_date_string IS NULL THEN
    v_today := to_char(NOW(), 'YYYY-MM-DD');
  ELSE
    IF p_date_string !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'Formato de fecha inválido (esperado YYYY-MM-DD, recibido: %)', p_date_string
        USING ERRCODE = '22007';  -- invalid_datetime_format
    END IF;

    BEGIN
      v_parsed := p_date_string::DATE;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Fecha no parseable: %', p_date_string
        USING ERRCODE = '22008';  -- datetime_field_overflow
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
      RAISE EXCEPTION 'No existe bolsillo para la categoría "%" ni para "Otros". Créalo primero.', p_category
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Insertar transacción en la categoría efectiva.
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

COMMENT ON FUNCTION public.register_expense(uuid, text, numeric, text, text, text, jsonb) IS
  'Registra gasto. v3 (data_quality_guards 2026-04-28). Valida fecha YYYY-MM-DD y rango 2000..today+1.';


-- =====================================================================
-- BUG #12 — chat_messages.session_id
-- =====================================================================
-- 12a. Backfill: a los mensajes históricos sin session_id les damos UN
--      session_id por usuario, agrupando en buckets de 30 minutos.
--      Esto es heurístico pero suficiente para no perder los datos.
--      Para futuros, el cliente y el edge function deberían pasarlo
--      explícitamente; el default es backup.
UPDATE public.chat_messages cm
SET session_id = grouped.bucket_id
FROM (
  SELECT
    id,
    -- Un session_id determinista por bucket: hash del user_id+bucket de 30 min.
    md5(user_id::text || ':' ||
        floor(extract(epoch from created_at) / 1800)::text)::uuid AS bucket_id
  FROM public.chat_messages
  WHERE session_id IS NULL
) AS grouped
WHERE cm.id = grouped.id;

-- 12b. Default oficial: gen_random_uuid().
ALTER TABLE public.chat_messages
  ALTER COLUMN session_id SET DEFAULT gen_random_uuid();

-- 12c. NOT NULL — todos los mensajes deben tener sesión.
ALTER TABLE public.chat_messages
  ALTER COLUMN session_id SET NOT NULL;

COMMENT ON COLUMN public.chat_messages.session_id IS
  'UUID de la sesión de chat. El cliente debería pasarlo siempre (uno por apertura del chat). Si no, el default lo genera. NOT NULL.';
