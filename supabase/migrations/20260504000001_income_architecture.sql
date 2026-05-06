-- 20260504000001_income_architecture.sql
-- Implementación nivel Fintech robusta y consistente

-- =====================================================================
-- 0. Modificación en Pockets
-- =====================================================================
ALTER TABLE public.pockets ADD COLUMN IF NOT EXISTS is_default_free BOOLEAN DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS one_free_pocket_per_user 
ON public.pockets(user_id) WHERE is_default_free = true;

-- =====================================================================
-- 1. income_sources
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.income_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    frequency TEXT NOT NULL CHECK (frequency IN ('monthly', 'bi_weekly', 'weekly', 'one_time')),
    next_date DATE NOT NULL,
    distribution_rules JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS income_sources_user_id_idx ON public.income_sources(user_id);
CREATE INDEX IF NOT EXISTS income_sources_next_date_idx ON public.income_sources(next_date) WHERE is_active = true;

ALTER TABLE public.income_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS income_sources_all_own ON public.income_sources;
CREATE POLICY income_sources_all_own ON public.income_sources
FOR ALL USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

-- =====================================================================
-- 2. pending_income_events
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.pending_income_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES public.income_sources(id) ON DELETE CASCADE,
    expected_amount NUMERIC NOT NULL,
    expected_date DATE NOT NULL,
    distribution_snapshot JSONB DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'dismissed')),
    transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(source_id, expected_date)
);

CREATE INDEX IF NOT EXISTS pending_events_user_id_idx ON public.pending_income_events(user_id);

ALTER TABLE public.pending_income_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pending_events_all_own ON public.pending_income_events;
CREATE POLICY pending_events_all_own ON public.pending_income_events
FOR ALL USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

