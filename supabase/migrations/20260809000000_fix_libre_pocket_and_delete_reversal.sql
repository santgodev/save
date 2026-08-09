-- Fix: delete_transaction_with_reversal fallback pocket
-- En lugar de hardcodear category = 'Otros', busca el bolsillo con is_default_free = true.
-- Esto soporta el renombramiento del bolsillo a 'Libre' y cualquier nombre futuro.

CREATE OR REPLACE FUNCTION public.delete_transaction_with_reversal(p_tx_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_amount    NUMERIC;
  v_category  TEXT;
  v_pocket_id UUID;
  v_metadata  JSONB;
  v_type      TEXT;
  v_key       TEXT;
  v_sub_amt   NUMERIC;
  v_cycle_id  UUID;
  v_tx_count  INT;
  v_prev_cycle UUID;
  v_snapshot  JSONB;
  v_snap_item JSONB;
  v_cycle_reverted BOOLEAN := false;
  v_cycle_deleted BOOLEAN := false;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  SELECT amount, category, metadata, cycle_id
  INTO v_amount, v_category, v_metadata, v_cycle_id
  FROM transactions
  WHERE id = p_tx_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaccion no encontrada' USING ERRCODE = '42501';
  END IF;

  v_type := v_metadata ->> 'type';

  IF v_category = 'Ingreso' THEN
    IF v_metadata ? 'distribution' THEN
      FOR v_key IN SELECT key FROM jsonb_each_text(v_metadata->'distribution') ORDER BY key
      LOOP
        v_sub_amt := (v_metadata->'distribution'->>v_key)::NUMERIC;
        IF v_sub_amt IS NOT NULL AND v_sub_amt > 0 THEN
          UPDATE pockets 
          SET allocated_budget = GREATEST(0, allocated_budget - v_sub_amt)
          WHERE id = v_key::UUID AND user_id = p_user_id;
        END IF;
      END LOOP;
    END IF;
  ELSIF v_type = 'internal_transfer_out' THEN
    UPDATE pockets SET allocated_budget = allocated_budget + ABS(v_amount) WHERE id = (v_metadata->>'from_id')::UUID AND user_id = p_user_id;
    UPDATE pockets SET allocated_budget = GREATEST(0, allocated_budget - ABS(v_amount)) WHERE id = (v_metadata->>'to_id')::UUID AND user_id = p_user_id;
  ELSIF v_type = 'internal_transfer_in' THEN
    UPDATE pockets SET allocated_budget = GREATEST(0, allocated_budget - ABS(v_amount)) WHERE id = (v_metadata->>'to_id')::UUID AND user_id = p_user_id;
    UPDATE pockets SET allocated_budget = allocated_budget + ABS(v_amount) WHERE id = (v_metadata->>'from_id')::UUID AND user_id = p_user_id;
  ELSIF v_type IS DISTINCT FROM 'internal_transfer_out' AND v_type IS DISTINCT FROM 'internal_transfer_in' THEN
    SELECT id INTO v_pocket_id
    FROM pockets
    WHERE user_id = p_user_id AND category = v_category
    LIMIT 1;

    -- Fallback: usar el bolsillo libre (is_default_free) en lugar de hardcodear 'Otros'
    IF v_pocket_id IS NULL THEN
      SELECT id INTO v_pocket_id
      FROM pockets
      WHERE user_id = p_user_id AND is_default_free = true
      LIMIT 1;
    END IF;
  END IF;

  -- 1. DELETE TRANSACTION
  DELETE FROM transactions WHERE id = p_tx_id;

  IF v_type = 'internal_transfer_out' THEN
     DELETE FROM transactions WHERE user_id = p_user_id AND cycle_id = v_cycle_id AND category = 'Traslado' AND metadata->>'type' = 'internal_transfer_in' AND metadata->>'from_id' = v_metadata->>'from_id' AND metadata->>'to_id' = v_metadata->>'to_id';
  ELSIF v_type = 'internal_transfer_in' THEN
     DELETE FROM transactions WHERE user_id = p_user_id AND cycle_id = v_cycle_id AND category = 'Traslado' AND metadata->>'type' = 'internal_transfer_out' AND metadata->>'from_id' = v_metadata->>'from_id' AND metadata->>'to_id' = v_metadata->>'to_id';
  END IF;

  -- 2. CYCLE UNDO LOGIC
  IF v_category = 'Ingreso' THEN
    SELECT count(*) INTO v_tx_count FROM transactions WHERE cycle_id = v_cycle_id;
    IF v_tx_count = 0 THEN
      DELETE FROM user_budget_cycles WHERE id = v_cycle_id AND user_id = p_user_id;
      v_cycle_deleted := true;
      
      SELECT id INTO v_prev_cycle 
      FROM user_budget_cycles 
      WHERE user_id = p_user_id AND user_closed = true 
      ORDER BY start_date DESC LIMIT 1;
      
      IF v_prev_cycle IS NOT NULL THEN
        UPDATE user_budget_cycles SET end_date = NULL, user_closed = false WHERE id = v_prev_cycle;
        
        SELECT pockets_snapshot INTO v_snapshot 
        FROM monthly_closures 
        WHERE user_id = p_user_id 
        ORDER BY closed_at DESC LIMIT 1;
        
        IF v_snapshot IS NOT NULL THEN
          FOR v_snap_item IN SELECT * FROM jsonb_array_elements(v_snapshot)
          LOOP
            UPDATE pockets 
            SET allocated_budget = COALESCE((v_snap_item->>'allocated_budget')::NUMERIC, 0)
            WHERE id = (v_snap_item->>'id')::UUID;
          END LOOP;
        END IF;
        
        DELETE FROM monthly_closures 
        WHERE id = (SELECT id FROM monthly_closures WHERE user_id = p_user_id ORDER BY closed_at DESC LIMIT 1);
        
        v_cycle_reverted := true;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'cycle_reverted', v_cycle_reverted, 'cycle_deleted', v_cycle_deleted);
END;
$function$;
