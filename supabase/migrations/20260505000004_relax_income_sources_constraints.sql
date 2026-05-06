-- 20260505000004_relax_income_sources_constraints.sql
-- Relax constraints on income_sources to support variable income and onboarding edge cases.

-- 1. Relax amount constraint (allow 0 for variable income sources)
ALTER TABLE public.income_sources DROP CONSTRAINT IF EXISTS income_sources_amount_check;
ALTER TABLE public.income_sources ADD CONSTRAINT income_sources_amount_check CHECK (amount >= 0);

-- 2. Make next_date nullable (variable income sources don't have a next date)
ALTER TABLE public.income_sources ALTER COLUMN next_date DROP NOT NULL;

-- 3. Add unique constraint on pockets(user_id, category) to allow clean upserts
-- This helps if onboarding is retried or if categories are managed strictly.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'pockets_user_id_category_key'
    ) THEN
        ALTER TABLE public.pockets ADD CONSTRAINT pockets_user_id_category_key UNIQUE (user_id, category);
    END IF;
END $$;

COMMENT ON TABLE public.income_sources IS 'Fuentes de ingresos. Relaxed constraints for variable income support.';