-- =====================================================================
-- 3. Logs
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.income_event_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.pending_income_events(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    amount NUMERIC,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 4. CRON
-- =====================================================================
CREATE OR REPLACE FUNCTION public.cron_generate_pending_incomes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    r RECORD;
    v_next DATE;
    v_snap JSONB;
BEGIN
    FOR r IN 
        SELECT id, user_id, name, amount, frequency, next_date, distribution_rules 
        FROM income_sources 
        WHERE is_active = true AND next_date <= CURRENT_DATE
    LOOP
        v_snap := jsonb_build_object(
            'amount', r.amount,
            'source_name', r.name,
            'distribution', r.distribution_rules
        );

        INSERT INTO pending_income_events (user_id, source_id, expected_amount, expected_date, distribution_snapshot)
        VALUES (r.user_id, r.id, r.amount, r.next_date, v_snap)
        ON CONFLICT (source_id, expected_date) DO NOTHING;

        v_next := r.next_date;
        WHILE v_next <= CURRENT_DATE LOOP
            IF r.frequency = 'monthly' THEN
                v_next := v_next + INTERVAL '1 month';
            ELSIF r.frequency = 'bi_weekly' THEN
                v_next := v_next + INTERVAL '14 days';
            ELSIF r.frequency = 'weekly' THEN
                v_next := v_next + INTERVAL '7 days';
            ELSE
                EXIT;
            END IF;
        END LOOP;

        IF r.frequency = 'one_time' THEN
            UPDATE income_sources 
            SET is_active = false, next_date = v_next, updated_at = NOW(), ended_at = NOW() 
            WHERE id = r.id;
        ELSE
            UPDATE income_sources 
            SET next_date = v_next, updated_at = NOW() 
            WHERE id = r.id;
        END IF;
    END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cron_generate_pending_incomes() FROM anon, authenticated;

-- =====================================================================
-- 5. register_income
-- =====================================================================
CREATE OR REPLACE FUNCTION public.register_income(
  p_user_id uuid,
  p_amount numeric,
  p_distribution jsonb,
  p_mode text DEFAULT 'equal',
  p_merchant text DEFAULT 'Depósito de Capital'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tx_id UUID;
  v_key TEXT;
  v_add_amt NUMERIC;
  v_total_dist NUMERIC := 0;
  v_remainder NUMERIC := 0;
  v_libre_id UUID;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Monto inválido';
  END IF;

  INSERT INTO transactions (user_id, merchant, amount, category, icon, date_string, metadata)
  VALUES (
    p_user_id, p_merchant, ABS(p_amount), 'Ingreso', 'trending-up',
    to_char(NOW(), 'YYYY-MM-DD'),
    jsonb_build_object('distribution', p_distribution)
  )
  RETURNING id INTO v_tx_id;

  FOR v_key IN SELECT key FROM jsonb_each_text(p_distribution) ORDER BY key
  LOOP
    v_add_amt := (p_distribution ->> v_key)::NUMERIC;

    IF v_add_amt IS NULL OR v_add_amt < 0 THEN
      RAISE EXCEPTION 'Monto inválido';
    END IF;

    UPDATE pockets 
    SET budget = budget + v_add_amt 
    WHERE id = v_key::UUID AND user_id = p_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pocket inválido';
    END IF;

    v_total_dist := v_total_dist + v_add_amt;
  END LOOP;

  v_remainder := ROUND(p_amount - v_total_dist, 2);

  IF v_remainder > 0 THEN
    SELECT id INTO v_libre_id 
    FROM pockets 
    WHERE user_id = p_user_id AND is_default_free = true 
    LIMIT 1;

    IF v_libre_id IS NOT NULL THEN
      UPDATE pockets SET budget = budget + v_remainder WHERE id = v_libre_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx_id);
END;
$$;

-- =====================================================================
-- 6. confirm_pending_income
-- =====================================================================
CREATE OR REPLACE FUNCTION public.confirm_pending_income(
    p_event_id UUID,
    p_actual_amount NUMERIC
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_event RECORD;
    v_rules JSONB;
    v_key TEXT;
    v_pct NUMERIC;
    v_dist_amount NUMERIC;
    v_distribution JSONB := '{}'::jsonb;
    v_total_pct NUMERIC := 0;
    v_res JSONB;
BEGIN
    SELECT * INTO v_event
    FROM pending_income_events
    WHERE id = p_event_id AND user_id = auth.uid()
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Evento no encontrado';
    END IF;

    IF v_event.status = 'confirmed' THEN
        RETURN jsonb_build_object('success', true, 'already_processed', true);
    END IF;

    IF p_actual_amount <= 0 THEN
        RAISE EXCEPTION 'Monto inválido';
    END IF;

    v_rules := v_event.distribution_snapshot->'distribution';

    IF jsonb_typeof(v_rules) <> 'object' THEN
        RAISE EXCEPTION 'Distribución inválida';
    END IF;

    SELECT SUM((value)::NUMERIC) INTO v_total_pct FROM jsonb_each_text(v_rules);

    IF v_total_pct > 100 THEN
        RAISE EXCEPTION 'Distribución > 100';
    END IF;

    FOR v_key IN SELECT key FROM jsonb_each_text(v_rules) ORDER BY key
    LOOP
        v_pct := (v_rules ->> v_key)::NUMERIC;

        IF v_pct < 0 OR v_pct > 100 THEN
            RAISE EXCEPTION 'Porcentaje inválido';
        END IF;

        v_dist_amount := ROUND(p_actual_amount * (v_pct / 100.0), 2);

        v_distribution := jsonb_set(v_distribution, ARRAY[v_key], to_jsonb(v_dist_amount));
    END LOOP;

    SELECT register_income(auth.uid(), p_actual_amount, v_distribution) INTO v_res;

    UPDATE pending_income_events
    SET status = 'confirmed',
        transaction_id = (v_res->>'transaction_id')::UUID,
        updated_at = NOW()
    WHERE id = p_event_id;

    INSERT INTO income_event_logs (event_id, action, amount, metadata)
    VALUES (
        p_event_id,
        'confirmed',
        p_actual_amount,
        jsonb_build_object(
            'expected', v_event.expected_amount,
            'actual', p_actual_amount,
            'delta', p_actual_amount - v_event.expected_amount
        )
    );

    RETURN v_res;
END;
$$;