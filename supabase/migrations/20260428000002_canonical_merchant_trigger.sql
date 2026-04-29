-- 20260428000002_canonical_merchant_trigger.sql
--
-- Cuarta tanda de fixes del TEST_REPORT (2026-04-22). Cubre:
--
--   #11 BAJO: canonical_merchant es NULL en muchas transacciones.
--             Hoy 14/30 rows tienen NULL — imposible agrupar gasto
--             por comercio en analytics ("¿cuánto gasté en Jerónimo
--             Martins este mes?" no se puede contestar si la columna
--             está medio poblada).
--
-- Diseño:
--   1. `canonicalize_merchant(text) → text`: función IMMUTABLE pura
--      (lower + trim + strip puntuación común + collapse espacios).
--      Tildes se preservan (es app española).
--   2. Trigger BEFORE INSERT/UPDATE en transactions:
--      - INSERT: si canonical_merchant viene NULL/vacío, calcular.
--        Si viene explícito (ej. RPCs que setean 'traslado_bolsillos'),
--        respetarlo.
--      - UPDATE: si cambió `merchant` Y el caller no tocó canonical,
--        recomputar. Si tocó canonical, respetarlo.
--   3. Backfill: poblar todos los rows con canonical_merchant NULL.
--
-- Cobertura: tests/regressions/regression_003_canonical_merchant.sql.

-- =====================================================================
-- 1) Función pura de normalización
-- =====================================================================
-- IMMUTABLE para que pueda usarse en índices funcionales si más
-- adelante queremos uno: CREATE INDEX ... ON transactions
-- (user_id, canonicalize_merchant(merchant)).
--
-- Strategy:
--   - lower(): "ABC S.A." → "abc s.a."
--   - translate(...): elimina puntuación frecuente sin tocar tildes
--     ni el guion (mantenemos "comboy-pizza" como un solo token).
--   - regexp_replace(\s+, ' '): colapsa espacios.
--   - btrim: limpia bordes.
--   - coalesce(...,''): NULL-safe.
CREATE OR REPLACE FUNCTION public.canonicalize_merchant(p_merchant text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(
    regexp_replace(
      lower(
        translate(
          coalesce(p_merchant, ''),
          '.,;:¡!¿?"''`',
          ''
        )
      ),
      '\s+', ' ', 'g'
    )
  );
$$;

COMMENT ON FUNCTION public.canonicalize_merchant(text) IS
  'Normaliza un nombre de comercio: lowercase, strip puntuación común, collapse espacios. Preserva tildes y guiones. IMMUTABLE; OK para índices funcionales.';


-- =====================================================================
-- 2) Trigger function
-- =====================================================================
-- INSERT: si canonical_merchant viene NULL o vacío, lo calculamos.
--         Si el caller pasó algo (RPC interno: 'traslado_bolsillos',
--         'ingreso_nuevo', etc.) lo respetamos.
-- UPDATE: si NEW.merchant difiere de OLD.merchant Y el caller no
--         modificó canonical_merchant en este mismo UPDATE,
--         recalculamos. Si el caller cambió canonical, lo respetamos.
CREATE OR REPLACE FUNCTION public.transactions_set_canonical_merchant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.canonical_merchant IS NULL OR btrim(NEW.canonical_merchant) = '' THEN
      NEW.canonical_merchant := public.canonicalize_merchant(NEW.merchant);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Si el merchant cambió y el caller NO tocó canonical → recompute.
    IF NEW.merchant IS DISTINCT FROM OLD.merchant
       AND NEW.canonical_merchant IS NOT DISTINCT FROM OLD.canonical_merchant THEN
      NEW.canonical_merchant := public.canonicalize_merchant(NEW.merchant);
    END IF;
    -- Caso especial: si canonical pasa a NULL pero merchant existe → recompute.
    IF NEW.canonical_merchant IS NULL AND NEW.merchant IS NOT NULL THEN
      NEW.canonical_merchant := public.canonicalize_merchant(NEW.merchant);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.transactions_set_canonical_merchant() IS
  'Trigger BEFORE INSERT/UPDATE de transactions. Rellena canonical_merchant si no se pasó explícito; recalcula si merchant cambia.';


-- =====================================================================
-- 3) Trigger
-- =====================================================================
DROP TRIGGER IF EXISTS trg_transactions_set_canonical ON public.transactions;

CREATE TRIGGER trg_transactions_set_canonical
BEFORE INSERT OR UPDATE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.transactions_set_canonical_merchant();


-- =====================================================================
-- 4) Backfill
-- =====================================================================
-- Poblar todos los rows que hoy tienen canonical_merchant NULL.
-- NO tocamos los rows que ya tienen valor (por ejemplo
-- 'traslado_bolsillos', 'ingreso_nuevo' que setean los RPCs a mano).
UPDATE public.transactions
SET canonical_merchant = public.canonicalize_merchant(merchant)
WHERE canonical_merchant IS NULL;


-- =====================================================================
-- 5) Documentar la columna ahora que tiene contrato real
-- =====================================================================
COMMENT ON COLUMN public.transactions.canonical_merchant IS
  'Forma normalizada de merchant para agrupar/buscar (lowercase, sin puntuación, espacios colapsados). Se rellena automáticamente vía trigger transactions_set_canonical_merchant; los RPCs internos pueden setearla explícitamente para labels especiales (traslado_bolsillos, ingreso_nuevo).';
