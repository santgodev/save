-- 20260505000002_hybrid_income_rules.sql
-- Implementación del Modelo Híbrido Inteligente (Montos Fijos + Porcentajes + Prioridades)
-- Inspirado en arquitectura Fintech Premium (YNAB/Revolut)

-- =====================================================================
-- 1. Actualización de confirm_pending_income
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
    v_rule JSONB;
    v_dist_amount NUMERIC;
    v_remaining NUMERIC;
    v_distribution JSONB := '{}'::jsonb;
    v_key TEXT;
    v_pct NUMERIC;
    v_res JSONB;
BEGIN
    -- 🔒 Seguridad y Bloqueo
    SELECT * INTO v_event
    FROM pending_income_events
    WHERE id = p_event_id AND user_id = auth.uid()
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Evento no encontrado' USING ERRCODE = 'P0002';
    END IF;

    IF v_event.status = 'confirmed' THEN
        RETURN jsonb_build_object('success', true, 'already_processed', true);
    END IF;

    IF p_actual_amount <= 0 THEN
        RAISE EXCEPTION 'El monto debe ser positivo' USING ERRCODE = '22023';
    END IF;

    v_rules := v_event.distribution_snapshot->'distribution';
    v_remaining := p_actual_amount;

    -- 🧠 Lógica Híbrida (Nueva Arquitectura: Array de Reglas con Prioridad)
    IF jsonb_typeof(v_rules) = 'array' THEN
        -- Se asume que el array ya viene ordenado por prioridad desde el cliente
        FOR v_rule IN SELECT * FROM jsonb_array_elements(v_rules)
        LOOP
            IF v_remaining <= 0 THEN
                v_dist_amount := 0;
            ELSIF (v_rule->>'type') = 'fixed' THEN
                v_dist_amount := LEAST(v_remaining, (v_rule->>'value')::NUMERIC);
            ELSIF (v_rule->>'type') = 'percentage' THEN
                -- El porcentaje se aplica sobre lo QUE QUEDA (cascada inteligente)
                v_dist_amount := ROUND(v_remaining * ((v_rule->>'value')::NUMERIC / 100.0), 2);
            ELSE
                v_dist_amount := 0;
            END IF;

            -- Acumular distribución
            v_distribution := v_distribution || jsonb_build_object(v_rule->>'pocket_id', v_dist_amount);
            v_remaining := v_remaining - v_dist_amount;
        END LOOP;

    -- 🕰️ Compatibilidad con Modelo Antiguo (Objeto de Porcentajes)
    ELSIF jsonb_typeof(v_rules) = 'object' THEN
        FOR v_key IN SELECT key FROM jsonb_each_text(v_rules)
        LOOP
            v_pct := (v_rules ->> v_key)::NUMERIC;
            v_dist_amount := ROUND(p_actual_amount * (v_pct / 100.0), 2);
            v_distribution := v_distribution || jsonb_build_object(v_key, v_dist_amount);
        END LOOP;
    ELSE
        RAISE EXCEPTION 'Formato de reglas no soportado (%)', jsonb_typeof(v_rules);
    END IF;

    -- 🚀 Ejecutar Registro
    -- register_income se encarga de crear la transacción y repartir el sobrante al bolsillo "Libre"
    SELECT register_income(auth.uid(), p_actual_amount, v_distribution) INTO v_res;

    -- 📝 Actualizar Estado
    UPDATE pending_income_events
    SET status = 'confirmed',
        transaction_id = (v_res->>'transaction_id')::UUID,
        updated_at = NOW()
    WHERE id = p_event_id;

    -- 🪵 Log de Auditoría
    INSERT INTO income_event_logs (event_id, action, amount, metadata)
    VALUES (
        p_event_id,
        'confirmed',
        p_actual_amount,
        jsonb_build_object(
            'rules_type', jsonb_typeof(v_rules),
            'actual', p_actual_amount,
            'distribution', v_distribution,
            'remainder_to_free', p_actual_amount - (SELECT SUM((val)::numeric) FROM jsonb_each_text(v_distribution) as t(key, val))
        )
    );

    RETURN v_res;
END;
$$;

COMMENT ON FUNCTION public.confirm_pending_income(UUID, NUMERIC) IS 
'Confirma un ingreso pendiente aplicando el modelo híbrido de cascada inteligente (Fijos -> Porcentajes -> Sobrante al Libre).';
