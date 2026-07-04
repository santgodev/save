-- 1. Create user_budget_cycles table
CREATE TABLE IF NOT EXISTS public.user_budget_cycles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  start_date timestamp with time zone NOT NULL DEFAULT now(),
  end_date timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.user_budget_cycles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view their own cycles" ON public.user_budget_cycles FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert their own cycles" ON public.user_budget_cycles FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their own cycles" ON public.user_budget_cycles FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete their own cycles" ON public.user_budget_cycles FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS cycle_id uuid REFERENCES public.user_budget_cycles(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION get_spanish_month(m int) RETURNS text AS $$
BEGIN
  RETURN (ARRAY['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'])[m];
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  v_user record;
  v_month record;
  v_cycle_id uuid;
BEGIN
  FOR v_user IN SELECT id FROM profiles LOOP
    FOR v_month IN 
      SELECT DISTINCT EXTRACT(YEAR FROM date_string::date) as y, EXTRACT(MONTH FROM date_string::date) as m
      FROM transactions WHERE user_id = v_user.id ORDER BY y, m
    LOOP
      SELECT id INTO v_cycle_id FROM user_budget_cycles
      WHERE user_id = v_user.id AND name = get_spanish_month(v_month.m::int) || ' ' || v_month.y::int LIMIT 1;

      IF v_cycle_id IS NULL THEN
        INSERT INTO user_budget_cycles (user_id, name, start_date, end_date)
        VALUES (v_user.id, get_spanish_month(v_month.m::int) || ' ' || v_month.y::int, make_date(v_month.y::int, v_month.m::int, 1)::timestamp, (make_date(v_month.y::int, v_month.m::int, 1) + interval '1 month' - interval '1 second')::timestamp)
        RETURNING id INTO v_cycle_id;
      END IF;

      UPDATE transactions SET cycle_id = v_cycle_id
      WHERE user_id = v_user.id AND EXTRACT(YEAR FROM date_string::date) = v_month.y AND EXTRACT(MONTH FROM date_string::date) = v_month.m AND cycle_id IS NULL;
    END LOOP;

    UPDATE user_budget_cycles SET end_date = NULL
    WHERE user_id = v_user.id AND EXTRACT(YEAR FROM start_date) = EXTRACT(YEAR FROM now()) AND EXTRACT(MONTH FROM start_date) = EXTRACT(MONTH FROM now());
      
    IF NOT FOUND THEN
      INSERT INTO user_budget_cycles (user_id, name, start_date, end_date)
      VALUES (v_user.id, get_spanish_month(EXTRACT(MONTH FROM now())::int) || ' ' || EXTRACT(YEAR FROM now())::int, date_trunc('month', now()), NULL);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_cycle_state(p_cycle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_cycle record;
  v_income numeric;
  v_spent numeric;
  v_alloc_total numeric;
  v_avail_total numeric;
  v_pockets jsonb;
  v_top_merch jsonb;
  v_prev_cycle record;
  v_prev_income numeric := 0;
  v_prev_spent numeric := 0;
BEGIN
  SELECT * INTO v_cycle FROM user_budget_cycles WHERE id = p_cycle_id AND user_id = auth.uid();
  IF v_cycle IS NULL THEN RAISE EXCEPTION 'Ciclo no encontrado o no autorizado'; END IF;
  v_user_id := v_cycle.user_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_income FROM transactions WHERE cycle_id = p_cycle_id AND category = 'Ingreso';

  SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_spent FROM transactions
  WHERE cycle_id = p_cycle_id AND amount < 0 AND category NOT IN ('Ingreso','Traslado') AND COALESCE(metadata->>'type','') NOT IN ('internal_transfer_out','internal_transfer_in');

  SELECT * INTO v_prev_cycle FROM user_budget_cycles
  WHERE user_id = v_user_id AND end_date <= v_cycle.start_date AND id != p_cycle_id ORDER BY end_date DESC LIMIT 1;

  IF v_prev_cycle IS NOT NULL THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_prev_income FROM transactions WHERE cycle_id = v_prev_cycle.id AND category = 'Ingreso';
    SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_prev_spent FROM transactions
    WHERE cycle_id = v_prev_cycle.id AND amount < 0 AND category NOT IN ('Ingreso','Traslado') AND COALESCE(metadata->>'type','') NOT IN ('internal_transfer_out','internal_transfer_in');
  END IF;

  WITH spent_by_cat AS (
    SELECT category, SUM(ABS(amount)) AS spent_month FROM transactions
    WHERE cycle_id = p_cycle_id AND amount < 0 AND category NOT IN ('Ingreso','Traslado') AND COALESCE(metadata->>'type','') NOT IN ('internal_transfer_out','internal_transfer_in') GROUP BY category
  )
  SELECT jsonb_agg(
      jsonb_build_object(
        'id', p.id, 'name', p.name, 'category', p.category, 'icon', p.icon, 'is_default_free', p.is_default_free,
        'allocated', p.allocated_budget, 'available', p.allocated_budget - COALESCE(s.spent_month, 0),
        'spent_month', COALESCE(s.spent_month, 0),
        'pct_used', CASE WHEN p.allocated_budget > 0 THEN ROUND((COALESCE(s.spent_month,0) / p.allocated_budget * 100)::numeric, 2) ELSE NULL END
      ) ORDER BY p.allocated_budget DESC
    ),
    SUM(p.allocated_budget), SUM(p.allocated_budget - COALESCE(s.spent_month, 0))
  INTO v_pockets, v_alloc_total, v_avail_total
  FROM pockets p LEFT JOIN spent_by_cat s ON s.category = p.category WHERE p.user_id = v_user_id;

  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'total')::numeric DESC), '[]'::jsonb) INTO v_top_merch
  FROM (
    SELECT jsonb_build_object('merchant', canonical_merchant, 'display', MIN(merchant), 'total', SUM(ABS(amount)), 'count', COUNT(*)) AS t
    FROM transactions WHERE cycle_id = p_cycle_id AND amount < 0 AND category NOT IN ('Ingreso','Traslado') AND COALESCE(metadata->>'type','') NOT IN ('internal_transfer_out','internal_transfer_in') AND canonical_merchant IS NOT NULL
    GROUP BY canonical_merchant ORDER BY SUM(ABS(amount)) DESC LIMIT 5
  ) sub;

  RETURN jsonb_build_object(
    'cycle_id', v_cycle.id, 'cycle_name', v_cycle.name, 'start_date', v_cycle.start_date, 'end_date', v_cycle.end_date, 'is_active', v_cycle.end_date IS NULL,
    'income_month', v_income, 'spent_month', v_spent, 'net_month', v_income - v_spent, 'allocated_total', COALESCE(v_alloc_total, 0), 'available_total', COALESCE(v_avail_total, 0),
    'pockets', COALESCE(v_pockets, '[]'::jsonb), 'top_merchants', v_top_merch, 'previous_month', jsonb_build_object('name', v_prev_cycle.name, 'income', v_prev_income, 'spent', v_prev_spent, 'net', v_prev_income - v_prev_spent)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cycle_state(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.close_and_start_new_cycle(p_new_cycle_name text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_current_cycle record;
  v_new_cycle_id uuid;
  v_default_name text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;

  SELECT * INTO v_current_cycle FROM user_budget_cycles WHERE user_id = v_user_id AND end_date IS NULL LIMIT 1;

  IF v_current_cycle IS NOT NULL THEN
    UPDATE user_budget_cycles SET end_date = now() WHERE id = v_current_cycle.id;
  END IF;

  IF p_new_cycle_name IS NULL THEN
    v_default_name := (ARRAY['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'])[EXTRACT(MONTH FROM now())::int] || ' ' || EXTRACT(YEAR FROM now())::int;
    IF EXISTS(SELECT 1 FROM user_budget_cycles WHERE user_id = v_user_id AND name = v_default_name) THEN
      v_default_name := v_default_name || ' (Nuevo)';
    END IF;
  ELSE
    v_default_name := p_new_cycle_name;
  END IF;

  INSERT INTO user_budget_cycles (user_id, name, start_date, end_date) VALUES (v_user_id, v_default_name, now(), NULL) RETURNING id INTO v_new_cycle_id;
  RETURN v_new_cycle_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_and_start_new_cycle(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.register_income(
  p_user_id uuid, p_amount numeric, p_distribution jsonb, p_mode text DEFAULT 'equal', p_merchant text DEFAULT 'Depósito de Capital', p_cycle_mode text DEFAULT 'accumulate'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_tx_id UUID; v_key TEXT; v_add_amt NUMERIC; v_total_dist NUMERIC := 0; v_remainder NUMERIC := 0; v_libre_id UUID; v_full_dist JSONB; v_cycle_id UUID;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Monto inválido'; END IF;
  
  IF p_cycle_mode = 'start_fresh' THEN
    v_cycle_id := close_and_start_new_cycle();
  ELSE
    SELECT id INTO v_cycle_id FROM user_budget_cycles WHERE user_id = p_user_id AND end_date IS NULL LIMIT 1;
    IF v_cycle_id IS NULL THEN v_cycle_id := close_and_start_new_cycle(); END IF;
  END IF;

  INSERT INTO transactions (user_id, amount, category, merchant, canonical_merchant, type, date_string, status, cycle_id, metadata)
  VALUES (p_user_id, p_amount, 'Ingreso', p_merchant, p_merchant, 'deposit', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'completed', v_cycle_id, jsonb_build_object('mode', p_mode)) RETURNING id INTO v_tx_id;

  v_full_dist := COALESCE(p_distribution, '{}'::jsonb);

  FOR v_key IN SELECT jsonb_object_keys(p_distribution) LOOP
    v_add_amt := (p_distribution->>v_key)::numeric;
    IF v_add_amt > 0 THEN
      UPDATE pockets SET allocated_budget = COALESCE(allocated_budget, 0) + v_add_amt, updated_at = now() WHERE id = v_key::uuid AND user_id = p_user_id;
      v_total_dist := v_total_dist + v_add_amt;
    END IF;
  END LOOP;

  v_remainder := p_amount - v_total_dist;
  IF v_remainder > 0 THEN
    SELECT id INTO v_libre_id FROM pockets WHERE user_id = p_user_id AND is_default_free = true LIMIT 1;
    IF v_libre_id IS NOT NULL THEN
      UPDATE pockets SET allocated_budget = COALESCE(allocated_budget, 0) + v_remainder, updated_at = now() WHERE id = v_libre_id;
      v_full_dist := jsonb_set(v_full_dist, array[v_libre_id::text], to_jsonb( COALESCE((v_full_dist->>v_libre_id::text)::numeric, 0) + v_remainder ));
    END IF;
  END IF;

  UPDATE transactions SET metadata = jsonb_set(metadata, '{distribution}', v_full_dist) WHERE id = v_tx_id;

  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx_id, 'cycle_id', v_cycle_id);
END;
$$;
