const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/EXPO_PUBLIC_SUPABASE_URL=(.*)/)[1];
const key = env.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1];
const supabase = createClient(url, key);

const sql = `
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

  INSERT INTO transactions (user_id, amount, category, merchant, canonical_merchant, date_string, status, cycle_id, metadata)
  VALUES (p_user_id, p_amount, 'Ingreso', p_merchant, p_merchant, to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'completed', v_cycle_id, jsonb_build_object('mode', p_mode)) RETURNING id INTO v_tx_id;

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
`;

supabase.rpc('execute_sql', { sql }).then(console.log).catch(console.error);
