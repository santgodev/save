-- 20260428000003_unified_monthly_state.sql
--
-- Quinta tanda de fixes — esta vez de UX/consistencia, no de bugs.
--
-- PROBLEMA:
--   Hoy hay 3 fuentes que dicen "ingresos del mes" y 2 que dicen "disponible
--   por bolsillo". El cliente además resta el gasto del mes a `pockets.budget`,
--   que YA viene decrementado por register_expense → doble resta. Resultado:
--   cada pantalla muestra un número diferente.
--
-- SOLUCIÓN:
--   1. Una RPC `get_monthly_state(p_user_id, p_year, p_month)` que devuelva
--      TODO lo que la app necesita para un mes: ingreso, gasto, neto,
--      bolsillos (plan / disponible / gastado), top merchants y
--      comparación con el mes anterior.
--   2. Borrar `user_monthly_income` (tabla vacía hoy) y `profiles.monthly_income`
--      (NULL hoy). La fuente única de "ingreso del mes" es ahora
--      SUM(transactions WHERE category='Ingreso' del mes).
--   3. Documentar contrato: pockets.budget = "saldo disponible cacheado por
--      register_expense". Cliente NO debe restar gasto encima.

-- =====================================================================
-- 1) Eliminar fuentes redundantes
-- =====================================================================

-- 1a. profiles.monthly_income — eliminamos columna y su CHECK previo.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_monthly_income_positive;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS monthly_income;

-- 1b. user_monthly_income — drop completo. Tabla vacía verificada antes.
DROP TABLE IF EXISTS public.user_monthly_income;


-- =====================================================================
-- 2) RPC get_monthly_state — la única fuente de verdad
-- =====================================================================
-- Devuelve un JSONB con TODO lo que la pantalla y el chat necesitan
-- para mostrar un mes coherente. Si una pantalla quiere otro número,
-- está mal — debe pedirlo a este RPC.
CREATE OR REPLACE FUNCTION public.get_monthly_state(
  p_user_id uuid,
  p_year    int DEFAULT NULL,   -- NULL = año actual
  p_month   int DEFAULT NULL    -- NULL = mes actual (1..12)
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $function$
DECLARE
  v_year         int;
  v_month        int;
  v_month_start  date;
  v_month_end    date;
  v_prev_start   date;
  v_prev_end     date;
  v_income       numeric;
  v_spent        numeric;
  v_pockets      jsonb;
  v_top_merch    jsonb;
  v_alloc_total  numeric;
  v_avail_total  numeric;
  v_prev_income  numeric;
  v_prev_spent   numeric;
  v_currency     text;
BEGIN
  v_year  := COALESCE(p_year,  EXTRACT(YEAR  FROM CURRENT_DATE)::int);
  v_month := COALESCE(p_month, EXTRACT(MONTH FROM CURRENT_DATE)::int);

  IF v_month < 1 OR v_month > 12 THEN
    RAISE EXCEPTION 'Mes inválido: %, debe ser 1..12', v_month
      USING ERRCODE = '22023';
  END IF;

  v_month_start := make_date(v_year, v_month, 1);
  v_month_end   := (v_month_start + INTERVAL '1 month')::date;

  IF v_month = 1 THEN
    v_prev_start := make_date(v_year - 1, 12, 1);
  ELSE
    v_prev_start := make_date(v_year, v_month - 1, 1);
  END IF;
  v_prev_end := v_month_start;

  SELECT COALESCE(preferred_currency, 'COP') INTO v_currency
  FROM profiles WHERE id = p_user_id;
  v_currency := COALESCE(v_currency, 'COP');

  -- Ingresos del mes: SUM de transactions tipo Ingreso (la única fuente).
  SELECT COALESCE(SUM(amount), 0) INTO v_income
  FROM transactions
  WHERE user_id = p_user_id
    AND category = 'Ingreso'
    AND date_string::date >= v_month_start
    AND date_string::date <  v_month_end;

  -- Gastos del mes: ABS de las negativas excluyendo Ingreso y Traslado
  -- (los traslados no son gasto real).
  SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_spent
  FROM transactions
  WHERE user_id = p_user_id
    AND amount < 0
    AND category NOT IN ('Ingreso','Traslado')
    AND date_string::date >= v_month_start
    AND date_string::date <  v_month_end;

  -- Mismo cálculo para mes anterior (comparativa).
  SELECT COALESCE(SUM(amount), 0) INTO v_prev_income
  FROM transactions
  WHERE user_id = p_user_id
    AND category = 'Ingreso'
    AND date_string::date >= v_prev_start
    AND date_string::date <  v_prev_end;

  SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_prev_spent
  FROM transactions
  WHERE user_id = p_user_id
    AND amount < 0
    AND category NOT IN ('Ingreso','Traslado')
    AND date_string::date >= v_prev_start
    AND date_string::date <  v_prev_end;

  -- Totales por bolsillo: plan (allocated), disponible (budget) y
  -- gastado del mes (calculado de transactions). pct_used = gastado / plan.
  WITH spent_by_cat AS (
    SELECT
      category,
      SUM(ABS(amount)) AS spent_month
    FROM transactions
    WHERE user_id = p_user_id
      AND amount < 0
      AND category NOT IN ('Ingreso','Traslado')
      AND date_string::date >= v_month_start
      AND date_string::date <  v_month_end
    GROUP BY category
  )
  SELECT
    jsonb_agg(
      jsonb_build_object(
        'id',         p.id,
        'name',       p.name,
        'category',   p.category,
        'icon',       p.icon,
        'allocated',  p.allocated_budget,
        'available',  p.budget,
        'spent_month', COALESCE(s.spent_month, 0),
        'pct_used',
          CASE WHEN p.allocated_budget > 0
               THEN ROUND((COALESCE(s.spent_month,0) / p.allocated_budget * 100)::numeric, 2)
               ELSE NULL END
      ) ORDER BY p.allocated_budget DESC
    ),
    SUM(p.allocated_budget),
    SUM(p.budget)
  INTO v_pockets, v_alloc_total, v_avail_total
  FROM pockets p
  LEFT JOIN spent_by_cat s ON s.category = p.category
  WHERE p.user_id = p_user_id;

  -- Top 5 comercios del mes (usa canonical_merchant que ya está poblado).
  SELECT COALESCE(
    jsonb_agg(t ORDER BY (t->>'total')::numeric DESC),
    '[]'::jsonb
  )
  INTO v_top_merch
  FROM (
    SELECT jsonb_build_object(
      'merchant', canonical_merchant,
      'display',  MIN(merchant),
      'total',    SUM(ABS(amount)),
      'count',    COUNT(*)
    ) AS t
    FROM transactions
    WHERE user_id = p_user_id
      AND amount < 0
      AND category NOT IN ('Ingreso','Traslado')
      AND date_string::date >= v_month_start
      AND date_string::date <  v_month_end
      AND canonical_merchant IS NOT NULL
    GROUP BY canonical_merchant
    ORDER BY SUM(ABS(amount)) DESC
    LIMIT 5
  ) sub;

  RETURN jsonb_build_object(
    'year',             v_year,
    'month',            v_month,
    'month_start',      v_month_start,
    'month_end',        v_month_end,
    'currency',         v_currency,
    'income_month',     v_income,
    'spent_month',      v_spent,
    'net_month',        v_income - v_spent,
    'allocated_total',  COALESCE(v_alloc_total, 0),
    'available_total',  COALESCE(v_avail_total, 0),
    'pockets',          COALESCE(v_pockets, '[]'::jsonb),
    'top_merchants',    v_top_merch,
    'previous_month', jsonb_build_object(
      'year',   EXTRACT(YEAR FROM v_prev_start)::int,
      'month',  EXTRACT(MONTH FROM v_prev_start)::int,
      'income', v_prev_income,
      'spent',  v_prev_spent,
      'net',    v_prev_income - v_prev_spent
    )
  );
END;
$function$;

COMMENT ON FUNCTION public.get_monthly_state(uuid, int, int) IS
  'Fuente ÚNICA de verdad del estado financiero de un mes. Devuelve income, spent, neto, bolsillos (plan/disponible/gastado), top merchants y comparación mes anterior. Usado por Dashboard, Pockets y chat-advisor — todos deben mostrar el mismo número.';

GRANT EXECUTE ON FUNCTION public.get_monthly_state(uuid, int, int) TO authenticated;


-- =====================================================================
-- 3) Reafirmar contrato de pockets.budget
-- =====================================================================
COMMENT ON COLUMN public.pockets.budget IS
  'Saldo DISPONIBLE hoy en el bolsillo. Cache decrementado por register_expense / transfer_between_pockets. El cliente NO debe restarle gasto del mes encima — eso causa doble resta. Para "cuánto queda" leer este campo directo.';

COMMENT ON COLUMN public.pockets.allocated_budget IS
  'Plan asignado al bolsillo (cuánto te asignaste al inicio del mes). NO se decrementa con gastos. Se modifica explícitamente al "reasignar presupuesto".';
